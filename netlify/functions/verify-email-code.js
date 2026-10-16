const admin = require("firebase-admin");
const { logError, isValidEmailCode } = require("./_lib/guard");

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
    return String(value || "").trim().toUpperCase();
}

function matricDocumentId(value) {
    return normalizeMatric(value).replace(/[^A-Z0-9]/g, "_");
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

        const body = JSON.parse(event.body || "{}");

        const matricNumber =
            normalizeMatric(body.matricNumber);

        const email =
            String(body.email || "").trim().toLowerCase();

        const code =
            String(body.code || "").trim();

        if (!matricNumber || !email || !code) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Registration number, email and verification code are required."
                })
            };
        }

        if (!isValidEmailCode(code)) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Verification code must be 6 digits."
                })
            };
        }

        const accessRef =
            db.collection("studentAccess").doc(matricDocumentId(matricNumber));

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
                    message: "Student record not found."
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
                    message: "This student is not eligible for registration."
                })
            };
        }

        const studentDocumentId =
            accessData.studentDocumentId;

        if (!studentDocumentId) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Student record is incomplete."
                })
            };
        }

        const verificationRef =
            db.collection("emailVerifications")
            .doc(studentDocumentId);

        const verificationSnapshot =
            await verificationRef.get();

        if (!verificationSnapshot.exists) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "No verification code was found. Please request a new code."
                })
            };
        }

        const verificationData =
            verificationSnapshot.data();

        if (verificationData.verified === true) {
            return {
                statusCode: 409,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "This verification has already been completed."
                })
            };
        }

        if (
            verificationData.matricNumber !== matricNumber ||
            verificationData.email !== email
        ) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "The verification details do not match."
                })
            };
        }

        // Reserve this attempt atomically BEFORE comparing, so parallel guesses cannot beat the 5-try limit.
        const reservation = await db.runTransaction(async transaction => {
            const current = await transaction.get(verificationRef);
            if (!current.exists) {
                return { blocked: true, missing: true };
            }
            const used = Number(current.data().attempts || 0);
            if (used >= 5) {
                return { blocked: true };
            }
            transaction.update(verificationRef, { attempts: used + 1 });
            return { blocked: false };
        });

        if (reservation.blocked) {
            return {
                statusCode: 429,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Too many incorrect attempts. Please request a new verification code."
                })
            };
        }

        const expiresAt =
            verificationData.expiresAt;

        if (
            !expiresAt ||
            expiresAt.toDate().getTime() < Date.now()
        ) {
            return {
                statusCode: 410,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "This verification code has expired. Please request a new code."
                })
            };
        }

        if (verificationData.code !== code) {

            return {
                statusCode: 401,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message: "Incorrect verification code."
                })
            };
        }

        await verificationRef.update({
            verified: true,
            verifiedAt:
                admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                message: "Email verified successfully."
            })
        };

    } catch (error) {

        logError("Email verification error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: false,
                message: "Unable to verify the code."
            })
        };
    }
};