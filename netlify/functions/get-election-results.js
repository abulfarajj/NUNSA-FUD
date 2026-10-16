/*
 * GET ELECTION RESULTS  (live tally while open, final numbers after the end)
 *
 * Who can call it: any signed-in user (student or admin) with a valid token.
 *
 * Reads per request (before this change it read EVERY vote document every time):
 *   - finalized election : election + results doc            (2 reads)
 *   - live election      : election + candidates (N) + 5 tally shards
 *                          + 1 count query (~1 read per 1,000 votes)
 *   - repeated calls within CACHE_MS are answered from memory (0 reads)
 *
 * ACCURACY: the shard counters are written in the same transaction as each
 * vote (see cast-vote.js). On every refresh the shard total is compared with
 * a real count of the votes collection, both read from one consistent
 * snapshot. If they ever differ (for example an election that already had
 * votes before the counters existed) the function falls back to the old full
 * recount, so the numbers shown are always the true numbers.
 * finalize-election-results.js always does a full recount of every ballot.
 * (The `votes` collection only records WHO voted; the choices live in `ballots`.)
 */
const admin = require("firebase-admin");
const { jsonResponse, logError } = require("./_lib/guard");
const { loadAllSelections } = require("./_lib/ballots");

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

const TALLY_SHARDS = 5;          // must match cast-vote.js
const CACHE_MS = 10 * 1000;      // live results
const FINAL_CACHE_MS = 60 * 1000; // finalized results never change
const resultCache = new Map();   // electionId -> { at, ttl, payload }

const fail = (status, message) => jsonResponse(status, { success: false, message });

function toDate(value) {
    return value && value.toDate ? value.toDate() : new Date(value);
}

/* Exact counts from the sharded counters, verified against the real vote count. */
async function readTally(electionId) {
    const shardRefs = [];
    for (let i = 0; i < TALLY_SHARDS; i++) {
        shardRefs.push(db.collection("electionTallies").doc(electionId).collection("shards").doc(String(i)));
    }
    const countQuery = db.collection("votes").where("electionId", "==", electionId).count();

    const { shardSnaps, actualCount } = await db.runTransaction(
        async transaction => {
            const snaps = await transaction.getAll(...shardRefs);
            const countSnap = await transaction.get(countQuery);
            return { shardSnaps: snaps, actualCount: countSnap.data().count };
        },
        { readOnly: true }
    );

    let tallyTotal = 0;
    const counts = {};
    shardSnaps.forEach(snap => {
        if (!snap.exists) return;
        const data = snap.data();
        tallyTotal += Number(data.totalVotes || 0);
        Object.entries(data.candidates || {}).forEach(([candidateId, n]) => {
            counts[candidateId] = (counts[candidateId] || 0) + Number(n || 0);
        });
    });

    if (tallyTotal !== actualCount) {
        return null; // counters do not cover every vote -> caller recounts
    }
    return { counts, totalVotes: actualCount };
}

/* Authoritative (expensive) recount: reads every ballot of this election
   (plus any legacy votes that still hold their selections). */
async function scanVotes(electionId) {
    const { ballots, turnout } = await loadAllSelections(db, electionId);
    const counts = {};
    ballots.forEach(selections => {
        selections.forEach(selection => {
            if (selection && selection.candidateId) {
                counts[selection.candidateId] = (counts[selection.candidateId] || 0) + 1;
            }
        });
    });
    return { counts, totalVotes: turnout };
}

function buildPositions(candidatesSnap, counts) {
    const positionMap = {};
    candidatesSnap.forEach(doc => {
        const candidate = doc.data();
        const position = candidate.position || "Unspecified";
        if (!positionMap[position]) {
            positionMap[position] = { position, candidates: [], totalVotes: 0 };
        }
        const votes = Number(counts[doc.id] || 0);
        positionMap[position].candidates.push({
            id: doc.id,
            name: candidate.name || "",
            profilePicture: candidate.profilePicture || "",
            votes,
            percentage: 0
        });
        positionMap[position].totalVotes += votes;
    });

    const positions = Object.values(positionMap).map(positionData => {
        positionData.candidates.forEach(candidate => {
            candidate.percentage = positionData.totalVotes > 0
                ? Number(((candidate.votes / positionData.totalVotes) * 100).toFixed(2))
                : 0;
        });
        positionData.candidates.sort((a, b) => b.votes - a.votes);
        return {
            position: positionData.position,
            totalVotes: positionData.totalVotes,
            candidates: positionData.candidates
        };
    });
    positions.sort((a, b) => a.position.localeCompare(b.position));
    return positions;
}

exports.handler = async function (event) {
    if (event.httpMethod !== "GET") {
        return fail(405, "Method not allowed.");
    }

    try {
        const authHeader = event.headers.authorization || event.headers.Authorization || "";
        if (!authHeader.startsWith("Bearer ")) {
            return fail(401, "Authentication required.");
        }
        const decodedToken = await admin.auth().verifyIdToken(authHeader.substring(7).trim());
        if (!decodedToken || !decodedToken.uid) {
            return fail(401, "Invalid authentication token.");
        }

        const electionId = String(event.queryStringParameters?.id || "").trim();
        if (!electionId || electionId.includes("/")) {
            return fail(400, "Election ID is required.");
        }

        const cached = resultCache.get(electionId);
        if (cached && Date.now() - cached.at < cached.ttl) {
            return jsonResponse(200, cached.payload);
        }

        const electionSnap = await db.collection("elections").doc(electionId).get();
        if (!electionSnap.exists) {
            return fail(404, "Election not found.");
        }
        const election = electionSnap.data();
        if (election.status !== "published") {
            return fail(403, "Results are not available for this election.");
        }

        const now = new Date();
        const startAt = toDate(election.startAt);
        const endAt = toDate(election.endAt);
        let electionStatus = "upcoming";
        if (now >= startAt && now < endAt) electionStatus = "active";
        if (now >= endAt) electionStatus = "ended";

        const electionInfo = {
            id: electionId,
            title: election.title || "",
            description: election.description || "",
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString()
        };

        /* Finalized: serve the stored result. */
        if (electionStatus === "ended") {
            const finalSnap = await db.collection("results").doc(electionId).get();
            if (finalSnap.exists) {
                const finalResults = finalSnap.data();
                const payload = {
                    success: true,
                    finalized: true,
                    electionStatus,
                    election: electionInfo,
                    positions: finalResults.positions || [],
                    totalVotes: finalResults.totalVotes || 0,
                    finalizedAt: finalResults.finalizedAt?.toDate
                        ? finalResults.finalizedAt.toDate().toISOString()
                        : finalResults.finalizedAt || null
                };
                resultCache.set(electionId, { at: Date.now(), ttl: FINAL_CACHE_MS, payload });
                return jsonResponse(200, payload);
            }
        }

        /* Live (or ended-but-not-yet-finalized): counters, verified. */
        const candidatesSnap = await db
            .collection("candidates")
            .where("electionId", "==", electionId)
            .where("status", "==", "active")
            .get();

        let tally = null;
        try {
            tally = await readTally(electionId);
        } catch (tallyError) {
            logError("Tally read failed, recounting", tallyError);
        }
        if (!tally) {
            tally = await scanVotes(electionId);
        }

        const payload = {
            success: true,
            finalized: false,
            electionStatus,
            election: electionInfo,
            positions: buildPositions(candidatesSnap, tally.counts),
            totalVotes: tally.totalVotes
        };

        /* An ended election is about to be finalized: do not serve it stale. */
        if (electionStatus !== "ended") {
            resultCache.set(electionId, { at: Date.now(), ttl: CACHE_MS, payload });
        }
        return jsonResponse(200, payload);
    } catch (error) {
        if (error && (error.code === "auth/id-token-expired" || error.code === "auth/argument-error")) {
            return fail(401, "Your session has expired. Please log in again.");
        }
        logError("Get election results error", error);
        return fail(500, "Unable to load election results.");
    }
};
