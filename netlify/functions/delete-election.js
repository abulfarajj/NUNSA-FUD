/*
 * DELETE ELECTION (Super Admin only)
 *
 * For an election created or published by mistake. Removes the election and
 * everything hanging off it: candidates, applications, voter list, form
 * positions, tally counters, results and any ballots.
 *
 * REFUSED if anyone has already voted: deleting would destroy real votes.
 *
 * Candidate applications for the election are deleted with it.
 *
 * Body: { electionId, confirmTitle }  (confirmTitle must equal the election title)
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

async function deleteRefs(refs) {
    for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
    }
}

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") return fail(405, "Method not allowed.");

    try {
        const header = event.headers.authorization || event.headers.Authorization || "";
        if (!header.startsWith("Bearer ")) return fail(401, "Authentication required.");
        const decoded = await admin.auth().verifyIdToken(header.substring(7).trim());

        const adminSnap = await db.collection("admins").doc(decoded.uid).get();
        const adminData = adminSnap.exists ? adminSnap.data() : null;
        if (!adminData || adminData.active !== true || adminData.role !== "super_admin") {
            return fail(403, "Only a Super Admin can delete an election.");
        }

        const body = parseBody(event);
        if (!body) return fail(400, "Invalid request.");
        const electionId = String(body.electionId || "").trim();
        if (!electionId || electionId.includes("/")) return fail(400, "Missing election.");

        const electionRef = db.collection("elections").doc(electionId);
        const electionSnap = await electionRef.get();
        if (!electionSnap.exists) return fail(404, "Election not found.");
        const election = electionSnap.data();

        if (String(body.confirmTitle || "").trim() !== String(election.title || "").trim()) {
            return fail(400, "Type the election title exactly to confirm.");
        }

        const anyVote = await db.collection("votes").where("electionId", "==", electionId).limit(1).get();
        if (!anyVote.empty) {
            return fail(409, "Votes have already been cast in this election, so it cannot be deleted.");
        }

        const idsOf = async (collection, field = "electionId") =>
            (await db.collection(collection).where(field, "==", electionId).get()).docs.map(doc => doc.ref);

        const candidateRefs = await idsOf("candidates");
        const voterRefs = await idsOf("voters");
        const positionRefs = await idsOf("formPositions");
        const ballotRefs = await idsOf("ballots");
        const shardRefs = (await db.collection("electionTallies").doc(electionId).collection("shards").get())
            .docs.map(doc => doc.ref);

        const applicationRefs = await idsOf("applications");

        await deleteRefs([
            ...candidateRefs, ...voterRefs, ...positionRefs, ...ballotRefs, ...shardRefs, ...applicationRefs,
            db.collection("electionTallies").doc(electionId),
            db.collection("results").doc(electionId)
        ]);

        const batch = db.batch();
        batch.delete(electionRef);
        batch.set(auditLogRef(), auditLogEntry({
            action: "election_deleted",
            electionId,
            electionTitle: String(election.title || ""),
            electionStatus: String(election.status || ""),
            candidatesRemoved: candidateRefs.length,
            votersRemoved: voterRefs.length,
            applicationsRemoved: applicationRefs.length,
            actorUid: decoded.uid,
            actorEmail: String(adminData.email || decoded.email || ""),
            actorRole: adminData.role
        }));
        await batch.commit();

        return jsonResponse(200, { success: true, message: "Election deleted." });
    } catch (error) {
        if (error && (error.code === "auth/id-token-expired" || error.code === "auth/argument-error")) {
            return fail(401, "Your session has expired. Please log in again.");
        }
        logError("Delete election error", error);
        return fail(500, "Unable to delete this election.");
    }
};
