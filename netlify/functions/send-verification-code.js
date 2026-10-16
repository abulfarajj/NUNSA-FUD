const admin = require("firebase-admin");
const crypto = require("crypto");
const { enforceEmailCodeLimits, logError, generateEmailCode } = require("./_lib/guard");

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

function normalizeMatric(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function matricDocumentId(value) {
    return normalizeMatric(value).replace(/[^A-Z0-9]/g, "_");
}

function generateCode() {
    return generateEmailCode(); // 6 digits
}

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
        const body =
            JSON.parse(event.body || "{}");

        const matricNumber =
            normalizeMatric(body.matricNumber);

        const email =
            String(body.email || "")
                .trim()
                .toLowerCase();

        if (!matricNumber || !email) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Registration number and email are required."
                })
            };
        }

        const sendLimit = await enforceEmailCodeLimits(event, matricDocumentId(matricNumber), "signup");
        if (sendLimit) { return sendLimit; }

        const accessRef =
            db
                .collection("studentAccess")
                .doc(matricDocumentId(matricNumber));

        const accessSnapshot =
            await accessRef.get();

        if (!accessSnapshot.exists) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student record not found."
                })
            };
        }

        const accessData =
            accessSnapshot.data();

        if (
            accessData.active !== true ||
            accessData.matricNumber !== matricNumber
        ) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This student is not eligible for registration."
                })
            };
        }

        const studentDocumentId =
            String(
                accessData.studentDocumentId || ""
            ).trim();

        if (!studentDocumentId) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student record is incomplete."
                })
            };
        }

        const studentRef =
            db
                .collection("students")
                .doc(studentDocumentId);

        const studentSnapshot =
            await studentRef.get();

        if (!studentSnapshot.exists) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student record could not be found."
                })
            };
        }

        const studentData =
            studentSnapshot.data();

        if (
            String(
                studentData.matricNumber || ""
            )
                .trim()
                .toUpperCase() !== matricNumber
        ) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Registration number does not match the student record."
                })
            };
        }

        const accountRef =
            db
                .collection("studentAccounts")
                .doc(studentDocumentId);

        const accountSnapshot =
            await accountRef.get();

        if (accountSnapshot.exists) {
            const accountData =
                accountSnapshot.data();

            if (accountData.active === true) {
                return {
                    statusCode: 409,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        accountExists: true,
                        message:
                            "An account already exists for this registration number. Please login or reset your PIN."
                    })
                };
            }
        }

        try {
            const existingEmailUser =
                await admin
                    .auth()
                    .getUserByEmail(email);

            if (existingEmailUser) {
                return {
                    statusCode: 409,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        accountExists: true,
                        message:
                            "An account already exists with this email address. Please login or reset your PIN."
                    })
                };
            }
        } catch (error) {
            if (error.code !== "auth/user-not-found") {
                throw error;
            }
        }

        const code =
            generateCode();

        const expiresAt =
            admin.firestore.Timestamp.fromMillis(
                Date.now() + 10 * 60 * 1000
            );

        const verificationRef =
            db
                .collection("emailVerifications")
                .doc(studentDocumentId);

        await verificationRef.set({
            matricNumber,
            email,
            code,
            expiresAt,
            attempts: 0,
            verified: false,
            createdAt:
                admin.firestore.FieldValue.serverTimestamp()
        });

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
                            "NUNSA-FUD Email Verification Code",
                        html:
                            `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;">
                                <h2 style="color:#4f8f9a;">NUNSA-FUD</h2>
                                <h3>Email Verification</h3>
                                <p>Hello,</p>
                                <p>Your NUNSA-FUD email verification code is:</p>
                                <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#4f8f9a;margin:25px 0;">
                                    ${code}
                                </div>
                                <p>This code expires in 10 minutes.</p>
                                <p>After verification, you will be able to create your 4-digit student PIN.</p>
                                <p>If you did not request registration, you can ignore this email.</p>
                                <p>NUNSA-FUD Electronic Voting System</p>
                            </div>`
                    })
                }
            );

        if (!resendResponse.ok) {
            await verificationRef.delete();

            logError("Resend e-mail failed", { code: "http-" + resendResponse.status });

            return {
                statusCode: 502,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "The verification code could not be sent because the email service failed."
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                success: true,
                message:
                    "A 6-digit verification code has been sent to your email."
            })
        };

    } catch (error) {
        logError("Email verification code error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                success: false,
                message:
                    "Unable to send the email verification code."
            })
        };
    }
};