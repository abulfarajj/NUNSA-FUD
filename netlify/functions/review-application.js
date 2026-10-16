/*
 * REVIEW APPLICATION (any active admin)
 *
 * After the real-life screening an admin disqualifies applicants who do not
 * qualify (or reinstates one by mistake). Everyone who applied and is
 * NOT disqualified stays a candidate, and the remaining candidates are the
 * ones the voting page shows.
 *
 *   { applicationId, action: "disqualify" | "reinstate", reason? }
 *
 * Only while the election is still a draft: once it is published the ballot is
 * frozen. Every decision is written to auditLogs together with the change.
 */
const admin = require("firebase-admin");
const { jsonResponse, parseBody, logError, auditLogRef, auditLogEntry } = require("./_lib/guard");

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

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") return fail(405, "Method not allowed.");

    try {
        const header = event.headers.authorization || event.headers.Authorization || "";
        if (!header.startsWith("Bearer ")) return fail(401, "Authentication required.");
        const decoded = await admin.auth().verifyIdToken(header.substring(7).trim());

        const adminSnap = await db.collection("admins").doc(decoded.uid).get();
        const adminData = adminSnap.exists ? adminSnap.data() : null;
        if (!adminData || adminData.active !== true || !["admin", "super_admin"].includes(adminData.role)) {
            return fail(403, "Administrator access required.");
        }

        const body = parseBody(event);
        if (!body) return fail(400, "Invalid request.");
        const applicationId = String(body.applicationId || "").trim();
        const action = String(body.action || "");
        const reason = String(body.reason || "").trim().slice(0, 300);
        if (!applicationId || applicationId.includes("/")) return fail(400, "Missing application.");
        if (!["disqualify", "reinstate"].includes(action)) return fail(400, "Unknown action.");

        const appRef = db.collection("applications").doc(applicationId);
        const outcome = await db.runTransaction(async tx => {
            const appSnap = await tx.get(appRef);
            if (!appSnap.exists) return { error: [404, "Application not found."] };
            const app = appSnap.data();

            const electionSnap = await tx.get(db.collection("elections").doc(app.electionId));
            if (!electionSnap.exists || electionSnap.data().status !== "draft") {
                return { error: [409, "The election is already published, so the candidate list can no longer be changed."] };
            }

            const candidateRef = db.collection("candidates").doc(app.candidateId || ("form_" + applicationId));
            const candidateSnap = await tx.get(candidateRef);

            if (action === "disqualify") {
                if (app.status !== "applied") {
                    return { error: [409, "Only active applicants can be disqualified."] };
                }
                tx.update(appRef, {
                    status: "disqualified",
                    disqualifiedReason: reason,
                    reviewedBy: decoded.uid,
                    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                if (candidateSnap.exists) tx.update(candidateRef, { status: "disqualified" });
            } else {
                if (app.status !== "disqualified") {
                    return { error: [409, "Only disqualified applicants can be reinstated."] };
                }
                tx.update(appRef, {
                    status: "applied",
                    disqualifiedReason: admin.firestore.FieldValue.delete(),
                    reviewedBy: decoded.uid,
                    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                if (candidateSnap.exists) {
                    tx.update(candidateRef, { status: "active" });
                } else {
                    // The candidate entry was removed by hand earlier: recreate it.
                    tx.create(candidateRef, {
                        electionId: app.electionId,
                        matricNumber: app.matricNumber,
                        name: app.studentName,
                        profilePicture: app.profilePicture || "assets/default-profile.jpg",
                        position: app.position,
                        status: "active",
                        voteCount: 0,
                        source: "application",
                        applicationId,
                        createdBy: "system",
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            tx.set(auditLogRef(), auditLogEntry({
                action: action === "disqualify" ? "applicant_disqualified" : "applicant_reinstated",
                applicationId,
                electionId: app.electionId,
                matricNumber: app.matricNumber,
                position: app.position,
                reason,
                actorUid: decoded.uid,
                actorEmail: String(adminData.email || decoded.email || ""),
                actorRole: adminData.role
            }));
            return { ok: true, name: app.studentName, position: app.position };
        });

        if (outcome.error) return fail(outcome.error[0], outcome.error[1]);
        return jsonResponse(200, {
            success: true,
            message: action === "disqualify"
                ? `${outcome.name} was disqualified from ${outcome.position}.`
                : `${outcome.name} was reinstated for ${outcome.position}.`
        });
    } catch (error) {
        if (error && (error.code === "auth/id-token-expired" || error.code === "auth/argument-error")) {
            return fail(401, "Your session has expired. Please log in again.");
        }
        logError("Review application error", error);
        return fail(500, "Unable to update this applicant.");
    }
};
