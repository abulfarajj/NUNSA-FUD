/*
 * Shared helpers for Netlify Functions.
 *
 *  - jsonResponse : one consistent response shape { success, message, ... }
 *  - parseBody    : safe JSON body parsing (bad JSON -> 400, not 500)
 *  - logError     : logs ONLY the error code + short message (never request
 *                   bodies, PINs, codes, tokens, e-mail addresses, or full
 *                   error objects that can carry them)
 *  - clientIp     : the caller's IP as seen by Netlify
 *  - rate limiting: Firestore-backed counters in the private `rateLimits`
 *                   collection (clients can never read/write it: the default
 *                   rule denies everything and only the Admin SDK touches it)
 *
 * The calling function must already have run admin.initializeApp(...).
 */
const admin = require("firebase-admin");
const crypto = require("crypto");

function jsonResponse(statusCode, data, extraHeaders) {
    return {
        statusCode,
        headers: Object.assign(
            { "Content-Type": "application/json", "Cache-Control": "no-store" },
            extraHeaders || {}
        ),
        body: JSON.stringify(data)
    };
}

function parseBody(event) {
    try {
        const parsed = JSON.parse(event.body || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return null; // caller answers 400 "Invalid request."
    }
}

function logError(label, error) {
    const code = error && (error.code || error.name) ? String(error.code || error.name) : "unknown";
    const message = error && error.message ? String(error.message).slice(0, 160) : "";
    console.error(`${label} [${code}] ${message}`);
}

function clientIp(event) {
    const headers = event.headers || {};
    return String(
        headers["x-nf-client-connection-ip"] ||
        String(headers["x-forwarded-for"] || "").split(",")[0] ||
        "unknown"
    ).trim();
}

function limiterRef(key) {
    // Hash the key: no raw matric numbers / IPs stored, and always a valid doc ID.
    const id = crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 40);
    return admin.firestore().collection("rateLimits").doc(id);
}

function retryAfterSeconds(untilMs, nowMs) {
    return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

/** Is this key currently locked? -> { locked, retryAfterSec } */
async function getLock(key) {
    const snap = await limiterRef(key).get();
    const now = Date.now();
    if (snap.exists) {
        const lockedUntil = Number(snap.data().lockedUntil || 0);
        if (lockedUntil > now) {
            return { locked: true, retryAfterSec: retryAfterSeconds(lockedUntil, now) };
        }
    }
    return { locked: false, retryAfterSec: 0 };
}

/**
 * Count one FAILED attempt. After `maxFailures` inside `windowMs` the key is
 * locked for `lockMs`. -> { locked, retryAfterSec }
 */
async function recordFailure(key, rule) {
    const ref = limiterRef(key);
    const db = admin.firestore();
    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const now = Date.now();
        let data = snap.exists ? snap.data() : {};
        if (Number(data.lockedUntil || 0) > now) {
            return { locked: true, retryAfterSec: retryAfterSeconds(data.lockedUntil, now) };
        }
        let count = Number(data.count || 0);
        let windowStart = Number(data.windowStart || 0);
        if (!windowStart || now - windowStart > rule.windowMs) {
            count = 0;
            windowStart = now;
        }
        count += 1;
        if (count >= rule.maxFailures) {
            const lockedUntil = now + rule.lockMs;
            tx.set(ref, { count: 0, windowStart: now, lockedUntil, updatedAt: now });
            return { locked: true, retryAfterSec: retryAfterSeconds(lockedUntil, now) };
        }
        tx.set(ref, { count, windowStart, lockedUntil: 0, updatedAt: now });
        return { locked: false, retryAfterSec: 0 };
    });
}

/** Successful attempt: forget earlier failures for this key. */
async function clearFailures(key) {
    await limiterRef(key).delete().catch(() => {});
}

/**
 * Count ANY request (e.g. "send e-mail code") and refuse once more than `max`
 * happen inside `windowMs`. -> { allowed, retryAfterSec }
 */
async function consume(key, max, windowMs) {
    const ref = limiterRef(key);
    const db = admin.firestore();
    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const now = Date.now();
        const data = snap.exists ? snap.data() : {};
        let count = Number(data.count || 0);
        let windowStart = Number(data.windowStart || 0);
        if (!windowStart || now - windowStart > windowMs) {
            count = 0;
            windowStart = now;
        }
        if (count >= max) {
            return { allowed: false, retryAfterSec: retryAfterSeconds(windowStart + windowMs, now) };
        }
        tx.set(ref, { count: count + 1, windowStart, lockedUntil: 0, updatedAt: now });
        return { allowed: true, retryAfterSec: 0 };
    });
}

function tooManyResponse(retryAfterSec, message) {
    const minutes = Math.ceil(retryAfterSec / 60);
    return jsonResponse(
        429,
        {
            success: false,
            message: message || `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
            retryAfterSeconds: retryAfterSec
        },
        { "Retry-After": String(retryAfterSec) }
    );
}

/*
 * Limits for "send me an e-mail code" endpoints (signup + PIN reset).
 * Returns a ready-made 429 response, or null when the request may go ahead.
 */
async function enforceEmailCodeLimits(event, matricDocId, purpose) {
    const ip = await consume(
        `mail-ip:${purpose}:${clientIp(event)}`, RULES.emailCodePerIp.max, RULES.emailCodePerIp.windowMs
    );
    if (!ip.allowed) return tooManyResponse(ip.retryAfterSec);

    const cooldown = await consume(`mail-cd:${purpose}:${matricDocId}`, 1, RULES.emailCodeCooldownMs);
    if (!cooldown.allowed) {
        return tooManyResponse(cooldown.retryAfterSec, "Please wait a minute before requesting another code.");
    }

    const hourly = await consume(
        `mail-hr:${purpose}:${matricDocId}`, RULES.emailCodePerStudent.max, RULES.emailCodePerStudent.windowMs
    );
    if (!hourly.allowed) return tooManyResponse(hourly.retryAfterSec);
    return null;
}

/* Tuning knobs (change here, nowhere else). */
const RULES = {
    // PIN guesses are counted three ways, so that a stranger who only knows a
    // matric number cannot easily lock the real student out:
    //
    //  1. pinPerAccountAndIp: wrong PINs against ONE account from ONE IP.
    //     5 wrong PINs -> that IP is locked out of that account for 15 min.
    //     Other IPs (the real student) are NOT affected by this lock.
    //  2. pinPerAccount: wrong PINs against ONE account from ALL IPs together.
    //     15 in an hour -> the account is locked for 30 min. This is the hard
    //     cap on guessing: at most ~15 guesses per 90 min = ~240/day against
    //     10,000 possible PINs. Locking a victim out needs failures from at
    //     least 3 different IPs, not just one.
    //  3. pinPerIp: wrong PINs from ONE IP across ALL accounts. Kept high
    //     because many students share one campus / mobile-carrier IP.
    pinPerAccountAndIp: { maxFailures: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
    pinPerAccount: { maxFailures: 15, windowMs: 60 * 60 * 1000, lockMs: 30 * 60 * 1000 },
    pinPerIp: { maxFailures: 100, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
    // E-mail code requests (signup + PIN reset)
    emailCodeCooldownMs: 60 * 1000,                 // 1 per minute per student
    emailCodePerStudent: { max: 5, windowMs: 60 * 60 * 1000 },
    emailCodePerIp: { max: 30, windowMs: 60 * 60 * 1000 }
};

/* ---------- PIN lockout (used by student-login.js and cast-vote.js) ---------- */

function pinKeys(matricDocId, ip) {
    return {
        pair: `pin-pair:${matricDocId}:${ip}`,
        account: `pin:${matricDocId}`,
        ip: `pin-ip:${ip}`
    };
}

/** Is this account/IP combination locked? -> ready-made 429 response, or null. */
async function checkPinLocks(event, matricDocId) {
    const keys = pinKeys(matricDocId, clientIp(event));
    const locks = await Promise.all([getLock(keys.pair), getLock(keys.account), getLock(keys.ip)]);
    const active = locks.filter(lock => lock.locked);
    if (!active.length) return null;
    return tooManyResponse(Math.max(...active.map(lock => lock.retryAfterSec)));
}

/**
 * Count one wrong PIN. `countAccount` is false when the matric does not match
 * a real account (then only the IP is charged, so unknown matrics are not
 * recorded). -> ready-made 429 response if this failure caused a lock, else null.
 */
async function recordPinFailure(event, matricDocId, countAccount) {
    const keys = pinKeys(matricDocId, clientIp(event));
    const results = [await recordFailure(keys.ip, RULES.pinPerIp)];
    if (countAccount) {
        results.push(await recordFailure(keys.pair, RULES.pinPerAccountAndIp));
        results.push(await recordFailure(keys.account, RULES.pinPerAccount));
    }
    const locked = results.filter(result => result.locked);
    if (!locked.length) return null;
    return tooManyResponse(Math.max(...locked.map(result => result.retryAfterSec)));
}

/** Correct PIN: forget earlier failures for this account (and this IP's share of it). */
async function clearPinFailures(event, matricDocId) {
    const keys = pinKeys(matricDocId, clientIp(event));
    await Promise.all([clearFailures(keys.pair), clearFailures(keys.account)]);
}

/* ---------- E-mail codes ---------- */

const EMAIL_CODE_LENGTH = 6;

/** 6-digit e-mail code (signup verification and PIN reset). The PIN stays 4 digits. */
function generateEmailCode() {
    return crypto.randomInt(100000, 1000000).toString();
}

function isValidEmailCode(value) {
    return /^\d{6}$/.test(String(value || ""));
}

/* ---------- Admin invitations ---------- */

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

/**
 * When does this invitation stop working? Uses the stored expiresAt; invitations
 * created before expiry existed fall back to createdAt + 7 days (so old
 * open invitations expire too). No usable date at all -> treated as expired.
 */
function invitationExpiresAtMs(invitation) {
    const stored = toMillis(invitation && invitation.expiresAt);
    if (stored) return stored;
    const created = toMillis(invitation && invitation.createdAt);
    return created ? created + INVITATION_TTL_MS : 0;
}

function isInvitationExpired(invitation) {
    return Date.now() >= invitationExpiresAtMs(invitation);
}

/* ---------- Audit log ---------- */

/**
 * Add an entry to the server-only `auditLogs` collection. Clients can never
 * write it (Firestore rules); only Super Admins can read it. Pass `writer`
 * (a transaction or batch) to make the entry commit together with the change
 * it describes.
 */
function auditLogRef() {
    return admin.firestore().collection("auditLogs").doc();
}

function auditLogEntry(fields) {
    return Object.assign({}, fields, {
        at: admin.firestore.FieldValue.serverTimestamp()
    });
}

module.exports = {
    jsonResponse, parseBody, logError, clientIp,
    getLock, recordFailure, clearFailures, consume, tooManyResponse, enforceEmailCodeLimits, RULES,
    checkPinLocks, recordPinFailure, clearPinFailures,
    EMAIL_CODE_LENGTH, generateEmailCode, isValidEmailCode,
    INVITATION_TTL_MS, invitationExpiresAtMs, isInvitationExpired,
    auditLogRef, auditLogEntry
};
