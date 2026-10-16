/*
 * STUDENT LOGIN  (matric number + 4-digit PIN -> Firebase custom token)
 *
 * Security checks, in order:
 *  1. POST only; body must be valid JSON.
 *  2. Lockout check, BEFORE any PIN work is done (see RULES in _lib/guard.js):
 *     this account from this IP (5 wrong PINs -> 15 min), the account from all
 *     IPs together (15 per hour -> 30 min), and the caller's IP (100 -> 15 min).
 *     A stranger who only knows a matric number locks out their OWN IP, not the
 *     real student's.
 *  3. Matric -> studentAccess -> studentAccounts lookup. Unknown / inactive /
 *     mismatched accounts all return the SAME generic 401 as a wrong PIN, so
 *     the endpoint cannot be used to find out which matric numbers exist.
 *  4. PIN is verified with PBKDF2 (100k rounds, per-student salt) using a
 *     constant-time comparison.
 *  5. Wrong PIN -> failure counted (account+IP, account, IP). Correct PIN ->
 *     account counters cleared.
 *  6. The custom token carries the matricNumber claim; Firestore rules use it
 *     to make sure a student can only read/update THEIR OWN records.
 */
const admin = require("firebase-admin");
const crypto = require("crypto");
const {
    jsonResponse, parseBody, logError,
    checkPinLocks, recordPinFailure, clearPinFailures
} = require("./_lib/guard");

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

const GENERIC_FAIL = "Invalid registration number or PIN.";

function pbkdf2Async(pin, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(pin, salt, 100000, 32, "sha256", (error, key) =>
            error ? reject(error) : resolve(key)
        );
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return jsonResponse(405, { success: false, message: "Method not allowed." });
    }

    try {
        const data = parseBody(event);
        if (!data) {
            return jsonResponse(400, { success: false, message: "Invalid request." });
        }

        const matricNumber = String(data.matricNumber || "").trim().toUpperCase();
        const pin = String(data.pin || "");

        if (!matricNumber || !pin) {
            return jsonResponse(400, { success: false, message: "Registration number and PIN are required." });
        }
        if (!/^\d{4}$/.test(pin)) {
            return jsonResponse(400, { success: false, message: "PIN must contain exactly 4 digits." });
        }

        const matricDocId = matricNumber.replace(/[^A-Z0-9]/g, "_");
        // (2) Refuse early if this account/IP combination, the account, or the IP is locked.
        const lockedResponse = await checkPinLocks(event, matricDocId);
        if (lockedResponse) {
            return lockedResponse;
        }

        // Counts a failure and answers 401 (or 429 if this failure caused a lock).
        const fail = async (countAccount) => {
            const lockResponse = await recordPinFailure(event, matricDocId, countAccount);
            if (lockResponse) {
                return lockResponse;
            }
            return jsonResponse(401, { success: false, message: GENERIC_FAIL });
        };

        // (3) Lookups
        const accessSnapshot = await db.collection("studentAccess").doc(matricDocId).get();
        if (!accessSnapshot.exists) {
            return fail(false); // no such account: count against the IP only
        }
        const accessData = accessSnapshot.data();
        const studentDocumentId = String(accessData.studentDocumentId || "").trim();
        if (accessData.active !== true || !studentDocumentId) {
            return fail(false);
        }

        const accountSnapshot = await db.collection("studentAccounts").doc(studentDocumentId).get();
        if (!accountSnapshot.exists) {
            return fail(false);
        }
        const accountData = accountSnapshot.data();
        if (accountData.active !== true || accountData.matricNumber !== matricNumber) {
            return fail(false);
        }

        const storedHash = String(accountData.pinHash || "");
        const storedSalt = String(accountData.pinSalt || "");
        const authUid = String(accountData.authUid || "").trim();
        if (!storedHash || !storedSalt || !authUid) {
            logError("Student login: incomplete account record", { code: "incomplete" });
            return jsonResponse(500, { success: false, message: "Unable to log in." });
        }

        // (4) PIN check
        const expectedHash = Buffer.from(storedHash, "hex");
        const suppliedHash = await pbkdf2Async(pin, Buffer.from(storedSalt, "hex"));
        const pinOk =
            expectedHash.length === suppliedHash.length &&
            crypto.timingSafeEqual(expectedHash, suppliedHash);

        if (!pinOk) {
            return fail(true); // (5)
        }

        await clearPinFailures(event, matricDocId);

        const customToken = await admin.auth().createCustomToken(authUid, { matricNumber });

        return jsonResponse(200, {
            success: true,
            message: "Login successful.",
            customToken,
            matricNumber,
            studentDocumentId
        });
    } catch (error) {
        logError("Student login error", error);
        return jsonResponse(500, { success: false, message: "Unable to log in." });
    }
};
