/*
 * RESET STUDENT REGISTRATION (Super Admin only)
 *
 * Use when a student reports that someone else registered their matric number
 * under a different e-mail. It undoes the registration so the real student can
 * sign up again with their own e-mail and a new PIN:
 *
 *   deletes   studentAccounts/{matric}      (the account + PIN hash)
 *             emailVerifications/{matric}   (left-over signup code)
 *             pinResetCodes/{matric}        (left-over reset code)
 *             e-mail-code cooldowns and PIN lockouts for that matric, so the real
 *             student can request a code straight away
 *             the Firebase Authentication user of that account
 *   updates   students/{matric}             accountCreated=false, e-mail removed
 *   keeps     students/{matric} itself and studentAccess/{matric}
 *   writes    an auditLogs entry (who, which matric, the e-mail that was removed)
 *
 * REFUSED while that student has a vote in an election that has not finished
 * yet: ballots are anonymous, so a ballot cast by the wrong person cannot be
 * found or removed afterwards.
 *
 * POST { action: "preview" | "reset", matricNumber }
 *   preview -> returns the e-mail currently registered (for the admin to confirm)
 *   reset   -> does it
 */
const admin = require("firebase-admin");
const { jsonResponse, parseBody, logError, auditLogRef, auditLogEntry, clearFailures } = require("./_lib/guard");

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
const fail = (status, message) => jsonResponse(status, { success: false, message });

function normalizeMatric(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function matricDocumentId(value) {
    return normalizeMatric(value).replace(/[^A-Z0-9]/g, "_");
}

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

/* Is this student's vote in an election that is still open or not yet finished? */
async function hasVoteInUnfinishedElection(matricNumber) {
    const votes = await db.collection("votes").where("matricNumber", "==", matricNumber).get();
    for (const voteDoc of votes.docs) {
        const electionSnap = await db.collection("elections").doc(String(voteDoc.data().electionId)).get();
        // Missing election or missing end date: be safe and treat it as unfinished.
        const endMs = electionSnap.exists ? toMillis(electionSnap.data().endAt) : 0;
        if (!endMs || endMs > Date.now()) return true;
    }
    return false;
}

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") {
        return fail(405, "Method not allowed.");
    }

    try {
        const authHeader = event.headers.authorization || event.headers.Authorization || "";
        if (!authHeader.startsWith("Bearer ")) {
            return fail(401, "Authentication required.");
        }
        const decoded = await admin.auth().verifyIdToken(authHeader.substring(7).trim());
        if (!decoded || !decoded.uid) {
            return fail(401, "Invalid authentication token.");
        }

        const adminSnap = await db.collection("admins").doc(decoded.uid).get();
        const adminData = adminSnap.exists ? adminSnap.data() : null;
        if (!adminData || adminData.active !== true || adminData.role !== "super_admin") {
            return fail(403, "Only a Super Admin can reset a registration.");
        }

        const body = parseBody(event);
        if (!body) {
            return fail(400, "Invalid request.");
        }
        const action = String(body.action || "");
        if (!["preview", "reset"].includes(action)) {
            return fail(400, "Unknown action.");
        }

        const matricNumber = normalizeMatric(body.matricNumber);
        if (!matricNumber || matricNumber.length > 40) {
            return fail(400, "Enter a valid registration number.");
        }
        const studentDocId = matricDocumentId(matricNumber);

        const accountRef = db.collection("studentAccounts").doc(studentDocId);
        const accountSnap = await accountRef.get();
        if (!accountSnap.exists) {
            return fail(404, "This student has no registration to reset.");
        }
        const account = accountSnap.data();

        if (await hasVoteInUnfinishedElection(matricNumber)) {
            return fail(409, "This student already has a vote in an election that has not finished, so the registration cannot be reset. Ballots are anonymous and cannot be traced or removed.");
        }

        if (action === "preview") {
            return jsonResponse(200, {
                success: true,
                matricNumber,
                registeredEmail: String(account.email || "")
            });
        }

        /* ---- reset: Firestore changes + audit entry in ONE batch ---- */
        const batch = db.batch();
        batch.delete(accountRef);
        batch.delete(db.collection("emailVerifications").doc(studentDocId));
        batch.delete(db.collection("pinResetCodes").doc(studentDocId));

        const studentRef = db.collection("students").doc(studentDocId);
        const studentSnap = await studentRef.get();
        if (studentSnap.exists) {
            batch.update(studentRef, {
                accountCreated: false,
                email: admin.firestore.FieldValue.delete()
            });
        }

        batch.set(auditLogRef(), auditLogEntry({
            action: "registration_reset",
            matricNumber,
            removedEmail: String(account.email || ""),
            removedAuthUid: String(account.authUid || ""),
            actorUid: decoded.uid,
            actorEmail: String(adminData.email || decoded.email || ""),
            actorRole: adminData.role
        }));
        await batch.commit();

        /* ---- let the real student start fresh: clear code cooldowns and PIN lockouts for this matric ---- */
        await Promise.all([
            clearFailures(`mail-cd:signup:${studentDocId}`),
            clearFailures(`mail-hr:signup:${studentDocId}`),
            clearFailures(`mail-cd:reset:${studentDocId}`),
            clearFailures(`mail-hr:reset:${studentDocId}`),
            clearFailures(`pin:${studentDocId}`)
        ]);

        /* ---- then remove the Authentication user (an orphan would be harmless but untidy) ---- */
        let authRemoved = true;
        if (account.authUid) {
            try {
                await admin.auth().deleteUser(String(account.authUid));
            } catch (error) {
                if (!error || error.code !== "auth/user-not-found") {
                    authRemoved = false;
                    logError("Reset registration: could not delete auth user", error);
                }
            }
        }

        return jsonResponse(200, {
            success: true,
            message: authRemoved
                ? "Registration reset. The student can now sign up again."
                : "Registration reset. The student can sign up again. (The old login user could not be removed; delete it in Firebase Authentication when convenient.)"
        });
    } catch (error) {
        if (error && (error.code === "auth/id-token-expired" || error.code === "auth/argument-error")) {
            return fail(401, "Your session has expired. Please log in again.");
        }
        logError("Reset student registration error", error);
        return fail(500, "Unable to reset this registration.");
    }
};
