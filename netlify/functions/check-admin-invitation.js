const admin = require("firebase-admin");

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

        const inviteId =
            String(
                event.queryStringParameters?.inviteId || ""
            ).trim();

        if (!inviteId) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Invalid invitation link."
                })
            };
        }

        const invitationRef =
            db
                .collection("adminInvitations")
                .doc(inviteId);

        const invitationSnapshot =
            await invitationRef.get();

        if (!invitationSnapshot.exists) {

            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This invitation does not exist."
                })
            };
        }

        const invitation =
            invitationSnapshot.data();

        if (invitation.status !== "pending") {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This invitation has already been accepted or is no longer available."
                })
            };
        }

        if (
            !invitation.email ||
            !invitation.name ||
            !invitation.role
        ) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This invitation is incomplete."
                })
            };
        }

        if (
            invitation.role !== "admin" &&
            invitation.role !== "super_admin"
        ) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This invitation contains an invalid administrator role."
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                name: invitation.name,
                email: invitation.email,
                role: invitation.role
            })
        };

    } catch (error) {

        console.error(
            "Invitation verification error:",
            error
        );

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message:
                    "Unable to verify this invitation."
            })
        };
    }
};