/*
 * Public-facing, authenticated election overview.
 * Students cannot read the candidates collection directly under Firestore rules,
 * so this function returns only approved public candidate fields for published
 * or ended elections. Matric numbers and internal review fields are never sent.
 */
const admin = require("firebase-admin");
const { jsonResponse, logError } = require("./_lib/guard");
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
const fail = (status, message) => jsonResponse(status, { success: false, message });
const clean = (value, limit) => String(value || "").trim().slice(0, limit);

exports.handler = async event => {
    if (event.httpMethod !== "GET") return fail(405, "Method not allowed.");
    try {
        const header = event.headers.authorization || event.headers.Authorization || "";
        if (!header.startsWith("Bearer ")) return fail(401, "Please log in again.");
        let decoded;
        try { decoded = await admin.auth().verifyIdToken(header.slice(7).trim()); }
        catch { return fail(401, "Your session has expired. Please log in again."); }

        const adminSnap = await db.collection("admins").doc(decoded.uid).get();
        let authorized = adminSnap.exists && adminSnap.data().active === true;
        if (!authorized) {
            const studentAuth = await forms.authenticateStudent(db, event);
            if (studentAuth.error) return fail(studentAuth.error[0], studentAuth.error[1]);
            authorized = true;
        }
        if (!authorized) return fail(403, "You do not have access to this election.");

        const params = event.queryStringParameters || {};
        const electionId = clean(params.electionId, 120);
        if (!electionId || electionId.includes("/")) return fail(400, "Election ID is required.");
        const electionSnap = await db.collection("elections").doc(electionId).get();
        if (!electionSnap.exists) return fail(404, "Election not found.");
        const election = electionSnap.data();
        if (!["published", "ended"].includes(election.status)) return fail(403, "This election is not publicly available.");

        const snap = await db.collection("candidates").where("electionId", "==", electionId).get();
        const candidates = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                name: clean(d.name, 100) || "Unnamed candidate",
                position: clean(d.position, 80) || "General",
                profilePicture: clean(d.profilePicture || d.image, 800) || "assets/default-profile.jpg",
                biography: clean(d.biography || d.bio, 1200),
                manifesto: clean(d.manifesto, 4000),
                status: d.status === "disqualified" ? "disqualified" : "active"
            };
        }).filter(c => c.status === "active").sort((a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name));

        const requestedCandidate = clean(params.candidateId, 120);
        const selected = requestedCandidate ? candidates.find(c => c.id === requestedCandidate) : null;
        if (requestedCandidate && !selected) return fail(404, "Candidate not found in this election.");
        const positions = [...new Set(candidates.map(c => c.position))];
        return jsonResponse(200, {
            success: true,
            election: {
                id: electionId,
                title: clean(election.title, 160),
                description: clean(election.description, 2000),
                status: election.status,
                startAt: election.startAt && election.startAt.toMillis ? election.startAt.toMillis() : (election.startAt ? new Date(election.startAt).getTime() : 0),
                endAt: election.endAt && election.endAt.toMillis ? election.endAt.toMillis() : (election.endAt ? new Date(election.endAt).getTime() : 0),
                termEndsAt: election.termEndsAt && election.termEndsAt.toMillis ? election.termEndsAt.toMillis() : (election.termEndsAt ? new Date(election.termEndsAt).getTime() : 0)
            },
            totalCandidates: candidates.length,
            totalPositions: positions.length,
            positions,
            candidates: selected ? [selected] : candidates
        });
    } catch (error) {
        logError("Election overview error", error);
        return fail(500, "Unable to load election information.");
    }
};
