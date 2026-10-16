/*
 * CAST VOTE
 *
 * Every check below must pass or no vote is stored:
 *  1. POST, valid JSON, valid Firebase ID token (Authorization: Bearer ...).
 *  2. Lockout check (same counters as student-login, see RULES in _lib/guard.js).
 *  3. IDENTITY: the Firebase uid in the token must equal studentAccounts.authUid
 *     for the matric number in the request, and the matric must match. A student
 *     therefore cannot vote as someone else even if they send another matric.
 *  4. The student's PIN is re-verified (PBKDF2, constant time) on every vote.
 *  5. ELECTION: exists, status "published", and now is inside [startAt, endAt).
 *  6. ELIGIBILITY: voters/{electionId}_{matric} exists, is "active", and belongs
 *     to this election + matric.
 *  7. BALLOT: exactly one active candidate for EVERY position, no duplicates,
 *     each candidate really belongs to the position it was submitted under.
 *  8. NO DOUBLE VOTING: votes/{electionId}_{matric} is created inside a
 *     Firestore transaction with create() semantics, so two simultaneous
 *     requests cannot both succeed (the second throws ALREADY_VOTED).
 *     BALLOT SECRECY: that record only says WHO voted. The selections go into a
 *     separate ballots/{random id} document with no link to the voter
 *     (see _lib/ballots.js).
 *  9. LIVE TALLY: in the SAME transaction the vote is added to a sharded
 *     counter (electionTallies/{electionId}/shards/{0-4}). The vote and the
 *     counters commit together or not at all, so they can never disagree.
 *     get-election-results reads these counters instead of every vote, and
 *     verifies them against a count of the votes collection.
 */
const admin = require("firebase-admin");
const crypto = require("crypto");
const {
    jsonResponse, parseBody, logError,
    checkPinLocks, recordPinFailure, clearPinFailures
} = require("./_lib/guard");

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

const TALLY_SHARDS = 5; // must match get-election-results.js

function normalizeMatricNumber(value) {
    return String(value || "").trim().toUpperCase();
}

function isValidPin(pin) {
    return /^\d{4}$/.test(String(pin || ""));
}

function pbkdf2Async(pin, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(pin, salt, 100000, 32, "sha256", (error, key) =>
            error ? reject(error) : resolve(key)
        );
    });
}

async function pinMatches(pin, storedHash, storedSalt) {
    const stored = Buffer.from(storedHash, "hex");
    const derived = await pbkdf2Async(String(pin), Buffer.from(storedSalt, "hex"));
    return stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
}

function toDate(value) {
    return value && value.toDate ? value.toDate() : new Date(value);
}

const fail = (status, message) => jsonResponse(status, { success: false, message });

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") {
        return fail(405, "Method not allowed.");
    }

    try {
        /* ---- 1. Authentication ---- */
        const authHeader = event.headers.authorization || event.headers.Authorization || "";
        if (!authHeader.startsWith("Bearer ")) {
            return fail(401, "Authentication required.");
        }
        const decodedToken = await admin.auth().verifyIdToken(authHeader.substring(7).trim());
        if (!decodedToken || !decodedToken.uid) {
            return fail(401, "Invalid authentication token.");
        }

        const body = parseBody(event);
        if (!body) {
            return fail(400, "Invalid request.");
        }

        const electionId = String(body.electionId || "").trim();
        const matricNumber = normalizeMatricNumber(body.matricNumber);
        const pin = String(body.pin || "");
        const selections = Array.isArray(body.selections) ? body.selections : [];

        if (!electionId || !matricNumber) {
            return fail(400, "Missing voting information.");
        }
        if (electionId.includes("/")) {
            return fail(400, "Invalid election.");
        }
        if (!isValidPin(pin)) {
            return fail(400, "PIN must contain exactly 4 digits.");
        }
        if (!selections.length) {
            return fail(400, "Please select a candidate for each position.");
        }

        /* Clean the submitted selections (shape + duplicates only; the real
           validation against the database happens in step 7). */
        const cleanedSelections = [];
        const positionsSeen = new Set();
        const candidateIdsSeen = new Set();
        for (const selection of selections) {
            const position = String(selection?.position || "").trim();
            const candidateId = String(selection?.candidateId || "").trim();
            if (!position || !candidateId || candidateId.includes("/") || candidateId.includes(".")) {
                return fail(400, "Invalid vote selection.");
            }
            if (positionsSeen.has(position)) {
                return fail(400, "Only one candidate can be selected for each position.");
            }
            if (candidateIdsSeen.has(candidateId)) {
                return fail(400, "Invalid candidate selection.");
            }
            positionsSeen.add(position);
            candidateIdsSeen.add(candidateId);
            cleanedSelections.push({ position, candidateId });
        }

        /* ---- 2. Lockout check ---- */
        const matricDocId = matricNumber.replace(/[^A-Z0-9]/g, "_");
        const lockedResponse = await checkPinLocks(event, matricDocId);
        if (lockedResponse) {
            return lockedResponse;
        }

        /* ---- 3. Identity ---- */
        const accessSnap = await db.collection("studentAccess").doc(matricDocId).get();
        if (!accessSnap.exists) {
            return fail(403, "Student access could not be verified.");
        }
        const studentAccess = accessSnap.data();
        const studentDocumentId = String(studentAccess.studentDocumentId || "").trim();
        if (studentAccess.active !== true || normalizeMatricNumber(studentAccess.matricNumber) !== matricNumber) {
            return fail(403, "Student access could not be verified.");
        }
        if (!studentDocumentId) {
            return fail(403, "Student account is not properly configured.");
        }

        const accountSnap = await db.collection("studentAccounts").doc(studentDocumentId).get();
        if (!accountSnap.exists) {
            return fail(403, "Student account not found.");
        }
        const studentAccount = accountSnap.data();
        if (
            studentAccount.active !== true ||
            studentAccount.authUid !== decodedToken.uid ||
            normalizeMatricNumber(studentAccount.matricNumber) !== matricNumber
        ) {
            return fail(403, "This student account is not authorized for this vote.");
        }
        if (!studentAccount.pinHash || !studentAccount.pinSalt) {
            return fail(403, "Student PIN is not configured.");
        }

        /* ---- 4. PIN ---- */
        if (!(await pinMatches(pin, studentAccount.pinHash, studentAccount.pinSalt))) {
            const lockResponse = await recordPinFailure(event, matricDocId, true);
            if (lockResponse) {
                return lockResponse;
            }
            return fail(403, "Incorrect PIN.");
        }
        await clearPinFailures(event, matricDocId);

        /* ---- 5. Election open? ---- */
        const voterId = `${electionId}_${matricNumber.replace(/[^A-Z0-9]/g, "")}`;
        const electionRef = db.collection("elections").doc(electionId);
        const voteRef = db.collection("votes").doc(voterId);
        const voterRef = db.collection("voters").doc(voterId);

        const [electionSnap, voterSnap] = await Promise.all([electionRef.get(), voterRef.get()]);
        if (!electionSnap.exists) {
            return fail(404, "Election not found.");
        }
        const election = electionSnap.data();
        if (election.status !== "published") {
            return fail(403, "This election is not available.");
        }
        const now = new Date();
        const startAt = toDate(election.startAt);
        const endAt = toDate(election.endAt);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
            return fail(500, "Election timing is not configured correctly.");
        }
        if (now < startAt) {
            return fail(403, "The election has not started yet.");
        }
        if (now >= endAt) {
            return fail(403, "The election has ended.");
        }

        /* ---- 6. Eligibility ---- */
        const voter = voterSnap.exists ? voterSnap.data() : null;
        if (
            !voter ||
            voter.electionId !== electionId ||
            normalizeMatricNumber(voter.matricNumber) !== matricNumber ||
            voter.status !== "active"
        ) {
            return fail(403, "You are not eligible to vote in this election.");
        }

        /* ---- 7. Ballot validation ---- */
        const candidatesSnapshot = await db
            .collection("candidates")
            .where("electionId", "==", electionId)
            .where("status", "==", "active")
            .get();
        if (candidatesSnapshot.empty) {
            return fail(403, "No active candidates are available for this election.");
        }

        const activeCandidatesById = new Map();
        const electionPositions = new Set();
        candidatesSnapshot.forEach(doc => {
            const candidate = doc.data();
            if (!candidate.position) return;
            const position = String(candidate.position).trim();
            electionPositions.add(position);
            activeCandidatesById.set(doc.id, { ...candidate, position });
        });
        if (!electionPositions.size) {
            return fail(403, "Election positions are not configured correctly.");
        }
        if (positionsSeen.size !== electionPositions.size) {
            return fail(400, "Please select a candidate for every position.");
        }
        for (const position of electionPositions) {
            if (!positionsSeen.has(position)) {
                return fail(400, `Please select a candidate for ${position}.`);
            }
        }

        const validatedSelections = [];
        for (const selection of cleanedSelections) {
            const candidate = activeCandidatesById.get(selection.candidateId);
            if (!candidate) {
                return fail(403, "One of the selected candidates is not available for this election.");
            }
            if (candidate.position !== selection.position) {
                return fail(400, "A vote selection does not match its candidate position.");
            }
            validatedSelections.push({ position: selection.position, candidateId: selection.candidateId });
        }

        /* ---- 8 + 9. Store the vote and the tally atomically ---- */
        const receiptCode = "NUNSA-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        const shardRef = db
            .collection("electionTallies").doc(electionId)
            .collection("shards").doc(String(crypto.randomInt(0, TALLY_SHARDS)));
        // Random auto-ID: the ballot's ID says nothing about who or when.
        const ballotRef = db.collection("ballots").doc();

        await db.runTransaction(async transaction => {
            const existingVote = await transaction.get(voteRef);
            if (existingVote.exists) {
                throw new Error("ALREADY_VOTED");
            }

            // Turnout record: WHO voted. Deliberately holds no selections.
            transaction.create(voteRef, {
                electionId,
                matricNumber,
                authUid: decodedToken.uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                receiptCode
            });

            // The ballot: WHAT was chosen. Deliberately holds nothing about the voter.
            transaction.create(ballotRef, {
                electionId,
                selections: validatedSelections
            });

            const candidateCounts = {};
            validatedSelections.forEach(selection => {
                candidateCounts[selection.candidateId] = admin.firestore.FieldValue.increment(1);
            });
            transaction.set(
                shardRef,
                {
                    totalVotes: admin.firestore.FieldValue.increment(1),
                    candidates: candidateCounts
                },
                { merge: true }
            );
        });

        return jsonResponse(200, {
            success: true,
            message: "Your vote has been recorded successfully.",
            receiptCode,
            votedAt: new Date().toISOString()
        });
    } catch (error) {
        if (error && error.message === "ALREADY_VOTED") {
            return fail(409, "You have already voted in this election.");
        }
        if (error && (error.code === "auth/id-token-expired" || error.code === "auth/argument-error")) {
            return fail(401, "Your session has expired. Please log in again.");
        }
        logError("Cast vote error", error);
        return fail(500, "Unable to record your vote.");
    }
};
