/*
 * MANAGE VOTERS  (add one / import many / remove one) WITH AN AUDIT LOG
 *
 * Voters are no longer written from the browser. Firestore rules refuse client
 * creates/deletes on `voters`, so every change has to come through here, and
 * every change leaves an entry in `auditLogs` that records:
 *   who (admin uid + e-mail), what (added / imported / removed), which matric
 *   numbers, which election, when (server time), and whether voting was
 *   before / during / after the voting window.
 * The voter change and its log entry are written in the SAME batch, so one can
 * never exist without the other.
 *
 * Who can call it: an ACTIVE Super Admin (valid Firebase ID token required).
 *
 * POST body:
 *   { action: "add",    electionId, matricNumber }
 *   { action: "import", electionId, matricNumbers: [...] }
 *   { action: "remove", electionId, matricNumber }
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

const MAX_PER_REQUEST = 2000;
const WRITE_CHUNK = 200; // voters per batch (each batch also holds 1 audit entry)
const fail = (status, message) => jsonResponse(status, { success: false, message });

function normalizeMatric(value) {
    return String(value || "").trim().toUpperCase();
}

function voterDocumentId(electionId, matricNumber) {
    return electionId + "_" + normalizeMatric(matricNumber).replace(/[^A-Z0-9]/g, "");
}

function validMatric(matric) {
    return matric.length > 0 && matric.length <= 40 && /^[A-Z0-9 /._\-]+$/.test(matric) && /[A-Z0-9]/.test(matric);
}

function toDate(value) {
    return value && value.toDate ? value.toDate() : new Date(value);
}

function votingPhase(election) {
    const start = toDate(election.startAt);
    const end = toDate(election.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return election.status === "published" ? "unknown" : "before_voting";
    }
    const now = new Date();
    if (election.status !== "published" || now < start) return "before_voting";
    if (now < end) return "during_voting";
    return "after_voting";
}

function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") {
        return fail(405, "Method not allowed.");
    }

    try {
        /* ---- Authentication: valid token + active Super Admin ---- */
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
            return fail(403, "Only a Super Admin can manage voters.");
        }
        const actor = {
            actorUid: decoded.uid,
            actorEmail: String(adminData.email || decoded.email || ""),
            actorRole: adminData.role
        };

        /* ---- Request ---- */
        const body = parseBody(event);
        if (!body) {
            return fail(400, "Invalid request.");
        }
        const action = String(body.action || "");
        const electionId = String(body.electionId || "").trim();
        if (!["add", "import", "remove"].includes(action)) {
            return fail(400, "Unknown action.");
        }
        if (!electionId || electionId.includes("/")) {
            return fail(400, "Election ID is required.");
        }

        const electionSnap = await db.collection("elections").doc(electionId).get();
        if (!electionSnap.exists) {
            return fail(404, "Election not found.");
        }
        const election = electionSnap.data();
        const phase = votingPhase(election);
        const context = {
            electionId,
            electionTitle: String(election.title || ""),
            electionPhase: phase,
            ...actor
        };

        /* ---- Collect + clean matric numbers ---- */
        const rawList = action === "import"
            ? (Array.isArray(body.matricNumbers) ? body.matricNumbers : [])
            : [body.matricNumber];
        const matricNumbers = [...new Set(rawList.map(normalizeMatric).filter(Boolean))];

        if (!matricNumbers.length) {
            return fail(400, action === "import" ? "No matric numbers were provided." : "Enter a matric number.");
        }
        if (matricNumbers.length > MAX_PER_REQUEST) {
            return fail(400, `Import at most ${MAX_PER_REQUEST} voters at a time.`);
        }
        const badMatric = matricNumbers.find(matric => !validMatric(matric));
        if (badMatric) {
            return fail(400, `"${badMatric.slice(0, 40)}" is not a valid matric number.`);
        }

        /* ================= REMOVE ================= */
        if (action === "remove") {
            const matricNumber = matricNumbers[0];
            const voterId = voterDocumentId(electionId, matricNumber);
            const voterRef = db.collection("voters").doc(voterId);
            const voterSnap = await voterRef.get();
            if (!voterSnap.exists || voterSnap.data().electionId !== electionId) {
                return fail(404, "This voter is not on the list for this election.");
            }
            const alreadyVoted = await db.collection("votes").doc(voterId).get();
            if (alreadyVoted.exists) {
                return fail(409, "This voter has already voted and cannot be removed.");
            }

            const batch = db.batch();
            batch.delete(voterRef);
            batch.set(auditLogRef(), auditLogEntry({
                action: "voter_removed",
                ...context,
                matricNumbers: [matricNumber],
                count: 1
            }));
            await batch.commit();

            return jsonResponse(200, { success: true, message: "Voter removed.", removed: 1 });
        }

        /* ================= ADD / IMPORT ================= */

        // Which of these matrics are real students? (Single "add" requires it; import only reports it.)
        const knownStudents = new Set();
        for (const group of chunk(matricNumbers, 30)) {
            const snap = await db.collection("students").where("matricNumber", "in", group).get();
            snap.forEach(doc => knownStudents.add(normalizeMatric(doc.data().matricNumber)));
        }
        const notInStudentList = matricNumbers.filter(matric => !knownStudents.has(matric));

        if (action === "add" && notInStudentList.length) {
            return fail(400, "This matric number does not exist in the student list.");
        }

        // Skip people who are already on this election's voter list.
        const voterRefs = matricNumbers.map(matric => db.collection("voters").doc(voterDocumentId(electionId, matric)));
        const existing = new Set();
        for (const group of chunk(voterRefs, 300)) {
            const snaps = await db.getAll(...group);
            snaps.forEach(snap => { if (snap.exists) existing.add(snap.id); });
        }
        const toAdd = matricNumbers.filter(
            matric => !existing.has(voterDocumentId(electionId, matric))
        );

        if (action === "add" && !toAdd.length) {
            return fail(409, "This student is already an eligible voter for this election.");
        }

        // Each batch = up to WRITE_CHUNK voters + the audit entry that describes exactly those voters.
        for (const group of chunk(toAdd, WRITE_CHUNK)) {
            const batch = db.batch();
            group.forEach(matric => {
                batch.create(db.collection("voters").doc(voterDocumentId(electionId, matric)), {
                    electionId,
                    matricNumber: matric,
                    status: "active",
                    createdBy: decoded.uid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            batch.set(auditLogRef(), auditLogEntry({
                action: action === "add" ? "voter_added" : "voters_imported",
                ...context,
                matricNumbers: group,
                count: group.length
            }));
            await batch.commit();
        }

        return jsonResponse(200, {
            success: true,
            message: action === "add" ? "Voter added successfully." : `${toAdd.length} voter(s) imported successfully.`,
            added: toAdd.length,
            skippedExisting: matricNumbers.length - toAdd.length,
            notInStudentList: notInStudentList.slice(0, 50),
            notInStudentListCount: notInStudentList.length
        });
    } catch (error) {
        if (error && (error.code === "auth/id-token-expired" || error.code === "auth/argument-error")) {
            return fail(401, "Your session has expired. Please log in again.");
        }
        if (error && error.code === 6) { // ALREADY_EXISTS: two admins added the same voter at once
            return fail(409, "A voter in this list was just added by someone else. Please try again.");
        }
        logError("Manage voters error", error);
        return fail(500, "Unable to update the voter list.");
    }
};
