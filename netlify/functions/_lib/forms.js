/*
 * CANDIDATE APPLICATIONS: shared helpers
 *
 * A student applies for a position while the election is still a DRAFT and the
 * admins have opened applications. The application and the candidate entry are
 * created together; admins then screen applicants in real life and disqualify
 * anyone who does not qualify. Whoever is not disqualified is on the ballot.
 * The system does not check eligibility itself.
 */
const admin = require("firebase-admin");

function matricDocumentId(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "_");
}

/** One application per student per election. */
function applicationId(electionId, studentDocumentId) {
    return `${electionId}_${studentDocumentId}`;
}

/**
 * Returns { student } for a logged-in, registered student, or { error: [status, message] }.
 * The matric number comes from the signed token claim, never from the request body.
 */
async function authenticateStudent(db, event) {
    const header = event.headers.authorization || event.headers.Authorization || "";
    if (!header.startsWith("Bearer ")) return { error: [401, "Please log in again."] };

    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(header.substring(7).trim());
    } catch {
        return { error: [401, "Your session has expired. Please log in again."] };
    }
    if (!decoded || !decoded.uid || !decoded.matricNumber) {
        return { error: [401, "Please log in as a student."] };
    }

    const studentDocumentId = matricDocumentId(decoded.matricNumber);
    const accountSnap = await db.collection("studentAccounts").doc(studentDocumentId).get();
    const account = accountSnap.exists ? accountSnap.data() : null;
    if (!account || account.active === false || account.authUid !== decoded.uid) {
        return { error: [403, "Student account not found."] };
    }
    const studentSnap = await db.collection("students").doc(studentDocumentId).get();
    const record = studentSnap.exists ? studentSnap.data() : {};

    return {
        student: {
            uid: decoded.uid,
            studentDocumentId,
            matricNumber: String(account.matricNumber || record.matricNumber || decoded.matricNumber),
            name: String(record.name || ""),
            profilePicture: record.profilePicture || "assets/default-profile.jpg"
        }
    };
}

/** Same student object authenticateStudent builds, but from a student document id (used by the Telegram bot). */
async function loadStudentByDocId(db, studentDocumentId) {
    const accountSnap = await db.collection("studentAccounts").doc(studentDocumentId).get();
    const account = accountSnap.exists ? accountSnap.data() : null;
    if (!account || account.active === false || !account.authUid) return null;
    const studentSnap = await db.collection("students").doc(studentDocumentId).get();
    const record = studentSnap.exists ? studentSnap.data() : {};
    return {
        uid: account.authUid,
        studentDocumentId,
        matricNumber: String(account.matricNumber || record.matricNumber || ""),
        name: String(record.name || ""),
        profilePicture: record.profilePicture || "assets/default-profile.jpg"
    };
}

module.exports = { matricDocumentId, applicationId, authenticateStudent, loadStudentByDocId };
