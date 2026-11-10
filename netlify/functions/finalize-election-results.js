const admin = require("firebase-admin");
const { logError } = require("./_lib/guard");
const { loadAllSelections } = require("./_lib/ballots");
const { positionOutcome, isFinalizedResults } = require("./_lib/election-lifecycle");

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

exports.handler = async (event) => {

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message: "Method not allowed."
            })
        };
    }

    try {

        const authorization =
            event.headers.authorization ||
            event.headers.Authorization ||
            "";

        if (!authorization.startsWith("Bearer ")) {
            return {
                statusCode: 401,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Authentication required."
                })
            };
        }

        const idToken =
            authorization.substring(7);

        const decodedToken =
            await admin
                .auth()
                .verifyIdToken(idToken);

        const adminRef =
            db
                .collection("admins")
                .doc(decodedToken.uid);

        const adminSnapshot =
            await adminRef.get();

        if (!adminSnapshot.exists) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Administrator access required."
                })
            };
        }

        const adminData =
            adminSnapshot.data();

        if (
            adminData.active !== true ||
            (
                adminData.role !== "admin" &&
                adminData.role !== "super_admin"
            )
        ) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Administrator access required."
                })
            };
        }

        const data =
            JSON.parse(
                event.body || "{}"
            );

        const electionId =
            String(
                data.electionId || ""
            ).trim();

        if (!electionId) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Election ID is required."
                })
            };
        }

        const electionRef =
            db
                .collection("elections")
                .doc(electionId);

        const electionSnapshot =
            await electionRef.get();

        if (!electionSnapshot.exists) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Election not found."
                })
            };
        }

        const election =
            electionSnapshot.data();

        const resultRef = db.collection("results").doc(electionId);
        const existingResult = await resultRef.get();
        if (existingResult.exists) {
            const savedResult = existingResult.data();
            if (!isFinalizedResults(savedResult)) {
                return {
                    statusCode: 409,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        success: false,
                        message: "An existing results record is incomplete and has been preserved for administrator review. It was not treated as finalized."
                    })
                };
            }
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    success: true,
                    alreadyFinalized: true,
                    result: savedResult
                })
            };
        }

        if (!["published", "ended"].includes(election.status)) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ success: false, message: "This election has not been published." })
            };
        }

        const endAt = election.endAt && election.endAt.toDate
            ? election.endAt.toDate()
            : new Date(election.endAt);
        if (Number.isNaN(endAt.getTime())) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ success: false, message: "The election closing time is invalid." })
            };
        }
        if (Date.now() < endAt.getTime()) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ success: false, message: "The election has not ended yet." })
            };
        }

        const candidatesSnapshot =
            await db
                .collection("candidates")
                .where(
                    "electionId",
                    "==",
                    electionId
                )
                .where(
                    "status",
                    "==",
                    "active"
                )
                .get();

        // Choices live in `ballots` (no voter attached); `votes` only says who voted.
        const { ballots: allBallots, turnout } =
            await loadAllSelections(db, electionId);

        const candidates =
            candidatesSnapshot.docs.map(
                (candidateDoc) => ({
                    id: candidateDoc.id,
                    ...candidateDoc.data()
                })
            );

        // Seed every configured election position, including positions with
        // no eligible candidates. This lets a finalized empty/tied position
        // supersede an older incumbent without inventing a winner.
        const positionDefinitions = await db.collection("formPositions")
            .where("electionId", "==", electionId)
            .get();
        const positionMap = Object.create(null);
        positionDefinitions.forEach(positionDoc => {
            const position = String(positionDoc.data().position || "").trim();
            if (!position) return;
            if (!positionMap[position]) {
                positionMap[position] = { position, totalVotes: 0, candidates: [] };
            }
        });

        candidates.forEach(
            (candidate) => {

                const position =
                    candidate.position ||
                    "Unspecified";

                if (
                    !positionMap[position]
                ) {
                    positionMap[position] = {
                        position,
                        totalVotes: 0,
                        candidates: []
                    };
                }

                positionMap[position]
                    .candidates
                    .push({
                        id: candidate.id,
                        name:
                            candidate.name || "",
                        profilePicture:
                            candidate.profilePicture ||
                            "assets/default-profile.jpg",
                        votes: 0,
                        percentage: 0
                    });
            }
        );

        const candidateLookup = {};

        Object.values(positionMap).forEach(
            (positionData) => {

                positionData.candidates.forEach(
                    (candidate) => {

                        candidateLookup[candidate.id] = {
                            candidate,
                            positionData
                        };
                    }
                );
            }
        );

        const totalVotes = turnout;

        allBallots.forEach(
            (selections) => {

                selections.forEach(
                    (selection) => {

                        if (
                            !selection ||
                            !selection.candidateId
                        ) {
                            return;
                        }

                        const matchedCandidate =
                            candidateLookup[
                                selection.candidateId
                            ];

                        if (
                            !matchedCandidate
                        ) {
                            return;
                        }

                        matchedCandidate
                            .candidate
                            .votes++;

                        matchedCandidate
                            .positionData
                            .totalVotes++;
                    }
                );
            }
        );

        const positions =
            Object.values(
                positionMap
            ).map(
                (positionData) => {

                    const positionTotal =
                        positionData.totalVotes;

                    positionData.candidates.sort(
                        (a, b) =>
                            b.votes - a.votes
                    );

                    positionData.candidates.forEach(
                        (candidate) => {

                            candidate.percentage =
                                positionTotal > 0
                                    ? Number(
                                        (
                                            candidate.votes /
                                            positionTotal *
                                            100
                                        ).toFixed(2)
                                    )
                                    : 0;
                        }
                    );

                    const outcome = positionOutcome(positionData);
                    return {
                        position: positionData.position,
                        totalVotes: positionData.totalVotes,
                        candidates: positionData.candidates,
                        outcome: outcome.status,
                        winnerId: outcome.winnerId
                    };
                }
            );

        positions.sort(
            (a, b) =>
                a.position.localeCompare(
                    b.position
                )
        );

        const resultData = {
            electionId,
            finalized: true,
            title: election.title || "",
            description: election.description || "",
            // Keep the election chronology and optional term date with the
            // immutable result so historical status can survive accidental
            // removal of the corresponding elections document.
            createdAt: election.createdAt || null,
            startAt: election.startAt || null,
            endAt: election.endAt || null,
            termEndsAt: election.termEndsAt || null,
            totalVotes,
            positions,
            finalizedAt:
                admin.firestore.FieldValue.serverTimestamp()
        };

        let alreadyFinalized = false;
        try {
            await resultRef.create(resultData);
        } catch (createError) {
            // Two admins finalizing at the same moment: the first one wins, we return its result.
            if (createError.code !== 6) throw createError;
            alreadyFinalized = true;
        }

        const finalSnapshot = await resultRef.get();
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                success: true,
                alreadyFinalized,
                result: finalSnapshot.data()
            })
        };

    } catch (error) {

        logError("Finalize election results error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message:
                    "Unable to finalize election results."
            })
        };
    }
};