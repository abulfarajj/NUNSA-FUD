const admin = require("firebase-admin");
const { logError, isInvitationExpired } = require("./_lib/guard");

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

        const data =
            JSON.parse(event.body || "{}");

        const inviteId =
            String(data.inviteId || "").trim();

        const email =
            String(data.email || "")
                .trim()
                .toLowerCase();

        const password =
            String(data.password || "");

        if (!inviteId || !email || !password) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invitation, email, and password are required."
                })
            };
        }

        if (password.length < 6) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Password must be at least 6 characters."
                })
            };
        }

        const invitationRef =
            db.collection("adminInvitations").doc(inviteId);

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

        if (isInvitationExpired(invitation)) {
            return {
                statusCode: 410,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This invitation has expired. Please ask a Super Admin to send you a new invitation."
                })
            };
        }

        const invitedEmail =
            String(invitation.email || "")
                .trim()
                .toLowerCase();

        if (email !== invitedEmail) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "The email address does not match this invitation."
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

        const adminsSnapshot =
            await db.collection("admins").get();

        const admins =
            adminsSnapshot.docs.map(
                document => ({
                    id: document.id,
                    ...document.data()
                })
            );

        const activeAdmins =
            admins.filter(
                adminData =>
                    adminData.active === true
            );

        if (activeAdmins.length >= 5) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "The maximum of 5 active administrators has already been reached."
                })
            };
        }

        if (invitation.role === "super_admin") {

            const activeSuperAdmins =
                activeAdmins.filter(
                    adminData =>
                        adminData.role === "super_admin"
                );

            if (activeSuperAdmins.length >= 3) {
                return {
                    statusCode: 400,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        message:
                            "The maximum of 3 active Super Admins has already been reached."
                    })
                };
            }
        }

        const existingAdmin =
            admins.find(
                adminData =>
                    String(adminData.email || "")
                        .trim()
                        .toLowerCase() === email
                    && adminData.active === true
            );

        if (existingAdmin) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This email is already registered as an administrator."
                })
            };
        }

        if (
            invitation.role === "super_admin" &&
            (
                !invitation.promotedBy ||
                !invitation.promotedByEmail
            )
        ) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This Super Admin invitation is missing its promotion authority information."
                })
            };
        }

        let firebaseUser;

        try {

            firebaseUser =
                await admin.auth().createUser({
                    email,
                    password,
                    emailVerified: true,
                    displayName:
                        invitation.name
                });

        } catch (error) {

            if (
                error.code ===
                "auth/email-already-exists"
            ) {
                return {
                    statusCode: 400,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        message:
                            "An account already exists with this email address."
                    })
                };
            }

            throw error;
        }

        const adminRef =
            db.collection("admins").doc(firebaseUser.uid);

        try {

            const adminData = {
                name:
                    invitation.name,
                email,
                role:
                    invitation.role,
                active:
                    true,
                createdAt:
                    admin.firestore.FieldValue.serverTimestamp(),
                createdBy:
                    invitation.createdBy || "",
                createdByEmail:
                    invitation.createdByEmail || ""
            };

            if (invitation.role === "super_admin") {
                adminData.promotedBy =
                    invitation.promotedBy;

                adminData.promotedByEmail =
                    invitation.promotedByEmail;

                adminData.promotionType =
                    "super_admin_invitation";
            }

            await adminRef.set(adminData);

            await invitationRef.update({
                status:
                    "accepted",
                acceptedAt:
                    admin.firestore.FieldValue.serverTimestamp(),
                acceptedBy:
                    firebaseUser.uid
            });

        } catch (error) {

            try {
                await admin.auth()
                    .deleteUser(firebaseUser.uid);
            } catch (deleteError) {
                logError("Failed to roll back Firebase user:", deleteError);
            }

            throw error;
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                message:
                    "Administrator account created successfully."
            })
        };

    } catch (error) {

        logError("Accept invitation error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message:
                    "Unable to create the administrator account."
            })
        };
    }
};