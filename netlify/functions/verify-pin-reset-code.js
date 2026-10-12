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

function normalizeMatric(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function matricDocumentId(value) {
    return normalizeMatric(value).replace(/[^A-Z0-9]/g, "_");
}

exports.handler = async function(event) {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({
                success: false,
                message: "Method not allowed."
            })
        };
    }

    try {
        const body = JSON.parse(event.body || "{}");

        const matricNumber = normalizeMatric(body.matricNumber);
        const code = String(body.code || "").trim();

        if (!matricNumber) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "Registration number is required."
                })
            };
        }

        if (!/^\d{4}$/.test(code)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "Enter the 4-digit verification code."
                })
            };
        }

        const accessRef = db.collection("studentAccess").doc(matricDocumentId(matricNumber));
        const accessSnap = await accessRef.get();

        if (!accessSnap.exists) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    success: false,
                    message: "Student record not found."
                })
            };
        }

        const accessData = accessSnap.data();

        if (
            accessData.active !== true ||
            accessData.matricNumber !== matricNumber ||
            !accessData.studentDocumentId
        ) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    success: false,
                    message: "Student access is not active."
                })
            };
        }

        const resetRef = db
            .collection("pinResetCodes")
            .doc(accessData.studentDocumentId);

        const resetSnap = await resetRef.get();

        if (!resetSnap.exists) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "No active PIN reset request was found."
                })
            };
        }

        const resetData = resetSnap.data();

        if (resetData.matricNumber !== matricNumber) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    success: false,
                    message: "Invalid reset request."
                })
            };
        }

        if (resetData.verified === true) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "This verification code has already been verified."
                })
            };
        }

        if (
            resetData.expiresAt &&
            resetData.expiresAt.toMillis() < Date.now()
        ) {
            await resetRef.delete();

            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "This verification code has expired. Please request a new code."
                })
            };
        }

        const attempts = Number(resetData.attempts || 0);

        if (attempts >= 5) {
            await resetRef.delete();

            return {
                statusCode: 429,
                body: JSON.stringify({
                    success: false,
                    message: "Too many incorrect attempts. Please request a new code."
                })
            };
        }

        if (resetData.code !== code) {
            await resetRef.update({
                attempts: attempts + 1
            });

            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "Incorrect verification code."
                })
            };
        }

        await resetRef.update({
            verified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: "Verification code confirmed."
            })
        };

    } catch (error) {
        console.error("Verify PIN reset code error:", error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                message: "Something went wrong. Please try again."
            })
        };
    }
};