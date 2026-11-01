/*
 * TELEGRAM BOT (student access)
 *
 * An extra way in next to the website. It calls the SAME server code as the site
 * (login, signup, PIN reset, voting, applications, results), so every existing
 * protection (PIN lockouts, one vote per student, anonymous ballots, rate limits)
 * applies here too.
 *
 * Setup (see SECURITY-REVIEW.md, section 9):
 *   TELEGRAM_BOT_TOKEN       from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET  any long random string; sent to Telegram with setWebhook
 *                            and checked on every request (Telegram sends it back
 *                            in the x-telegram-bot-api-secret-token header)
 *
 * Safety rules:
 *  - Only requests carrying the webhook secret are accepted.
 *  - Private chats only.
 *  - PIN messages are deleted immediately and a PIN is NEVER stored (a first PIN
 *    entry is kept only as a salted hash so the confirmation can be compared).
 *  - A chat stays "logged in" for 12 hours, and a student can be linked to only
 *    ONE Telegram chat at a time (a newer login unlinks the older chat).
 *  - Brute-force limits use the Telegram chat as the "caller" (tg-<chatId>).
 *  - Conversation state lives in the server-only collections telegramSessions
 *    and telegramLinks (Firestore rules deny all client access to them).
 *  - Replies are plain text (no formatting), so names can never inject markup.
 *  - Button presses are checked against the saved conversation, so stale or
 *    forged buttons do nothing. The server re-validates every vote anyway.
 */
const admin = require("firebase-admin");
const crypto = require("crypto");
const guard = require("./_lib/guard");
const forms = require("./_lib/forms");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        })
    });
}

const db = admin.firestore();
const { logError } = guard;

const studentLogin = require("./student-login");
const sendSignupCode = require("./send-verification-code");
const verifySignupCode = require("./verify-email-code");
const completeSignup = require("./complete-student-signup");
const sendResetCode = require("./send-pin-reset-code");
const verifyResetCode = require("./verify-pin-reset-code");
const resetPin = require("./reset-student-pin");
const { castVote } = require("./cast-vote");
const { loadOffers } = require("./get-form-offers");
const { applyForStudent } = require("./apply-for-position");
const { getResults } = require("./get-election-results");

const LINK_TTL_MS = 12 * 60 * 60 * 1000;
const STEP_TTL_MS = 30 * 60 * 1000;
const MAX_TEXT = 4000;

/* ---------------- Telegram API ---------------- */

async function tg(method, payload) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return response.ok ? await response.json().catch(() => null) : null;
    } catch (error) {
        logError("Telegram API error (" + method + ")", error);
        return null;
    }
}

function chunkText(text) {
    const parts = [];
    let rest = String(text);
    while (rest.length > 3800) {
        let cut = rest.lastIndexOf("\n", 3800);
        if (cut < 1000) cut = 3800;
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut);
    }
    parts.push(rest);
    return parts;
}

/** rows = [[{ text, data }]] -> Telegram inline keyboard */
async function send(chatId, text, rows) {
    const parts = chunkText(text);
    for (let i = 0; i < parts.length; i++) {
        const payload = { chat_id: chatId, text: parts[i], disable_web_page_preview: true };
        if (rows && i === parts.length - 1) {
            payload.reply_markup = {
                inline_keyboard: rows.map(row => row.map(button => (button.url
                    ? { text: button.text, url: button.url }
                    : { text: button.text, callback_data: button.data })))
            };
        }
        await tg("sendMessage", payload);
    }
}

const dropMessage = (chatId, messageId) => messageId && tg("deleteMessage", { chat_id: chatId, message_id: messageId });
const clearButtons = (chatId, messageId) =>
    messageId && tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });

/* ---------------- Sessions + links ---------------- */

const sessionRef = chatId => db.collection("telegramSessions").doc(String(chatId));
const linkRef = studentDocumentId => db.collection("telegramLinks").doc(studentDocumentId);

async function loadSession(chatId) {
    const snap = await sessionRef(chatId).get();
    const data = snap.exists ? snap.data() : {};
    return {
        step: data.step || "idle",
        stepAt: data.stepAt || 0,
        data: data.data || {},
        link: data.link || null,
        lastUpdateId: data.lastUpdateId || 0
    };
}

async function saveSession(chatId, session) {
    await sessionRef(chatId).set({ ...session, updatedAt: Date.now() });
}

function setStep(session, step, data) {
    session.step = step;
    session.stepAt = Date.now();
    if (data !== undefined) session.data = data;
}

/** The linked student of this chat, or null (expired, logged out, or taken over by a newer login). */
async function currentLink(session, chatId) {
    const link = session.link;
    if (!link) return null;
    if (Date.now() > link.expiresAt) { session.link = null; return null; }
    const snap = await linkRef(link.studentDocumentId).get();
    if (!snap.exists || String(snap.data().chatId) !== String(chatId)) { session.link = null; return null; }
    return link;
}

/* ---------------- Calling the site's own functions ---------------- */

async function callFn(module, chatId, body) {
    const response = await module.handler({
        httpMethod: "POST",
        headers: { "x-nf-client-connection-ip": `tg-${chatId}`, "content-type": "application/json" },
        body: JSON.stringify(body)
    });
    let data = {};
    try { data = JSON.parse(response.body); } catch { /* keep empty */ }
    return { http: response.statusCode, data };
}

const syntheticEvent = (chatId, body) => ({
    httpMethod: "POST",
    headers: { "x-nf-client-connection-ip": `tg-${chatId}`, "content-type": "application/json" },
    body: JSON.stringify(body)
});

/* ---------------- Small helpers ---------------- */

const isPin = text => /^\d{4}$/.test(text);
const cleanLine = (text, max = 200) => String(text || "").trim().slice(0, max);
const toMs = value => (value && value.toDate ? value.toDate().getTime() : new Date(value).getTime());

function formatTime(ms) {
    try {
        return new Date(ms).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
    } catch {
        return new Date(ms).toISOString();
    }
}

function pinFingerprint(pin, salt) {
    return crypto.createHash("sha256").update(salt + ":" + pin).digest("hex");
}

function pinHolder(pin) {
    const salt = crypto.randomBytes(8).toString("hex");
    return { salt, hash: pinFingerprint(pin, salt) };
}

function pinMatchesHolder(pin, holder) {
    if (!holder) return false;
    const a = Buffer.from(pinFingerprint(pin, holder.salt));
    const b = Buffer.from(String(holder.hash));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function electionState(election, now = Date.now()) {
    const start = toMs(election.startAt);
    const end = toMs(election.endAt);
    if (now < start) return "upcoming";
    if (now >= end) return "ended";
    return "open";
}

async function publishedElections() {
    const snap = await db.collection("elections").where("status", "==", "published").get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

const voterId = (electionId, matricNumber) =>
    `${electionId}_${String(matricNumber).trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

async function loadCandidates(electionId) {
    const snap = await db.collection("candidates")
        .where("electionId", "==", electionId)
        .where("status", "==", "active")
        .orderBy("createdAt", "asc")
        .get();
    const byPosition = new Map();
    snap.docs.forEach(doc => {
        const candidate = doc.data();
        const position = String(candidate.position || "General");
        if (!byPosition.has(position)) byPosition.set(position, []);
        byPosition.get(position).push({ id: doc.id, name: String(candidate.name || "Unnamed Candidate") });
    });
    return [...byPosition.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, cands]) => ({ name, cands }));
}

const LOGIN_HINT = "Please log in first with /login.";
const LOGIN_ROWS = [[{ text: "\u{1F510} Login", data: "m:login" }, { text: "\u{1F195} Sign up", data: "m:signup" }]];

const HELP = [
    "NUNSA-FUD voting bot. Commands:",
    "",
    "/login - log in with your registration number and PIN",
    "/signup - create your account",
    "/forgotpin - reset your PIN",
    "/elections - see current elections",
    "/candidates - see the candidates",
    "/apply - apply to run for a position",
    "/mystatus - check your application",
    "/vote - cast your vote",
    "/myvote - check whether you have voted",
    "/results - see results of finished elections",
    "/logout - log out of this chat",
    "/cancel - stop what you are doing"
].join("\n");

/* ---------------- Tap-through menu ---------------- */

/**
 * The voting Mini App (the website opened inside Telegram). This is the direct link made in
 * BotFather with /newapp. Override with the Netlify env var TELEGRAM_APP_LINK if it ever changes.
 */
const DEFAULT_APP_LINK = "https://t.me/nunsafud_bot/voting_app";

function appLink() {
    const link = String(process.env.TELEGRAM_APP_LINK || DEFAULT_APP_LINK).trim();
    return link.startsWith("https://t.me/") ? link : DEFAULT_APP_LINK;
}

const BACK_ROW = [[{ text: "\u{1F3E0} Menu", data: "m:menu" }]];

function mainMenuRows(loggedIn) {
    const rows = loggedIn
        ? [
            [{ text: "\u{1F5F3} Vote", data: "m:vote" }, { text: "\u{1F465} Candidates", data: "m:candidates" }],
            [{ text: "\u{1F4CA} Results", data: "m:results" }, { text: "\u{1F4C5} Elections", data: "m:elections" }],
            [{ text: "\u{1F4DD} Apply", data: "m:apply" }, { text: "\u{1F4CC} My status", data: "m:mystatus" }],
            [{ text: "\u2705 My vote", data: "m:myvote" }]
        ]
        : [
            [{ text: "\u{1F510} Login", data: "m:login" }, { text: "\u{1F195} Sign up", data: "m:signup" }],
            [{ text: "\u{1F511} Forgot PIN", data: "m:forgotpin" }]
        ];
    const last = [];
    last.push({ text: "\u{1F4F1} Open app", url: appLink() });
    if (loggedIn) last.push({ text: "\u{1F6AA} Log out", data: "m:logout" });
    if (last.length) rows.push(last);
    return rows;
}

/* ---------------- Entry point ---------------- */

function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
    const given = event.headers["x-telegram-bot-api-secret-token"] || event.headers["X-Telegram-Bot-Api-Secret-Token"] || "";
    if (!secret || !safeEqual(secret, given)) return { statusCode: 401, body: "Unauthorized" };

    let update;
    try { update = JSON.parse(event.body || "{}"); } catch { return { statusCode: 200, body: "ok" }; }

    try {
        await handleUpdate(update);
    } catch (error) {
        logError("Telegram bot error", error);
    }
    return { statusCode: 200, body: "ok" }; // always 200 so Telegram does not retry forever
};

async function handleUpdate(update) {
    const message = update.message;
    const callback = update.callback_query;
    const chat = message ? message.chat : callback && callback.message && callback.message.chat;

    if (!chat || chat.type !== "private") {
        if (callback) await tg("answerCallbackQuery", { callback_query_id: callback.id });
        if (chat && message && typeof message.text === "string" && message.text.startsWith("/")) {
            await send(chat.id, "Please message me privately to use this bot.");
        }
        return;
    }

    const chatId = chat.id;
    const limited = await guard.consume(`tg-msg:${chatId}`, 40, 60 * 1000);
    if (!limited.allowed) {
        if (callback) await tg("answerCallbackQuery", { callback_query_id: callback.id });
        return;
    }

    const session = await loadSession(chatId);
    if (typeof update.update_id === "number") {
        if (update.update_id <= session.lastUpdateId) return; // Telegram retry: already handled
        session.lastUpdateId = update.update_id;
    }
    if (session.step !== "idle" && Date.now() - session.stepAt > STEP_TTL_MS) setStep(session, "idle", {});

    try {
        if (callback) {
            await tg("answerCallbackQuery", { callback_query_id: callback.id });
            await onButton(chatId, session, String(callback.data || ""), callback.message.message_id);
        } else if (message && typeof message.text === "string") {
            await onText(chatId, session, message.text.slice(0, MAX_TEXT), message.message_id);
        }
    } catch (error) {
        logError("Telegram update failed", error);
        await send(chatId, "Something went wrong. Please try again.");
    } finally {
        await saveSession(chatId, session);
    }
}

/* ---------------- Text + commands ---------------- */

async function onText(chatId, session, text, messageId) {
    const trimmed = text.trim();

    if (trimmed.startsWith("/")) {
        const command = trimmed.slice(1).split(/\s+/)[0].split("@")[0].toLowerCase();
        return onCommand(chatId, session, command);
    }

    switch (session.step) {
        case "login_matric":
            setStep(session, "login_pin", { matric: cleanLine(trimmed, 40) });
            return send(chatId, "Now send your 4-digit PIN. I will delete your message right away.");

        case "login_pin": {
            await dropMessage(chatId, messageId);
            if (!isPin(trimmed)) return send(chatId, "Your PIN is 4 digits. Send it again, or /cancel.");
            const matric = session.data.matric;
            setStep(session, "idle", {});
            const { http, data } = await callFn(studentLogin, chatId, { matricNumber: matric, pin: trimmed });
            if (http !== 200 || !data.success) {
                return send(chatId, (data.message || "Login failed.") + "\nTry /login again.");
            }
            const studentDocumentId = String(data.studentDocumentId);
            session.link = {
                studentDocumentId,
                matricNumber: String(data.matricNumber || matric),
                expiresAt: Date.now() + LINK_TTL_MS
            };
            // A student can be logged in on ONE Telegram chat only: this replaces any older link.
            await linkRef(studentDocumentId).set({ chatId: String(chatId), linkedAt: Date.now() });
            return send(chatId, "Logged in. You stay logged in on this chat for 12 hours.\nWhat would you like to do?", mainMenuRows(true));
        }

        case "signup_matric":
            setStep(session, "signup_email", { matric: cleanLine(trimmed, 40) });
            return send(chatId, "Send your own e-mail address. I will e-mail you a 6-digit code.");

        case "signup_email": {
            const email = cleanLine(trimmed, 254).toLowerCase();
            const { http, data } = await callFn(sendSignupCode, chatId, { matricNumber: session.data.matric, email });
            if (http !== 200 || !data.success) {
                setStep(session, "idle", {});
                return send(chatId, (data.message || "Could not send the code.") + "\nUse /signup to try again.");
            }
            setStep(session, "signup_code", { matric: session.data.matric, email });
            return send(chatId, (data.message || "A 6-digit code was sent to your e-mail.") + "\nSend the code here.");
        }

        case "signup_code": {
            const code = trimmed.replace(/\s+/g, "");
            const { http, data } = await callFn(verifySignupCode, chatId, { matricNumber: session.data.matric, email: session.data.email, code });
            if (http !== 200 || !data.success) {
                if (![400, 401].includes(http)) setStep(session, "idle", {});
                return send(chatId, (data.message || "That code did not work.") + (session.step === "idle" ? "\nUse /signup to start again." : "\nTry again, or /cancel."));
            }
            setStep(session, "signup_pin", { matric: session.data.matric, email: session.data.email });
            return send(chatId, "E-mail verified. Now choose a 4-digit PIN and send it. I will delete your message right away.");
        }

        case "signup_pin":
        case "reset_pin": {
            await dropMessage(chatId, messageId);
            if (!isPin(trimmed)) return send(chatId, "Your PIN must be exactly 4 digits. Send it again, or /cancel.");
            const next = session.step === "signup_pin" ? "signup_pin2" : "reset_pin2";
            setStep(session, next, { ...session.data, pinCheck: pinHolder(trimmed) });
            return send(chatId, "Send the same PIN again to confirm.");
        }

        case "signup_pin2": {
            await dropMessage(chatId, messageId);
            if (!pinMatchesHolder(trimmed, session.data.pinCheck)) {
                setStep(session, "signup_pin", { matric: session.data.matric, email: session.data.email });
                return send(chatId, "The PINs did not match. Send a new 4-digit PIN.");
            }
            const { matric, email } = session.data;
            setStep(session, "idle", {});
            const { http, data } = await callFn(completeSignup, chatId, { matricNumber: matric, email, pin: trimmed });
            if (http !== 200 || !data.success) return send(chatId, (data.message || "Could not create your account.") + "\nUse /signup to try again.");
            return send(chatId, "Your account is ready. Tap Login to continue.", [[{ text: "\u{1F510} Login", data: "m:login" }]]);
        }

        case "reset_matric": {
            const matric = cleanLine(trimmed, 40);
            const { http, data } = await callFn(sendResetCode, chatId, { matricNumber: matric });
            if (http === 429 || http >= 500) {
                setStep(session, "idle", {});
                return send(chatId, (data.message || "Please try again later."));
            }
            setStep(session, "reset_code", { matric });
            return send(chatId, (data.message || "If this registration number has an account, a 6-digit code was sent to the e-mail used at signup.") + "\nSend the code here.");
        }

        case "reset_code": {
            const code = trimmed.replace(/\s+/g, "");
            const { http, data } = await callFn(verifyResetCode, chatId, { matricNumber: session.data.matric, code });
            if (http !== 200 || !data.success) {
                if (![400, 401].includes(http)) setStep(session, "idle", {});
                return send(chatId, (data.message || "That code did not work.") + (session.step === "idle" ? "\nUse /forgotpin to start again." : "\nTry again, or /cancel."));
            }
            setStep(session, "reset_pin", { matric: session.data.matric, code });
            return send(chatId, "Code accepted. Send your new 4-digit PIN. I will delete your message right away.");
        }

        case "reset_pin2": {
            await dropMessage(chatId, messageId);
            if (!pinMatchesHolder(trimmed, session.data.pinCheck)) {
                setStep(session, "reset_pin", { matric: session.data.matric, code: session.data.code });
                return send(chatId, "The PINs did not match. Send your new 4-digit PIN again.");
            }
            const { matric, code } = session.data;
            setStep(session, "idle", {});
            const { http, data } = await callFn(resetPin, chatId, { matricNumber: matric, code, newPin: trimmed });
            if (http !== 200 || !data.success) return send(chatId, (data.message || "Could not reset your PIN.") + "\nUse /forgotpin to try again.");
            return send(chatId, "Your PIN was changed. Tap Login to continue.", [[{ text: "\u{1F510} Login", data: "m:login" }]]);
        }

        case "vote_pin": {
            await dropMessage(chatId, messageId);
            if (!isPin(trimmed)) return send(chatId, "Your PIN is 4 digits. Send it again, or /cancel.");
            return submitVote(chatId, session, trimmed);
        }

        default:
            return send(chatId, "I did not understand that. Type /help to see the commands.");
    }
}

async function onCommand(chatId, session, command) {
    // Any command abandons a half-finished step.
    setStep(session, "idle", {});

    switch (command) {
        case "start":
        case "menu": {
            const loggedIn = !!(await currentLink(session, chatId));
            return send(chatId, (command === "start" ? "Welcome to the NUNSA-FUD voting bot.\n\n" : "") + "What would you like to do?", mainMenuRows(loggedIn));
        }
        case "help":
            return send(chatId, HELP + "\n/menu - show the buttons", mainMenuRows(!!(await currentLink(session, chatId))));
        case "cancel":
            return send(chatId, "Cancelled. Type /help to see the commands.");
        case "login":
            setStep(session, "login_matric", {});
            return send(chatId, "Send your registration number.");
        case "signup":
            setStep(session, "signup_matric", {});
            return send(chatId, "Let's create your account. Send your registration number.");
        case "forgotpin":
            setStep(session, "reset_matric", {});
            return send(chatId, "Send your registration number. A 6-digit code will be e-mailed to the address you used at signup.");
        case "logout": {
            if (session.link) await linkRef(session.link.studentDocumentId).delete().catch(() => {});
            session.link = null;
            return send(chatId, "You are logged out.");
        }
    }

    const known = ["elections", "candidates", "apply", "mystatus", "vote", "myvote", "results"];
    if (!known.includes(command)) return send(chatId, "I do not know that command. Type /help.");

    const link = await currentLink(session, chatId);
    if (!link) return send(chatId, LOGIN_HINT, LOGIN_ROWS);
    const student = await forms.loadStudentByDocId(db, link.studentDocumentId);
    if (!student) { session.link = null; return send(chatId, LOGIN_HINT, LOGIN_ROWS); }

    switch (command) {
        case "elections": return showElections(chatId, student);
        case "candidates": return pickElection(chatId, session, "cl", "Which election's candidates do you want to see?");
        case "apply": return startApply(chatId, session, student);
        case "mystatus": return showStatus(chatId, student);
        case "vote": return startVote(chatId, session, student);
        case "myvote": return showMyVote(chatId, student);
        case "results": return pickElection(chatId, session, "rs", "Which election's results do you want to see?");
    }
}

/* ---------------- Information commands ---------------- */

async function showElections(chatId, student) {
    const lines = [];
    const elections = await publishedElections();
    elections.sort((a, b) => toMs(a.startAt) - toMs(b.startAt));
    elections.forEach(election => {
        const state = electionState(election);
        const when = state === "upcoming" ? `opens ${formatTime(toMs(election.startAt))}`
            : state === "open" ? `voting open, closes ${formatTime(toMs(election.endAt))}`
            : `ended ${formatTime(toMs(election.endAt))}`;
        lines.push(`- ${election.title || "Election"}: ${when}`);
    });
    const { offers } = await loadOffers(student);
    offers.forEach(offer => lines.push(`- ${offer.title || "Election"}: applications are open (/apply)`));

    return send(chatId, lines.length ? "Elections:\n" + lines.join("\n") : "There are no elections right now.", BACK_ROW);
}

/** Ask which election, like the website does. kind: "cl" (candidates) or "rs" (results). */
async function pickElection(chatId, session, kind, question) {
    const elections = (await publishedElections())
        .sort((a, b) => toMs(b.startAt) - toMs(a.startAt))
        .slice(0, 10);
    if (!elections.length) return send(chatId, "There are no elections yet.");

    const list = elections.map(election => ({
        id: election.id,
        title: String(election.title || "Election"),
        state: electionState(election)
    }));
    setStep(session, "idle", { pick: { kind, list } });
    const rows = list.map((election, index) => [{ text: `${election.title} (${election.state})`, data: `${kind}:${index}` }]);
    rows.push([{ text: "Cancel", data: "ax" }]);
    return send(chatId, question, rows);
}

async function showCandidatesFor(chatId, choice) {
    const positions = await loadCandidates(choice.id);
    const lines = [choice.title, ""];
    if (!positions.length) lines.push("No candidates yet.");
    positions.forEach(position => {
        lines.push(position.name + ":");
        position.cands.forEach(candidate => lines.push("  - " + candidate.name));
        lines.push("");
    });
    return send(chatId, lines.join("\n").trim(), BACK_ROW);
}

async function showStatus(chatId, student) {
    const { applications } = await loadOffers(student);
    if (!applications.length) return send(chatId, "You have not applied for any position. Use /apply when applications are open.");
    const lines = applications.map(application => {
        const label = application.status === "applied"
            ? "applied - you are a candidate unless the admins disqualify you after screening"
            : application.status === "disqualified"
                ? "disqualified" + (application.disqualifiedReason ? " (" + application.disqualifiedReason + ")" : "")
                : application.status;
        return `- ${application.position} (${application.electionTitle || "Election"}): ${label}`;
    });
    return send(chatId, "Your applications:\n" + lines.join("\n"), BACK_ROW);
}

async function showMyVote(chatId, student) {
    const elections = await publishedElections();
    const lines = [];
    for (const election of elections) {
        const id = voterId(election.id, student.matricNumber);
        const voter = await db.collection("voters").doc(id).get();
        if (!voter.exists) continue;
        const vote = await db.collection("votes").doc(id).get();
        lines.push(vote.exists
            ? `- ${election.title}: you have voted. Receipt: ${vote.data().receiptCode || "n/a"}`
            : `- ${election.title}: you have not voted yet`);
    }
    return send(chatId, lines.length ? "Your voting status:\n" + lines.join("\n") : "You are not on the voter list of any election.", BACK_ROW);
}

async function showResultsFor(chatId, choice) {
    const snap = await db.collection("elections").doc(choice.id).get();
    if (!snap.exists || snap.data().status !== "published") return send(chatId, "That election is no longer available.");
    const election = snap.data();
    const state = electionState(election);

    if (state === "upcoming") return send(chatId, `${choice.title}: voting has not started yet, so there are no results.`);
    if (state === "open") return send(chatId, `${choice.title}: voting is still open. Results will be available after it closes (${formatTime(toMs(election.endAt))}).`);

    const response = await getResults({ httpMethod: "GET", headers: {}, queryStringParameters: { id: choice.id } });
    let data = {};
    try { data = JSON.parse(response.body); } catch { /* empty */ }
    if (response.statusCode !== 200 || !Array.isArray(data.positions)) {
        return send(chatId, `${choice.title}: results are not available yet.`);
    }
    const lines = [`${choice.title} - results`, ""];
    data.positions.forEach(position => {
        lines.push(`${position.position} (${position.totalVotes} vote(s))`);
        position.candidates.forEach((candidate, index) => {
            lines.push(`  ${index + 1}. ${candidate.name}: ${candidate.votes} (${candidate.percentage}%)`);
        });
        lines.push("");
    });
    return send(chatId, lines.join("\n").trim(), BACK_ROW);
}

/* ---------------- Applying ---------------- */

async function startApply(chatId, session, student) {
    const { offers, applications } = await loadOffers(student);
    const open = offers.filter(offer => !applications.some(application => application.electionId === offer.electionId));
    if (!open.length) {
        return send(chatId, applications.length
            ? "You have already applied in the open election. Use /mystatus to check."
            : "No applications are open right now.");
    }
    const offer = open[0];
    setStep(session, "idle", { apply: { electionId: offer.electionId, title: offer.title, positions: offer.positions.map(p => ({ id: p.id, name: p.position })) } });
    const rows = offer.positions.map((position, index) => [{ text: position.position, data: `ap:${index}` }]);
    rows.push([{ text: "Cancel", data: "ax" }]);
    return send(chatId, `${offer.title || "Election"}\nWhich position do you want to apply for? You can apply for only one. The admins will check that you qualify.`, rows);
}

/* ---------------- Voting ---------------- */

async function eligibleElections(student) {
    const open = (await publishedElections()).filter(election => electionState(election) === "open");
    const eligible = [];
    for (const election of open) {
        const id = voterId(election.id, student.matricNumber);
        const voter = await db.collection("voters").doc(id).get();
        if (!voter.exists || voter.data().status !== "active") continue;
        const vote = await db.collection("votes").doc(id).get();
        if (!vote.exists) eligible.push(election);
    }
    return eligible;
}

async function startVote(chatId, session, student) {
    const eligible = await eligibleElections(student);
    if (!eligible.length) {
        return send(chatId, "There is no election open for you to vote in right now. You may have already voted (/myvote) or you are not on the voter list.");
    }
    if (eligible.length > 1) {
        setStep(session, "idle", { choose: eligible.map(e => ({ id: e.id, title: String(e.title || "Election") })) });
        const rows = eligible.map((election, index) => [{ text: String(election.title || "Election"), data: `ve:${index}` }]);
        rows.push([{ text: "Cancel", data: "bx" }]);
        return send(chatId, "Which election do you want to vote in?", rows);
    }
    return beginBallot(chatId, session, eligible[0].id, String(eligible[0].title || "Election"));
}

async function beginBallot(chatId, session, electionId, title) {
    const positions = await loadCandidates(electionId);
    if (!positions.length) {
        setStep(session, "idle", {});
        return send(chatId, "This election has no candidates yet.");
    }
    setStep(session, "idle", { ballot: { electionId, title, positions, i: 0, picks: {} } });
    return askPosition(chatId, session);
}

function askPosition(chatId, session) {
    const ballot = session.data.ballot;
    const position = ballot.positions[ballot.i];
    const rows = position.cands.map((candidate, index) => [{ text: candidate.name, data: `bp:${ballot.i}:${index}` }]);
    const nav = [];
    if (ballot.i > 0) nav.push({ text: "Back", data: "bb" });
    nav.push({ text: "Cancel", data: "bx" });
    rows.push(nav);
    return send(chatId, `${ballot.title}\nPosition ${ballot.i + 1} of ${ballot.positions.length}: ${position.name}\nChoose one candidate:`, rows);
}

function askConfirm(chatId, session) {
    const ballot = session.data.ballot;
    const lines = ballot.positions.map((position, index) => `${position.name}: ${position.cands[ballot.picks[index]].name}`);
    return send(chatId, `Your choices:\n${lines.join("\n")}\n\nYou cannot change your vote after you confirm.`, [
        [{ text: "Confirm and enter PIN", data: "bc" }],
        [{ text: "Start over", data: "bs" }, { text: "Cancel", data: "bx" }]
    ]);
}

async function submitVote(chatId, session, pin) {
    const link = await currentLink(session, chatId);
    const ballot = session.data.ballot;
    if (!link || !ballot) { setStep(session, "idle", {}); return send(chatId, LOGIN_HINT); }
    const student = await forms.loadStudentByDocId(db, link.studentDocumentId);
    if (!student) { setStep(session, "idle", {}); return send(chatId, LOGIN_HINT); }

    const selections = ballot.positions.map((position, index) => ({
        position: position.name,
        candidateId: position.cands[ballot.picks[index]].id
    }));

    const response = await castVote(
        syntheticEvent(chatId, { electionId: ballot.electionId, matricNumber: student.matricNumber, pin, selections }),
        { uid: student.uid }
    );
    let data = {};
    try { data = JSON.parse(response.body); } catch { /* empty */ }

    if (response.statusCode === 200 && data.success) {
        setStep(session, "idle", {});
        return send(chatId, `Your vote has been recorded.\nReceipt code: ${data.receiptCode}\nKeep it as proof that you voted. It does not show who you voted for.`, BACK_ROW);
    }
    if (response.statusCode === 409) { setStep(session, "idle", {}); return send(chatId, data.message || "You have already voted."); }
    if (response.statusCode === 403 && /pin/i.test(String(data.message))) {
        return send(chatId, (data.message || "Incorrect PIN.") + "\nSend your PIN again, or /cancel.");
    }
    setStep(session, "idle", {});
    return send(chatId, (data.message || "Your vote could not be recorded.") + "\nUse /vote to try again.");
}

/* ---------------- Buttons ---------------- */

async function onButton(chatId, session, data, messageId) {
    await clearButtons(chatId, messageId);

    // Main-menu taps behave exactly like typing the command.
    if (data.startsWith("m:")) return onCommand(chatId, session, data.slice(2));

    const link = await currentLink(session, chatId);
    if (!link) return send(chatId, LOGIN_HINT);
    const student = await forms.loadStudentByDocId(db, link.studentDocumentId);
    if (!student) { session.link = null; return send(chatId, LOGIN_HINT); }

    const [kind, a, b] = data.split(":");
    const stale = () => send(chatId, "That button has expired. Please use the command again.");

    /* ----- applying ----- */
    if (kind === "ap") {
        const apply = session.data.apply;
        const position = apply && apply.positions[Number(a)];
        if (!position) return stale();
        session.data = { apply: { ...apply, chosen: Number(a) } };
        return send(chatId, `Apply for ${position.name}?\nYou can only apply once, and the admins will check that you qualify.`, [
            [{ text: "Yes, apply", data: "apy" }, { text: "No", data: "ax" }]
        ]);
    }
    if (kind === "apy") {
        const apply = session.data.apply;
        const position = apply && apply.chosen !== undefined && apply.positions[apply.chosen];
        if (!position) return stale();
        setStep(session, "idle", {});
        const result = await applyForStudent(student, apply.electionId, position.id);
        return send(chatId, result.error
            ? result.error[1]
            : `You have applied for ${result.position}. The admins will screen applicants before the election. Check /mystatus.`, BACK_ROW);
    }
    if (kind === "ax") { setStep(session, "idle", {}); return send(chatId, "Cancelled."); }

    /* ----- picking an election for candidates / results ----- */
    if (kind === "cl" || kind === "rs") {
        const pick = session.data.pick;
        const choice = pick && pick.kind === kind && pick.list[Number(a)];
        if (!choice) return stale();
        return kind === "cl" ? showCandidatesFor(chatId, choice) : showResultsFor(chatId, choice);
    }

    /* ----- voting ----- */
    if (kind === "ve") {
        const choice = session.data.choose && session.data.choose[Number(a)];
        if (!choice) return stale();
        const eligible = (await eligibleElections(student)).find(election => election.id === choice.id);
        if (!eligible) { setStep(session, "idle", {}); return send(chatId, "You can no longer vote in that election."); }
        return beginBallot(chatId, session, choice.id, choice.title);
    }

    const ballot = session.data.ballot;
    if (["bp", "bb", "bs", "bc", "bx"].includes(kind)) {
        if (kind === "bx") { setStep(session, "idle", {}); return send(chatId, "Voting cancelled. Nothing was recorded."); }
        if (!ballot) return stale();

        if (kind === "bp") {
            const positionIndex = Number(a);
            const candidateIndex = Number(b);
            const position = ballot.positions[positionIndex];
            if (positionIndex !== ballot.i || !position || !position.cands[candidateIndex]) return stale();
            ballot.picks[positionIndex] = candidateIndex;
            ballot.i += 1;
            session.data = { ballot };
            return ballot.i < ballot.positions.length ? askPosition(chatId, session) : askConfirm(chatId, session);
        }
        if (kind === "bb") {
            if (ballot.i < 1) return stale();
            ballot.i = Math.min(ballot.i, ballot.positions.length) - 1;
            delete ballot.picks[ballot.i];
            session.data = { ballot };
            return askPosition(chatId, session);
        }
        if (kind === "bs") {
            ballot.i = 0; ballot.picks = {};
            session.data = { ballot };
            return askPosition(chatId, session);
        }
        if (kind === "bc") {
            if (Object.keys(ballot.picks).length !== ballot.positions.length) return stale();
            setStep(session, "vote_pin", { ballot });
            return send(chatId, "Send your 4-digit PIN to cast your vote. I will delete your message right away. This cannot be undone.");
        }
    }

    return stale();
}
