/*
 * APPLY FOR A POSITION (student)
 *
 * The student picks a position; the server records the application AND adds
 * them as a candidate in one transaction. Admins then screen applicants in real
 * life and disqualify anyone who does not qualify (review-application.js).
 *
 * Checks: logged-in registered student | election is a DRAFT with applications
 * open | position is active and belongs to that election | one application per
 * student per election. Eligibility is NOT checked here: admins do it.
 * The draft/open check runs INSIDE the transaction, so an application can never
 * slip in after the election is published.
 */
const admin = require("firebase-admin");
const guard = require("./_lib/guard");
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
const { jsonResponse, parseBody, logError } = guard;
const fail = (status, message) => jsonResponse(status, { success: false, message });

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") return fail(405, "Method not allowed.");

    try {
        const auth = await forms.authenticateStudent(db, event);
        if (auth.error) return fail(auth.error[0], auth.error[1]);
        const student = auth.student;

        const limited = await guard.consume(`apply:${student.studentDocumentId}`, 10, 10 * 60 * 1000);
        if (!limited.allowed) return guard.tooManyResponse(limited.retryAfterSec);

        const body = parseBody(event);
        if (!body) return fail(400, "Invalid request.");
        const electionId = String(body.electionId || "").trim();
        const positionId = String(body.positionId || "").trim();
        if (!electionId || electionId.includes("/") || !positionId || positionId.includes("/")) {
            return fail(400, "Choose a position.");
        }

        const appId = forms.applicationId(electionId, student.studentDocumentId);
        const appRef = db.collection("applications").doc(appId);
        const electionRef = db.collection("elections").doc(electionId);
        const positionRef = db.collection("formPositions").doc(positionId);
        const candidateRef = db.collection("candidates").doc("form_" + appId);

        const outcome = await db.runTransaction(async tx => {
            const [electionSnap, positionSnap, existing] = await Promise.all([
                tx.get(electionRef), tx.get(positionRef), tx.get(appRef)
            ]);

            const election = electionSnap.exists ? electionSnap.data() : null;
            if (!election || election.status !== "draft" || election.formsOpen !== true) {
                return { error: [403, "Applications are not open for this election."] };
            }
            const position = positionSnap.exists ? positionSnap.data() : null;
            if (!position || position.electionId !== electionId || position.active !== true) {
                return { error: [404, "This position is not available."] };
            }
            if (existing.exists) {
                return { error: [409, "You have already applied in this election."] };
            }

            tx.create(appRef, {
                electionId,
                positionId,
                position: String(position.position),
                studentDocumentId: student.studentDocumentId,
                matricNumber: student.matricNumber,
                studentName: student.name,
                profilePicture: student.profilePicture,
                authUid: student.uid,
                status: "applied",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                candidateId: candidateRef.id
            });
            tx.create(candidateRef, {
                electionId,
                matricNumber: student.matricNumber,
                name: student.name,
                profilePicture: student.profilePicture,
                position: String(position.position),
                status: "active",
                voteCount: 0,
                source: "application",
                applicationId: appId,
                createdBy: "system",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { ok: true, position: String(position.position) };
        });

        if (outcome.error) return fail(outcome.error[0], outcome.error[1]);
        return jsonResponse(200, {
            success: true,
            message: `You have applied for ${outcome.position}. The admins will screen applicants before the election.`
        });
    } catch (error) {
        logError("Apply for position error", error);
        return fail(500, "Unable to submit your application.");
    }
};
