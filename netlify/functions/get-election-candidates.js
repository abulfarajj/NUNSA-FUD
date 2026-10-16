const admin = require("firebase-admin");
const { logError } = require("./_lib/guard");

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

exports.handler = async function(event) {
    if (event.httpMethod !== "GET") {
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
            authorization.replace("Bearer ", "").trim();

        const decodedToken =
            await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.uid) {
            return {
                statusCode: 401,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Invalid authentication token."
                })
            };
        }

        const params =
            new URLSearchParams(event.rawQuery || "");

        const electionId =
            params.get("electionId");

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
            db.collection("elections").doc(electionId);

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

        if (election.status !== "published") {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "This election is not available."
                })
            };
        }

        const now =
            new Date();

        const startAt =
            election.startAt?.toDate
                ? election.startAt.toDate()
                : new Date(election.startAt);

        const endAt =
            election.endAt?.toDate
                ? election.endAt.toDate()
                : new Date(election.endAt);

        if (now < startAt) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "This election has not started yet."
                })
            };
        }

        if (now >= endAt) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "This election has ended."
                })
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
                .orderBy(
                    "createdAt",
                    "asc"
                )
                .get();

        const candidates =
            candidatesSnapshot.docs.map(
                candidateDocument => {
                    const candidate =
                        candidateDocument.data();

                    return {
                        id: candidateDocument.id,
                        name: candidate.name || "Unnamed Candidate",
                        profilePicture:
                            candidate.profilePicture ||
                            candidate.image ||
                            "assets/default-profile.jpg",
                        position:
                            candidate.position ||
                            "General"
                    };
                }
            );

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store"
            },
            body: JSON.stringify({
                success: true,
                candidates
            })
        };

    } catch (error) {
        logError("Get election candidates error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message: "Unable to load candidates."
            })
        };
    }
};