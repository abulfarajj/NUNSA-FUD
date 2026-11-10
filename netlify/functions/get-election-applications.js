/*
 * ADMIN: GET APPLICATIONS FOR ONE ELECTION
 * Uses the same shared lifecycle calculation as the student dashboard and
 * Telegram bot. This is read-only; screening actions remain draft-only.
 */
const admin = require("firebase-admin");
const { jsonResponse, logError } = require("./_lib/guard");
const { applicationOutcome, getElectionPhase, isFinalizedResults } = require("./_lib/election-lifecycle");

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

exports.handler = async event => {
    if (event.httpMethod !== "GET") return fail(405, "Method not allowed.");
    try {
        const header = event.headers.authorization || event.headers.Authorization || "";
        if (!header.startsWith("Bearer ")) return fail(401, "Authentication required.");

        let decoded;
        try { decoded = await admin.auth().verifyIdToken(header.slice(7).trim()); }
        catch { return fail(401, "Your session has expired. Please log in again."); }

        const adminSnap = await db.collection("admins").doc(decoded.uid).get();
        const adminData = adminSnap.exists ? adminSnap.data() : null;
        if (!adminData || adminData.active !== true || !["admin", "super_admin"].includes(adminData.role)) {
            return fail(403, "Only active election administrators can view application records.");
        }

        const electionId = String((event.queryStringParameters || {}).electionId || "").trim();
        if (!electionId || electionId.includes("/")) return fail(400, "Election ID is required.");

        const electionSnap = await db.collection("elections").doc(electionId).get();
        if (!electionSnap.exists) return fail(404, "Election not found. Any orphaned applications have been left untouched.");
        const election = electionSnap.data();

        const [applicationsSnap, resultsSnap] = await Promise.all([
            db.collection("applications").where("electionId", "==", electionId).get(),
            db.collection("results").doc(electionId).get()
        ]);
        const result = resultsSnap.exists ? resultsSnap.data() : null;
        const finalized = isFinalizedResults(result);
        const applications = [];

        for (const appDoc of applicationsSnap.docs) {
            const application = appDoc.data();
            const candidateId = String(application.candidateId || "");
            let candidateEligible = false;
            if (candidateId) {
                const candidateSnap = await db.collection("candidates").doc(candidateId).get();
                if (candidateSnap.exists) {
                    const candidate = candidateSnap.data();
                    candidateEligible = candidate.status === "active" &&
                        candidate.electionId === electionId &&
                        String(candidate.position || "").trim().toLowerCase() === String(application.position || "").trim().toLowerCase();
                }
            }

            const outcome = applicationOutcome(application, election, result, { candidateEligible });
            applications.push({
                id: appDoc.id,
                studentName: String(application.studentName || "Unnamed student"),
                matricNumber: String(application.matricNumber || ""),
                studentDocumentId: String(application.studentDocumentId || ""),
                candidateId,
                positionId: String(application.positionId || ""),
                position: String(application.position || ""),
                storedStatus: String(application.status || "applied"),
                status: outcome.code,
                statusLabel: outcome.label,
                statusMessage: outcome.message,
                disqualifiedReason: application.status === "disqualified" ? String(application.disqualifiedReason || "") : "",
                candidateEligible,
                finalized
            });
        }

        applications.sort((a, b) => a.position.localeCompare(b.position) || a.studentName.localeCompare(b.studentName));
        return jsonResponse(200, {
            success: true,
            election: { id: electionId, title: String(election.title || ""), status: String(election.status || "draft") },
            electionPhase: getElectionPhase(election, { finalized, hasApplications: applications.length > 0 }),
            finalized,
            applications
        });
    } catch (error) {
        logError("Get election applications error", error);
        return fail(500, "Unable to load election applications.");
    }
};
