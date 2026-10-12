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
                    message: "Administrator authentication is required."
                })
            };
        }

        const idToken =
            authorization.substring(7).trim();

        if (!idToken) {
            return {
                statusCode: 401,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Administrator authentication is required."
                })
            };
        }

        const decodedToken =
            await admin.auth().verifyIdToken(idToken);

        const adminUid =
            decodedToken.uid;

        const adminRef =
            db.collection("admins").doc(adminUid);

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
                    message: "You are not registered as an administrator."
                })
            };
        }

        const currentAdmin =
            adminSnapshot.data();

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
                        "Only active Super Admins can send administrator invitations."
                })
            };
        }

        const data =
            JSON.parse(event.body || "{}");

        const name =
            String(data.name || "").trim();

        const email =
            String(data.email || "")
                .trim()
                .toLowerCase();

        const role =
            String(data.role || "").trim();

        if (!name || !email || !role) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "All invitation fields are required."
                })
            };
        }

        if (
            role !== "admin" &&
            role !== "super_admin"
        ) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Invalid administrator role."
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

        if (role === "super_admin") {

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
                    String(
                        adminData.email || ""
                    ).toLowerCase() === email
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

        const invitationsSnapshot =
            await db
                .collection("adminInvitations")
                .where("email", "==", email)
                .where("status", "==", "pending")
                .get();

        if (!invitationsSnapshot.empty) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "There is already a pending invitation for this email."
                })
            };
        }

        const invitationRef =
            db.collection("adminInvitations").doc();

        const invitationId =
            invitationRef.id;

        const invitationUrl =
            `https://nunsafud.name.ng/accept-invitation.html?inviteId=${encodeURIComponent(
                invitationId
            )}`;

        const invitationData = {
            name,
            email,
            role,
            status: "pending",
            createdAt:
                admin.firestore.FieldValue.serverTimestamp(),
            createdBy: adminUid,
            createdByEmail:
                currentAdmin.email ||
                decodedToken.email ||
                "",
            invitationUrl
        };

        if (role === "super_admin") {
            invitationData.promotedBy = adminUid;
            invitationData.promotedByEmail =
                currentAdmin.email ||
                decodedToken.email ||
                "";
        }

        await invitationRef.set(invitationData);

        const resendResponse =
            await fetch(
                "https://api.resend.com/emails",
                {
                    method: "POST",
                    headers: {
                        "Authorization":
                            `Bearer ${process.env.RESEND_API_KEY}`,
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        from:
                            "NUNSA-FUD <noreply@nunsafud.name.ng>",
                        to: [email],
                        subject:
                            "NUNSA-FUD Administrator Invitation",
                        html: `
                            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;">
                                <h2 style="color:#4f8f9a;">NUNSA-FUD</h2>
                                <h3>Administrator Invitation</h3>
                                <p>Hello ${escapeHtml(name)},</p>
                                <p>You have been invited to become a <strong>${role === "super_admin" ? "Super Admin" : "Regular Admin"}</strong> of the NUNSA-FUD Electronic Voting System.</p>
                                <p>Click the button below to accept your invitation and create your administrator password.</p>
                                <p style="margin:30px 0;">
                                    <a href="${invitationUrl}" style="background:#4f8f9a;color:white;text-decoration:none;padding:14px 22px;border-radius:6px;display:inline-block;">
                                        ACCEPT INVITATION
                                    </a>
                                </p>
                                <p>If you did not expect this invitation, you can ignore this email.</p>
                                <p>NUNSA-FUD Electronic Voting System</p>
                            </div>
                        `
                    })
                }
            );

        if (!resendResponse.ok) {

            const resendError =
                await resendResponse.text();

            await invitationRef.delete();

            console.error(
                "Resend error:",
                resendError
            );

            return {
                statusCode: 502,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "The invitation was not sent because the email service failed."
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
                message:
                    "Invitation sent successfully.",
                invitationId
            })
        };

    } catch (error) {

        console.error(
            "Admin invitation error:",
            error
        );

        if (
            error.code ===
            "auth/id-token-expired"
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
            error.code ===
            "auth/argument-error"
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
                    "Unable to send administrator invitation."
            })
        };
    }
};

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}