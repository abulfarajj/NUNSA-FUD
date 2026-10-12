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
                    message:
                        "Administrator authentication is required."
                })
            };
        }

        const idToken =
            authorization.substring(7).trim();

        const decodedToken =
            await admin.auth().verifyIdToken(idToken);

        const currentAdminRef =
            db.collection("admins").doc(decodedToken.uid);

        const currentAdminSnapshot =
            await currentAdminRef.get();

        if (!currentAdminSnapshot.exists) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "You are not registered as an administrator."
                })
            };
        }

        const currentAdmin =
            currentAdminSnapshot.data();

        if (
            currentAdmin.active !== true ||
            currentAdmin.role !== "super_admin"
        ) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Only active Super Admins can manage administrators."
                })
            };
        }

        const data =
            JSON.parse(event.body || "{}");

        const targetAdminId =
            String(data.adminId || "").trim();

        const action =
            String(data.action || "").trim();

        if (!targetAdminId || !action) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Administrator and action are required."
                })
            };
        }

        if (action !== "deactivate") {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid administrator action."
                })
            };
        }

        if (targetAdminId === decodedToken.uid) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "You cannot change your own administrator status."
                })
            };
        }

        const targetAdminRef =
            db.collection("admins").doc(targetAdminId);

        const targetAdminSnapshot =
            await targetAdminRef.get();

        if (!targetAdminSnapshot.exists) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Administrator account not found."
                })
            };
        }

        const targetAdmin =
            targetAdminSnapshot.data();

        if (targetAdmin.role === "super_admin") {

            const isFounder =
                currentAdmin.founder === true;

            const isPromoter =
                targetAdmin.promotedBy === decodedToken.uid;

            if (!isFounder && !isPromoter) {
                return {
                    statusCode: 403,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        message:
                            "You do not have authority to change the status of this Super Admin."
                    })
                };
            }
        }

        await targetAdminRef.update({
            active: false
        });

        try {
            await admin.auth().deleteUser(targetAdminId);
        } catch (authError) {
            if (authError.code !== "auth/user-not-found") {
                throw authError;
            }
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                message:
                    "Administrator deactivated successfully. " +
                    "To restore access, send them a new invitation."
            })
        };

    } catch (error) {

        console.error(
            "Admin management error:",
            error
        );

        if (
            error.code === "auth/id-token-expired"
        ) {
            return {
                statusCode: 401,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Your administrator session has expired. Please log in again."
                })
            };
        }

        if (
            error.code === "auth/argument-error"
        ) {
            return {
                statusCode: 401,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid administrator authentication."
                })
            };
        }

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message:
                    "Unable to change administrator status."
            })
        };
    }
};