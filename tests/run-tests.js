/*
 * Run with:  node tests/run-tests.js
 * Runs the REAL Netlify Function code against an in-memory Firestore stand-in
 * (tests/fake-firebase-admin.js). It does not touch Firebase or send e-mail.
 */
const Module = require("module");
const path = require("path");
const crypto = require("crypto");
const fake = require("./fake-firebase-admin");

const realLoad = Module._load;
Module._load = function (request, ...rest) {
    return request === "firebase-admin" ? fake : realLoad.call(this, request, ...rest);
};
process.env.FIREBASE_PROJECT_ID = "test";
process.env.FIREBASE_CLIENT_EMAIL = "test@test";
process.env.FIREBASE_PRIVATE_KEY = "test";
process.env.RESEND_API_KEY = "test";

const fn = name => require(path.join(__dirname, "..", "netlify", "functions", name));
const guard = fn("_lib/guard.js");
const store = fake.__store;
const Timestamp = fake.firestore.Timestamp;

/* ---------- tiny test runner ---------- */
let passed = 0, failed = 0;
const failures = [];
async function test(name, body) {
    fake.__reset();
    sentEmails.length = 0;
    try { await body(); passed++; console.log("  PASS  " + name); }
    catch (e) { failed++; failures.push(name); console.log("  FAIL  " + name + "\n        " + (e && e.message)); }
}
function ok(cond, message) { if (!cond) throw new Error(message || "assertion failed"); }
function eq(a, b, message) { if (a !== b) throw new Error((message || "not equal") + `: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }

const sentEmails = [];
global.fetch = async (url, opts) => { sentEmails.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };

let ipCounter = 0;
async function call(handlerFile, { method = "POST", body, token, ip = "1.1.1.1", query } = {}) {
    const headers = { "x-nf-client-connection-ip": ip };
    if (token) headers.authorization = "Bearer " + token;
    const res = await fn(handlerFile).handler({
        httpMethod: method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: query
    });
    return { status: res.statusCode, ...JSON.parse(res.body) };
}

/* ---------- fixtures ---------- */
const MATRIC = "FUD/21/001";
const DOC_ID = "FUD_21_001";
const PIN = "4821";

function seedStudent({ matric = MATRIC, docId = DOC_ID, email = "real.student@fud.edu.ng", withAccount = false, uid = "uid-" + docId } = {}) {
    store.set("students/" + docId, { matricNumber: matric, name: "Real Student", status: "active", ...(email ? { officialEmail: email } : {}) });
    store.set("studentAccess/" + docId, { matricNumber: matric, studentDocumentId: docId, active: true });
    if (withAccount) {
        const salt = crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(PIN, salt, 100000, 32, "sha256");
        store.set("studentAccounts/" + docId, {
            studentDocumentId: docId, matricNumber: matric, email: email || "x@x.com",
            pinHash: hash.toString("hex"), pinSalt: salt.toString("hex"), authUid: uid, active: true
        });
    }
}
function seedElection({ id = "E1", status = "published" } = {}) {
    const now = Date.now();
    store.set("elections/" + id, { title: "NUNSA 2026", status, startAt: Timestamp.fromMillis(now - 3600e3), endAt: Timestamp.fromMillis(now + 3600e3) });
    store.set("candidates/c1", { electionId: id, position: "President", name: "Ada", status: "active" });
    store.set("candidates/c2", { electionId: id, position: "President", name: "Bola", status: "active" });
    store.set("candidates/c3", { electionId: id, position: "Secretary", name: "Chi", status: "active" });
    store.set("candidates/c4", { electionId: id, position: "Secretary", name: "Dayo", status: "active" });
}
function seedVoter(matric, electionId = "E1") {
    store.set(`voters/${electionId}_${matric.replace(/[^A-Z0-9]/g, "")}`, { electionId, matricNumber: matric, status: "active" });
}
const BALLOT = [{ position: "President", candidateId: "c1" }, { position: "Secretary", candidateId: "c4" }];
function seedAdmins() {
    store.set("admins/super1", { role: "super_admin", active: true, email: "super@nunsa.org" });
    store.set("admins/admin1", { role: "admin", active: true, email: "admin@nunsa.org" });
}
const SUPER = "super1|super@nunsa.org";
const ADMIN = "admin1|admin@nunsa.org";

(async () => {
    console.log("\n== 6-digit e-mail codes (PIN stays 4 digits) ==");
    await test("generated codes are always exactly 6 digits", async () => {
        for (let i = 0; i < 3000; i++) ok(/^\d{6}$/.test(guard.generateEmailCode()), "bad code");
        ok(guard.isValidEmailCode("123456") && !guard.isValidEmailCode("1234") && !guard.isValidEmailCode("1234567") && !guard.isValidEmailCode("12345a"));
    });

    console.log("\n== Signup (old way: student types own e-mail) ==");
    await test("signup works with the student's own e-mail; codes are 6 digits, PIN is 4", async () => {
        seedStudent({ email: "" });
        let r = await call("send-verification-code.js", { body: { matricNumber: MATRIC, email: "me@gmail.com" } });
        eq(r.status, 200, r.message);
        eq(sentEmails[0].to[0], "me@gmail.com");
        const code = store.get("emailVerifications/" + DOC_ID).code;
        ok(/^\d{6}$/.test(code), "code is not 6 digits: " + code);
        r = await call("verify-email-code.js", { body: { matricNumber: MATRIC, email: "me@gmail.com", code: "1234" } });
        eq(r.status, 400, "4-digit code must be rejected");
        r = await call("verify-email-code.js", { body: { matricNumber: MATRIC, email: "me@gmail.com", code } });
        eq(r.status, 200, r.message);
        r = await call("complete-student-signup.js", { body: { matricNumber: MATRIC, email: "me@gmail.com", pin: "123" } });
        eq(r.status, 400, "3-digit PIN must be rejected");
        r = await call("complete-student-signup.js", { body: { matricNumber: MATRIC, email: "me@gmail.com", pin: "4821" } });
        eq(r.status, 200, r.message);
    });
    await test("PIN reset code is 6 digits; reset needs the 6-digit code and still a 4-digit PIN", async () => {
        seedStudent({ withAccount: true });
        let r = await call("send-pin-reset-code.js", { body: { matricNumber: MATRIC } });
        eq(r.status, 200, r.message);
        const code = store.get("pinResetCodes/" + DOC_ID).code;
        ok(/^\d{6}$/.test(code), "reset code not 6 digits");
        r = await call("verify-pin-reset-code.js", { body: { matricNumber: MATRIC, code: "1234" } });
        eq(r.status, 400);
        r = await call("verify-pin-reset-code.js", { body: { matricNumber: MATRIC, code } });
        eq(r.status, 200, r.message);
        r = await call("reset-student-pin.js", { body: { matricNumber: MATRIC, code, newPin: "123456" } });
        eq(r.status, 400, "6-digit PIN must be rejected");
        r = await call("reset-student-pin.js", { body: { matricNumber: MATRIC, code, newPin: "9999" } });
        eq(r.status, 200, r.message);
    });

    console.log("\n== Lockout abuse ==");
    await test("a stranger failing 5 times locks out only THEIR IP; the real student still logs in", async () => {
        seedStudent({ withAccount: true });
        for (let i = 0; i < 4; i++) eq((await call("student-login.js", { ip: "9.9.9.9", body: { matricNumber: MATRIC, pin: "0000" } })).status, 401);
        eq((await call("student-login.js", { ip: "9.9.9.9", body: { matricNumber: MATRIC, pin: "0000" } })).status, 429, "5th failure should lock the attacker");
        eq((await call("student-login.js", { ip: "9.9.9.9", body: { matricNumber: MATRIC, pin: PIN } })).status, 429, "attacker IP stays locked even with the right PIN");
        const real = await call("student-login.js", { ip: "5.5.5.5", body: { matricNumber: MATRIC, pin: PIN } });
        eq(real.status, 200, "real student was locked out: " + real.message);
    });
    await test("guessing from many IPs is still capped: account locks after 15 failures/hour", async () => {
        seedStudent({ withAccount: true });
        for (const ip of ["2.2.2.1", "2.2.2.2", "2.2.2.3"]) {
            for (let i = 0; i < 5; i++) await call("student-login.js", { ip, body: { matricNumber: MATRIC, pin: "0000" } });
        }
        const r = await call("student-login.js", { ip: "2.2.2.4", body: { matricNumber: MATRIC, pin: PIN } });
        eq(r.status, 429, "account should be locked for every IP now");
    });
    await test("a correct login clears the failure counters", async () => {
        seedStudent({ withAccount: true });
        for (let i = 0; i < 4; i++) await call("student-login.js", { body: { matricNumber: MATRIC, pin: "0000" } });
        eq((await call("student-login.js", { body: { matricNumber: MATRIC, pin: PIN } })).status, 200);
        for (let i = 0; i < 4; i++) eq((await call("student-login.js", { body: { matricNumber: MATRIC, pin: "0000" } })).status, 401);
    });
    await test("unknown matric numbers are not recorded per-account (no enumeration, no junk docs)", async () => {
        const before = store.size;
        await call("student-login.js", { body: { matricNumber: "NOPE/1", pin: "0000" } });
        // only the per-IP counter may be added
        eq(store.size - before, 1);
    });

    console.log("\n== Ballot secrecy ==");
    await test("votes doc has NO selections; ballot has NO voter info; tally and double-vote guard still work", async () => {
        seedStudent({ withAccount: true }); seedElection(); seedVoter(MATRIC);
        const r = await call("cast-vote.js", { token: "uid-" + DOC_ID + "|x@x.com", body: { electionId: "E1", matricNumber: MATRIC, pin: PIN, selections: BALLOT } });
        eq(r.status, 200, r.message);

        const vote = store.get("votes/E1_FUD21001");
        ok(vote, "turnout record missing");
        ok(!("selections" in vote), "votes doc still contains selections");
        eq(vote.matricNumber, MATRIC);

        const ballots = [...store.entries()].filter(([k]) => k.startsWith("ballots/"));
        eq(ballots.length, 1);
        const [ballotPath, ballot] = ballots[0];
        eq(JSON.stringify(Object.keys(ballot).sort()), JSON.stringify(["electionId", "selections"]), "ballot has extra fields");
        ok(!JSON.stringify(ballot).includes("FUD"), "matric leaked into ballot");
        ok(!ballotPath.includes("FUD") && !ballotPath.includes("E1_"), "ballot id derived from voter");

        let shards = 0; for (const [k, v] of store) if (k.startsWith("electionTallies/E1/shards/")) shards += v.totalVotes;
        eq(shards, 1);
        const again = await call("cast-vote.js", { token: "uid-" + DOC_ID + "|x@x.com", body: { electionId: "E1", matricNumber: MATRIC, pin: PIN, selections: BALLOT } });
        eq(again.status, 409);
        eq([...store.keys()].filter(k => k.startsWith("ballots/")).length, 1, "second ballot stored");
    });
    await test("live results count from tally counters (and match the real count)", async () => {
        seedElection(); seedAdmins();
        for (let i = 1; i <= 3; i++) {
            const m = `FUD/21/00${i}`; const d = `FUD_21_00${i}`;
            seedStudent({ matric: m, docId: d, email: `s${i}@fud.edu.ng`, withAccount: true }); seedVoter(m);
            const pick = i === 3 ? [{ position: "President", candidateId: "c2" }, { position: "Secretary", candidateId: "c4" }] : BALLOT;
            eq((await call("cast-vote.js", { token: `uid-${d}|x`, body: { electionId: "E1", matricNumber: m, pin: PIN, selections: pick } })).status, 200);
        }
        const r = await call("get-election-results.js", { method: "GET", token: SUPER, query: { id: "E1" } });
        eq(r.status, 200, r.message); eq(r.totalVotes, 3);
        const pres = r.positions.find(p => p.position === "President");
        eq(pres.candidates.find(c => c.id === "c1").votes, 2);
        eq(pres.candidates.find(c => c.id === "c2").votes, 1);
    });
    await test("legacy votes (selections inside votes doc) are still counted in live results", async () => {
        // own election id: get-election-results keeps a 10 s in-memory cache per election
        seedElection({ id: "E2" }); seedAdmins();
        store.set("votes/E2_OLD1", { electionId: "E2", matricNumber: "OLD/1", authUid: "u", selections: BALLOT });
        store.set("ballots/new1", { electionId: "E2", selections: [{ position: "President", candidateId: "c2" }, { position: "Secretary", candidateId: "c3" }] });
        store.set("votes/E2_NEW1", { electionId: "E2", matricNumber: "NEW/1", authUid: "v" });
        const live = await call("get-election-results.js", { method: "GET", token: SUPER, query: { id: "E2" } });
        eq(live.status, 200, live.message);
        const pres = live.positions.find(p => p.position === "President");
        eq(pres.candidates.find(c => c.id === "c1").votes, 1); eq(pres.candidates.find(c => c.id === "c2").votes, 1);
        eq(live.totalVotes, 2);
    });
    await test("finalize counts ballots + legacy votes together and the final result stores no voter data", async () => {
        seedElection(); seedAdmins();
        store.set("elections/E1", { ...store.get("elections/E1"), endAt: Timestamp.fromMillis(Date.now() - 1000) });
        store.set("ballots/b1", { electionId: "E1", selections: BALLOT });
        store.set("ballots/b2", { electionId: "E1", selections: [{ position: "President", candidateId: "c1" }, { position: "Secretary", candidateId: "c3" }] });
        store.set("votes/E1_A", { electionId: "E1", matricNumber: "A/1", authUid: "a" });
        store.set("votes/E1_B", { electionId: "E1", matricNumber: "B/1", authUid: "b" });
        store.set("votes/E1_LEG", { electionId: "E1", matricNumber: "LEG/1", authUid: "l", selections: BALLOT }); // legacy
        const r = await call("finalize-election-results.js", { token: SUPER, body: { electionId: "E1" } });
        eq(r.status, 200, r.message);
        const result = store.get("results/E1");
        ok(result, "no results doc"); eq(result.totalVotes, 3);
        eq(result.positions.find(p => p.position === "President").candidates.find(c => c.id === "c1").votes, 3);
        ok(!JSON.stringify(result).includes("A/1"), "voter matric in results");
    });

    await test("migration script: separates old votes from their choices, keeps counts identical, safe to re-run", async () => {
        seedElection({ id: "E3" });
        store.set("votes/E3_A1", { electionId: "E3", matricNumber: "A/1", authUid: "a", selections: BALLOT });
        store.set("votes/E3_B1", { electionId: "E3", matricNumber: "B/1", authUid: "b", selections: BALLOT });
        store.set("votes/E3_C1", { electionId: "E3", matricNumber: "C/1", authUid: "c" }); // already anonymous
        store.set("ballots/existing", { electionId: "E3", selections: BALLOT });
        const migration = require(path.join(__dirname, "..", "scripts", "separate-ballots.js"));
        const quiet = () => {};
        let r = await migration.run(fake.firestore(), { apply: false, log: quiet });
        eq(r.migrated, 0); ok(Array.isArray(store.get("votes/E3_A1").selections), "dry run changed data");
        r = await migration.run(fake.firestore(), { apply: true, log: quiet });
        eq(r.migrated, 2);
        ["E3_A1", "E3_B1", "E3_C1"].forEach(id => ok(!("selections" in store.get("votes/" + id)), id + " still holds selections"));
        eq(store.get("votes/E3_A1").matricNumber, "A/1");
        const ballots = [...store.entries()].filter(([k]) => k.startsWith("ballots/")).map(([, v]) => v);
        eq(ballots.length, 3);
        ok(ballots.every(b => Object.keys(b).sort().join() === "electionId,selections"), "ballot has extra fields");
        r = await migration.run(fake.firestore(), { apply: true, log: quiet });
        eq(r.migrated, 0, "second run should do nothing");
    });

    console.log("\n== Reset registration ==");
    async function registerAs(email) {
        const sent = await call("send-verification-code.js", { body: { matricNumber: MATRIC, email } });
        if (sent.status !== 200) return sent;
        const code = store.get("emailVerifications/" + DOC_ID).code;
        await call("verify-email-code.js", { body: { matricNumber: MATRIC, email, code } });
        return call("complete-student-signup.js", { body: { matricNumber: MATRIC, email, pin: "4821" } });
    }
    await test("reset: only Super Admins; unknown/unregistered students get 404", async () => {
        seedAdmins(); seedStudent();
        eq((await call("reset-student-registration.js", { body: { action: "reset", matricNumber: MATRIC } })).status, 401);
        eq((await call("reset-student-registration.js", { token: ADMIN, body: { action: "reset", matricNumber: MATRIC } })).status, 403);
        eq((await call("reset-student-registration.js", { token: SUPER, body: { action: "reset", matricNumber: MATRIC } })).status, 404);
    });
    await test("reset: removes the thief's account, login user and codes; real student can then register; audit entry written", async () => {
        seedAdmins(); seedStudent({ email: "" });
        eq((await registerAs("thief@evil.com")).status, 200);
        ok(store.has("studentAccounts/" + DOC_ID) && fake.__users.has("thief@evil.com"));
        store.set("pinResetCodes/" + DOC_ID, { code: "123456" });

        let r = await call("reset-student-registration.js", { token: SUPER, body: { action: "preview", matricNumber: "fud/21/001" } });
        eq(r.status, 200); eq(r.registeredEmail, "thief@evil.com");
        ok(store.has("studentAccounts/" + DOC_ID), "preview must not change anything");

        r = await call("reset-student-registration.js", { token: SUPER, body: { action: "reset", matricNumber: MATRIC } });
        eq(r.status, 200, r.message);
        ok(!store.has("studentAccounts/" + DOC_ID), "account still there");
        ok(!store.has("pinResetCodes/" + DOC_ID), "reset code still there");
        ok(!fake.__users.has("thief@evil.com"), "auth user still there");
        const student = store.get("students/" + DOC_ID);
        ok(student, "student list entry was deleted"); eq(student.accountCreated, false); ok(!("email" in student), "thief e-mail still on student");
        ok(store.has("studentAccess/" + DOC_ID), "studentAccess was deleted");
        const log = [...store.entries()].find(([k]) => k.startsWith("auditLogs/"))[1];
        eq(log.action, "registration_reset"); eq(log.removedEmail, "thief@evil.com"); eq(log.actorEmail, "super@nunsa.org");

        eq((await registerAs("real@gmail.com")).status, 200, "real student could not sign up again");
        eq(store.get("studentAccounts/" + DOC_ID).email, "real@gmail.com");
    });
    await test("reset: refused while the student has a vote in an unfinished election; allowed once it has ended", async () => {
        seedAdmins(); seedStudent({ withAccount: true }); seedElection();
        store.set("votes/E1_" + MATRIC.replace(/[^A-Z0-9]/g, ""), { electionId: "E1", matricNumber: MATRIC, authUid: "x" });
        let r = await call("reset-student-registration.js", { token: SUPER, body: { action: "reset", matricNumber: MATRIC } });
        eq(r.status, 409); ok(store.has("studentAccounts/" + DOC_ID), "account removed despite refusal");
        ok(![...store.keys()].some(k => k.startsWith("auditLogs/")), "refused reset was logged as done");
        store.set("elections/E1", { ...store.get("elections/E1"), endAt: Timestamp.fromMillis(Date.now() - 1000) });
        r = await call("reset-student-registration.js", { token: SUPER, body: { action: "reset", matricNumber: MATRIC } });
        eq(r.status, 200, r.message);
    });

    console.log("\n== Candidate applications (free) ==");
    const draftElection = (extra = {}) => {
        store.set("elections/F1", { title: "NUNSA 2026", status: "draft", formsOpen: true, createdBy: "super1", ...extra });
        store.set("formPositions/pres", { electionId: "F1", position: "President", active: true });
        store.set("formPositions/sec", { electionId: "F1", position: "Secretary", active: true });
    };
    const studentToken = (docId = DOC_ID, matric = MATRIC) => `uid-${docId}|s@x.com|${matric}`;
    const apply = (body, opts = {}) => call("apply-for-position.js", { token: studentToken(), body: { electionId: "F1", ...body }, ...opts });
    const seedApplicants = async (n, positionId = "pres") => {
        for (let i = 1; i <= n; i++) {
            const m = `FUD/21/00${i}`; const d = `FUD_21_00${i}`;
            seedStudent({ matric: m, docId: d, email: "", withAccount: true });
            eq((await call("apply-for-position.js", { token: studentToken(d, m), body: { electionId: "F1", positionId } })).status, 200);
        }
    };

    await test("apply: anonymous callers, closed applications, published elections, unknown positions are refused", async () => {
        seedStudent({ withAccount: true }); draftElection();
        store.set("formPositions/other", { electionId: "OTHER", position: "President", active: true });
        eq((await call("apply-for-position.js", { body: { electionId: "F1", positionId: "pres" } })).status, 401);
        eq((await apply({ positionId: "nope" })).status, 404);
        eq((await apply({ positionId: "other" })).status, 404, "position from another election");
        store.set("formPositions/off", { electionId: "F1", position: "Treasurer", active: false });
        eq((await apply({ positionId: "off" })).status, 404, "position switched off");
        store.set("elections/F1", { ...store.get("elections/F1"), formsOpen: false });
        eq((await apply({ positionId: "pres" })).status, 403, "applications closed");
        store.set("elections/F1", { ...store.get("elections/F1"), formsOpen: true, status: "published" });
        eq((await apply({ positionId: "pres" })).status, 403, "published election");
        ok(![...store.keys()].some(k => k.startsWith("applications/") || k.startsWith("candidates/")), "something was created");
    });
    await test("apply: creates the application AND the candidate together; one application per election", async () => {
        seedStudent({ withAccount: true }); draftElection();
        const r = await apply({ positionId: "pres", price: 1, level: 100 /* ignored */ });
        eq(r.status, 200, r.message);
        const app = store.get("applications/F1_" + DOC_ID);
        eq(app.status, "applied"); eq(app.position, "President"); eq(app.matricNumber, MATRIC); eq(app.authUid, "uid-" + DOC_ID);
        const candidate = store.get("candidates/form_F1_" + DOC_ID);
        ok(candidate, "no candidate created");
        eq(candidate.status, "active"); eq(candidate.position, "President"); eq(candidate.electionId, "F1");
        eq(candidate.name, "Real Student"); eq(candidate.matricNumber, MATRIC);
        eq((await apply({ positionId: "pres" })).status, 409, "same position again");
        eq((await apply({ positionId: "sec" })).status, 409, "another position in the same election");
        eq([...store.keys()].filter(k => k.startsWith("candidates/")).length, 1);
    });
    await test("apply: a token with someone else's matric but the wrong uid is refused", async () => {
        seedStudent({ withAccount: true }); draftElection();
        seedStudent({ matric: "FUD/21/002", docId: "FUD_21_002", email: "", withAccount: true });
        const spoof = await call("apply-for-position.js", { token: `uid-FUD_21_002|s@x.com|${MATRIC}`, body: { electionId: "F1", positionId: "pres" } });
        eq(spoof.status, 403);
        ok(![...store.keys()].some(k => k.startsWith("applications/")));
    });
    await test("offers: show open positions (no internal fields) and only the student's own applications", async () => {
        seedStudent({ withAccount: true }); draftElection();
        store.set("formPositions/off", { electionId: "F1", position: "Treasurer", active: false });
        seedStudent({ matric: "FUD/21/002", docId: "FUD_21_002", email: "", withAccount: true });
        await call("apply-for-position.js", { token: studentToken("FUD_21_002", "FUD/21/002"), body: { electionId: "F1", positionId: "sec" } });
        let r = await call("get-form-offers.js", { method: "GET", token: studentToken() });
        eq(r.status, 200, r.message);
        eq(r.offers.length, 1); eq(r.offers[0].positions.length, 2, "inactive position must be hidden");
        eq(r.applications.length, 0, "must not see another student's application");
        ok(!JSON.stringify(r.offers).includes("createdBy"), "internal fields leaked");
        await apply({ positionId: "pres" });
        r = await call("get-form-offers.js", { method: "GET", token: studentToken() });
        eq(r.applications.length, 1); eq(r.applications[0].status, "applied");
    });
    await test("admin disqualify removes a candidate from the ballot list; reinstate restores; logged; frozen after publish", async () => {
        seedAdmins(); seedStudent({ withAccount: true }); draftElection();
        await apply({ positionId: "pres" });
        const appId = "F1_" + DOC_ID;
        eq((await call("review-application.js", { body: { applicationId: appId, action: "disqualify" } })).status, 401);
        let r = await call("review-application.js", { token: studentToken(), body: { applicationId: appId, action: "disqualify" } });
        eq(r.status, 403, "students must not review");
        r = await call("review-application.js", { token: ADMIN, body: { applicationId: appId, action: "disqualify", reason: "Not eligible" } });
        eq(r.status, 200, r.message);
        eq(store.get("candidates/form_" + appId).status, "disqualified"); eq(store.get("applications/" + appId).status, "disqualified");
        const log = [...store.entries()].find(([k]) => k.startsWith("auditLogs/"))[1];
        eq(log.action, "applicant_disqualified"); eq(log.reason, "Not eligible"); eq(log.actorEmail, "admin@nunsa.org");
        eq((await call("review-application.js", { token: ADMIN, body: { applicationId: appId, action: "disqualify" } })).status, 409, "double disqualify");
        r = await call("review-application.js", { token: ADMIN, body: { applicationId: appId, action: "reinstate" } });
        eq(r.status, 200, r.message); eq(store.get("candidates/form_" + appId).status, "active");
        store.set("elections/F1", { ...store.get("elections/F1"), status: "published" });
        eq((await call("review-application.js", { token: ADMIN, body: { applicationId: appId, action: "disqualify" } })).status, 409, "ballot frozen once published");
    });
    await test("only applicants who are NOT disqualified end up on the ballot", async () => {
        seedAdmins(); draftElection();
        await seedApplicants(3);
        await call("review-application.js", { token: ADMIN, body: { applicationId: "F1_FUD_21_002", action: "disqualify", reason: "x" } });
        const onBallot = (await fake.firestore().collection("candidates").where("electionId", "==", "F1").where("status", "==", "active").get()).docs.map(d => d.data().matricNumber).sort();
        eq(onBallot.join(), "FUD/21/001,FUD/21/003");
    });
    await test("delete election: Super Admin + exact title; refused once votes exist; removes everything including applications", async () => {
        seedAdmins(); draftElection(); await seedApplicants(2);
        store.set("voters/F1_X", { electionId: "F1", matricNumber: "X/1", status: "active" });
        let r = await call("delete-election.js", { token: ADMIN, body: { electionId: "F1", confirmTitle: "NUNSA 2026" } });
        eq(r.status, 403, "regular admin");
        r = await call("delete-election.js", { token: SUPER, body: { electionId: "F1", confirmTitle: "wrong" } });
        eq(r.status, 400);
        store.set("votes/F1_V", { electionId: "F1", matricNumber: "V/1", authUid: "v" });
        eq((await call("delete-election.js", { token: SUPER, body: { electionId: "F1", confirmTitle: "NUNSA 2026" } })).status, 409, "votes exist");
        ok(store.has("elections/F1"), "election deleted despite votes");
        store.delete("votes/F1_V");
        r = await call("delete-election.js", { token: SUPER, body: { electionId: "F1", confirmTitle: "NUNSA 2026" } });
        eq(r.status, 200, r.message);
        ok(!store.has("elections/F1") && !store.has("formPositions/pres") && !store.has("voters/F1_X"));
        ok(![...store.keys()].some(k => k.startsWith("applications/") || k.startsWith("candidates/")), "applications/candidates left behind");
        const log = [...store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v).find(l => l.action === "election_deleted");
        eq(log.applicationsRemoved, 2);
    });

    console.log("\n== Admin invitation expiry ==");
    await test("a fresh invitation works; its expiry is set 7 days ahead", async () => {
        seedAdmins();
        const r = await call("send-admin-invitation.js", { token: SUPER, body: { name: "New Admin", email: "new@nunsa.org", role: "admin" } });
        eq(r.status, 200, r.message);
        const [id, inv] = [...store.entries()].find(([k]) => k.startsWith("adminInvitations/"));
        const days = (inv.expiresAt.toMillis() - Date.now()) / 86400e3;
        ok(days > 6.99 && days <= 7.001, "expiry is " + days + " days");
        eq(sentEmails[0].to[0], "new@nunsa.org");
        const check = await call("check-admin-invitation.js", { method: "GET", query: { inviteId: id.split("/")[1] } });
        eq(check.status, 200, check.message);
    });
    await test("an expired invitation is refused by both the check and the accept step", async () => {
        seedAdmins();
        store.set("adminInvitations/old1", { name: "Old", email: "old@nunsa.org", role: "admin", status: "pending", createdBy: "super1", expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
        let r = await call("check-admin-invitation.js", { method: "GET", query: { inviteId: "old1" } });
        eq(r.status, 410); ok(/expired/i.test(r.message));
        r = await call("accept-admin-invitation.js", { body: { inviteId: "old1", email: "old@nunsa.org", password: "LongPassword123!" } });
        eq(r.status, 410); ok(!fake.__users.has("old@nunsa.org"), "an account was created from an expired invite");
    });
    await test("invitations created BEFORE this change (no expiresAt) expire 7 days after createdAt", async () => {
        seedAdmins();
        store.set("adminInvitations/legacyOld", { name: "L", email: "l@nunsa.org", role: "admin", status: "pending", createdBy: "super1", createdAt: Timestamp.fromMillis(Date.now() - 8 * 86400e3) });
        store.set("adminInvitations/legacyNew", { name: "L2", email: "l2@nunsa.org", role: "admin", status: "pending", createdBy: "super1", createdAt: Timestamp.fromMillis(Date.now() - 2 * 86400e3) });
        eq((await call("check-admin-invitation.js", { method: "GET", query: { inviteId: "legacyOld" } })).status, 410);
        eq((await call("check-admin-invitation.js", { method: "GET", query: { inviteId: "legacyNew" } })).status, 200);
    });
    await test("an expired pending invitation no longer blocks re-inviting the same e-mail", async () => {
        seedAdmins();
        store.set("adminInvitations/old2", { name: "Old", email: "again@nunsa.org", role: "admin", status: "pending", createdBy: "super1", expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
        const r = await call("send-admin-invitation.js", { token: SUPER, body: { name: "Again", email: "again@nunsa.org", role: "admin" } });
        eq(r.status, 200, r.message);
        eq(store.get("adminInvitations/old2").status, "expired");
        const second = await call("send-admin-invitation.js", { token: SUPER, body: { name: "Again", email: "again@nunsa.org", role: "admin" } });
        eq(second.status, 400, "a live pending invitation must still block a duplicate");
    });

    console.log("\n== Voter audit log ==");
    await test("regular admins and anonymous callers cannot change voters", async () => {
        seedAdmins(); seedElection(); seedStudent();
        eq((await call("manage-voters.js", { body: { action: "add", electionId: "E1", matricNumber: MATRIC } })).status, 401);
        eq((await call("manage-voters.js", { token: ADMIN, body: { action: "add", electionId: "E1", matricNumber: MATRIC } })).status, 403);
        ok(![...store.keys()].some(k => k.startsWith("voters/")), "a voter was written");
    });
    await test("add: voter + audit entry are written together and the entry says who/what/when/phase", async () => {
        seedAdmins(); seedElection(); seedStudent();
        const r = await call("manage-voters.js", { token: SUPER, body: { action: "add", electionId: "E1", matricNumber: "fud/21/001" } });
        eq(r.status, 200, r.message);
        const voter = store.get("voters/E1_FUD21001");
        eq(voter.matricNumber, MATRIC); eq(voter.status, "active");
        const logs = [...store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v);
        eq(logs.length, 1);
        const log = logs[0];
        eq(log.action, "voter_added"); eq(log.actorEmail, "super@nunsa.org"); eq(log.actorUid, "super1");
        eq(log.electionPhase, "during_voting"); eq(log.matricNumbers[0], MATRIC); ok(log.at, "no timestamp");
        eq((await call("manage-voters.js", { token: SUPER, body: { action: "add", electionId: "E1", matricNumber: MATRIC } })).status, 409, "duplicate add");
        eq([...store.keys()].filter(k => k.startsWith("auditLogs/")).length, 1, "failed add must not log");
    });
    await test("add requires an existing student; unknown matric writes nothing and logs nothing", async () => {
        seedAdmins(); seedElection();
        const r = await call("manage-voters.js", { token: SUPER, body: { action: "add", electionId: "E1", matricNumber: "GHOST/1" } });
        eq(r.status, 400);
        ok(![...store.keys()].some(k => k.startsWith("voters/") || k.startsWith("auditLogs/")));
    });
    await test("import 450 voters: every batch is logged, skips duplicates, warns about unknown students", async () => {
        seedAdmins(); seedElection();
        const list = []; for (let i = 0; i < 450; i++) list.push(`FUD/21/${String(1000 + i)}`);
        list.slice(0, 440).forEach((m, i) => seedStudent({ matric: m, docId: m.replace(/[^A-Z0-9]/g, "_"), email: `s${i}@x.com` }));
        seedVoter(list[0]);
        const r = await call("manage-voters.js", { token: SUPER, body: { action: "import", electionId: "E1", matricNumbers: list } });
        eq(r.status, 200, r.message); eq(r.added, 449); eq(r.skippedExisting, 1); eq(r.notInStudentListCount, 10);
        const logs = [...store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v);
        eq(logs.length, 3, "449 voters = 3 batches of <=200");
        eq(logs.reduce((n, l) => n + l.count, 0), 449);
        ok(logs.every(l => l.action === "voters_imported"));
        eq([...store.keys()].filter(k => k.startsWith("voters/")).length, 450);
    });
    await test("remove: logged; refused if the voter already voted", async () => {
        seedAdmins(); seedElection(); seedVoter("A/1"); seedVoter("B/1");
        store.set("votes/E1_B1", { electionId: "E1", matricNumber: "B/1", authUid: "b" });
        let r = await call("manage-voters.js", { token: SUPER, body: { action: "remove", electionId: "E1", matricNumber: "A/1" } });
        eq(r.status, 200, r.message); ok(!store.has("voters/E1_A1"));
        const log = [...store.entries()].find(([k]) => k.startsWith("auditLogs/"))[1];
        eq(log.action, "voter_removed"); eq(log.matricNumbers[0], "A/1");
        r = await call("manage-voters.js", { token: SUPER, body: { action: "remove", electionId: "E1", matricNumber: "B/1" } });
        eq(r.status, 409); ok(store.has("voters/E1_B1"), "voter who already voted was removed");
        eq([...store.keys()].filter(k => k.startsWith("auditLogs/")).length, 1);
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) { console.log("Failed: " + failures.join("; ")); process.exit(1); }
})();
