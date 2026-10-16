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
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
        return fail(405, "Method not allowed.");
    }

    try {
        const auth = await forms.authenticateStudent(db, event);
        if (auth.error) return fail(auth.error[0], auth.error[1]);
        const student = auth.student;

        /* Open sales */
        const openElections = await db.collection("elections")
            .where("status", "==", "draft")
            .where("formsOpen", "==", true)
            .get();

        const offers = [];
        for (const electionDoc of openElections.docs) {
            const election = electionDoc.data();
            const positionSnap = await db.collection("formPositions")
                .where("electionId", "==", electionDoc.id)
                .get();
            const positions = positionSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(position => position.active === true)
                .map(position => ({
                    id: position.id,
                    position: position.position
                }))
                .sort((a, b) => a.position.localeCompare(b.position));
            if (positions.length) {
                offers.push({ electionId: electionDoc.id, title: String(election.title || ""), positions });
            }
        }

        /* This student's own applications (any election) */
        const mine = await db.collection("applications")
            .where("studentDocumentId", "==", student.studentDocumentId)
            .get();
        const applications = [];
        for (const doc of mine.docs) {
            const app = doc.data();
            const electionSnap = await db.collection("elections").doc(app.electionId).get();
            applications.push({
                electionId: app.electionId,
                electionTitle: electionSnap.exists
                    ? String(electionSnap.data().title || "")
                    : String(app.electionTitle || ""),
                position: app.position,
                status: app.status,
                disqualifiedReason: app.status === "disqualified" ? String(app.disqualifiedReason || "") : undefined
            });
        }

        return jsonResponse(200, { success: true, offers, applications });
    } catch (error) {
        logError("Get form offers error", error);
        return fail(500, "Unable to load candidate forms.");
    }
};
