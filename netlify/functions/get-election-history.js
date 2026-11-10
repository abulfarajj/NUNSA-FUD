/*
 * Authenticated election archive for the student and admin results pages.
 * It combines completed election documents with finalized result documents so
 * historical results remain discoverable if an election metadata doc is gone.
 */
const admin = require("firebase-admin");
const { jsonResponse, logError } = require("./_lib/guard");
const forms = require("./_lib/forms");
const { toMillis, isFinalizedResults, getElectionPhase } = require("./_lib/election-lifecycle");

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
const iso = value => {
    const ms = toMillis(value);
    return ms ? new Date(ms).toISOString() : null;
};

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
        const isAdmin = Boolean(adminData && adminData.active === true && ["admin", "super_admin"].includes(adminData.role));
        if (!isAdmin) {
            const auth = await forms.authenticateStudent(db, event);
            if (auth.error) return fail(auth.error[0], auth.error[1]);
        }

        const [electionsSnap, resultsSnap] = await Promise.all([
            db.collection("elections").get(),
            db.collection("results").get()
        ]);
        const elections = new Map(electionsSnap.docs.map(doc => [doc.id, doc.data()]));
        const history = new Map();
        const now = Date.now();

        for (const resultDoc of resultsSnap.docs) {
            const result = resultDoc.data();
            if (!isFinalizedResults(result)) continue;
            const election = elections.get(resultDoc.id) || {};
            history.set(resultDoc.id, {
                id: resultDoc.id,
                title: String(election.title || result.title || "Historical election"),
                status: String(election.status || "ended"),
                startAt: iso(election.startAt || result.startAt),
                endAt: iso(election.endAt || result.endAt),
                finalizedAt: iso(result.finalizedAt),
                finalized: true,
                phase: "results_finalized"
            });
        }

        for (const [electionId, election] of elections) {
            if (!["published", "ended"].includes(election.status)) continue;
            const endAt = toMillis(election.endAt);
            const resultExists = history.has(electionId);
            if (!resultExists && election.status !== "ended" && (!endAt || endAt > now)) continue;
            const finalized = resultExists;
            history.set(electionId, {
                id: electionId,
                title: String(election.title || "Election"),
                status: String(election.status || "published"),
                startAt: iso(election.startAt),
                endAt: iso(election.endAt),
                finalizedAt: finalized ? history.get(electionId).finalizedAt : null,
                finalized,
                phase: getElectionPhase(election, { finalized })
            });
        }

        const electionsList = [...history.values()].sort((a, b) =>
            (Date.parse(b.endAt || b.finalizedAt || "") || 0) - (Date.parse(a.endAt || a.finalizedAt || "") || 0)
        );
        return jsonResponse(200, { success: true, elections: electionsList });
    } catch (error) {
        logError("Get election history error", error);
        return fail(500, "Unable to load election history.");
    }
};
