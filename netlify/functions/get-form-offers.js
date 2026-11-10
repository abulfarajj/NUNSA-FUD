/*
 * GET FORM OFFERS (student)
 * What the dashboard shows: elections whose candidate-form sales are open (with
 * their positions) plus the student's own
 * applications and their status. Draft elections are not readable by students
 * in Firestore, so this goes through the server.
 */
const admin = require("firebase-admin");
const { jsonResponse, logError } = require("./_lib/guard");
const forms = require("./_lib/forms");
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

/** Offers + this student's own applications. Shared with the Telegram bot. */
async function loadOffers(student) {
    /* Open sales */
    const draftElections = await db.collection("elections")
        .where("status", "==", "draft")
        .get();

    const offers = [];
    const lifecycleElections = [];
    for (const electionDoc of draftElections.docs) {
        const election = electionDoc.data();
        const positionSnap = await db.collection("formPositions")
            .where("electionId", "==", electionDoc.id)
            .get();
        const positions = positionSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(position => position.active === true)
            .map(position => ({ id: position.id, position: position.position }))
            .sort((a, b) => a.position.localeCompare(b.position));

        const hasApplications = election.formsOpen !== true && !(await db.collection("applications")
            .where("electionId", "==", electionDoc.id).limit(1).get()).empty;
        const phase = getElectionPhase(election, { hasApplications });
        if (["applications_open", "screening"].includes(phase)) {
            lifecycleElections.push({
                electionId: electionDoc.id,
                title: String(election.title || ""),
                phase,
                createdAt: election.createdAt || null,
                positions
            });
        }
        if (election.formsOpen === true && positions.length) {
            offers.push({ electionId: electionDoc.id, title: String(election.title || ""), positions });
        }
    }
    lifecycleElections.sort((a, b) => {
        const am = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const bm = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return bm - am;
    });

    /* This student's own applications (any election) */
    const mine = await db.collection("applications")
        .where("studentDocumentId", "==", student.studentDocumentId)
        .get();
    const applications = [];
    for (const doc of mine.docs) {
        const app = doc.data();
        const electionId = String(app.electionId || "");
        const electionSnap = electionId ? await db.collection("elections").doc(electionId).get() : null;
        const election = electionSnap && electionSnap.exists ? electionSnap.data() : null;
        const resultSnap = election ? await db.collection("results").doc(electionId).get() : null;
        const finalResult = resultSnap && resultSnap.exists ? resultSnap.data() : null;
        let candidateEligible = false;
        if (election && app.candidateId) {
            const candidateSnap = await db.collection("candidates").doc(String(app.candidateId)).get();
            if (candidateSnap.exists) {
                const candidate = candidateSnap.data();
                candidateEligible = candidate.status === "active" &&
                    candidate.electionId === electionId &&
                    String(candidate.position || "").trim().toLowerCase() === String(app.position || "").trim().toLowerCase();
            }
        }
        const outcome = applicationOutcome(app, election, finalResult, { candidateEligible });
        applications.push({
            electionId,
            electionTitle: election
                ? String(election.title || "")
                : String(app.electionTitle || ""),
            electionStatus: election ? String(election.status || "draft") : "",
            electionPhase: election ? getElectionPhase(election, { finalized: isFinalizedResults(finalResult), hasApplications: true }) : "unavailable",
            position: String(app.position || ""),
            // `storedStatus` preserves the screening record; `status` is the
            // calculated student-facing outcome shared with the dashboard and Telegram.
            storedStatus: String(app.status || "applied"),
            status: outcome.code,
            statusLabel: outcome.label,
            statusMessage: outcome.message,
            finalized: isFinalizedResults(finalResult),
            disqualifiedReason: app.status === "disqualified" ? String(app.disqualifiedReason || "") : undefined
        });
    }

    return { offers, applications, lifecycleElections };
}

exports.handler = async function (event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
        return fail(405, "Method not allowed.");
    }

    try {
        const auth = await forms.authenticateStudent(db, event);
        if (auth.error) return fail(auth.error[0], auth.error[1]);

        const data = await loadOffers(auth.student);
        return jsonResponse(200, { success: true, ...data });
    } catch (error) {
        logError("Get form offers error", error);
        return fail(500, "Unable to load candidate applications.");
    }
};

exports.loadOffers = loadOffers;
