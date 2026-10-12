const admin = require("firebase-admin");
const crypto = require("crypto");

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

function hashPin(pin, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(
            pin,
            salt,
            100000,
            32,
            "sha256",
            (error, derivedKey) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(derivedKey.toString("hex"));
            }
        );
    });
}

exports.handler = async function(event) {
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

        const code =
            String(body.code || "").trim();

        const newPin =
            String(body.newPin || "").trim();

        if (!matricNumber) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Registration number is required."
                })
            };
        }

        if (!/^\d{4}$/.test(code)) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid verification code."
                })
            };
        }

        if (!/^\d{4}$/.test(newPin)) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Your new PIN must be exactly 4 digits."
                })
            };
        }

        const accessRef =
            db
                .collection("studentAccess")
                .doc(matricDocumentId(matricNumber));

        const accessSnap =
            await accessRef.get();

        if (!accessSnap.exists) {
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
            accessSnap.data();

        if (
            accessData.active !== true ||
            accessData.matricNumber !==
                matricNumber ||
            !accessData.studentDocumentId
        ) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student access is not active."
                })
            };
        }

        const studentDocumentId =
            accessData.studentDocumentId;

        const resetRef =
            db
                .collection("pinResetCodes")
                .doc(studentDocumentId);

        const resetSnap =
            await resetRef.get();

        if (!resetSnap.exists) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "No active PIN reset request was found."
                })
            };
        }

        const resetData =
            resetSnap.data();

        if (
            resetData.matricNumber !==
            matricNumber
        ) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid reset request."
                })
            };
        }

        if (resetData.verified !== true) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Please verify your recovery code first."
                })
            };
        }

        if (
            resetData.expiresAt &&
            resetData.expiresAt.toMillis() <
                Date.now()
        ) {
            await resetRef.delete();

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This reset request has expired. Please request a new code."
                })
            };
        }

        if (resetData.code !== code) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid verification code."
                })
            };
        }

        const accountRef =
            db
                .collection("studentAccounts")
                .doc(studentDocumentId);

        const accountSnap =
            await accountRef.get();

        if (!accountSnap.exists) {
            return {
                statusCode: 404,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student account was not found."
                })
            };
        }

        const accountData =
            accountSnap.data();

        if (accountData.active !== true) {
            return {
                statusCode: 403,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student account is not active."
                })
            };
        }

        const salt =
            crypto.randomBytes(16);

        const pinHash =
            await hashPin(
                newPin,
                salt
            );

        await accountRef.update({
            pinHash:
                pinHash,
            pinSalt:
                salt.toString("hex"),
            updatedAt:
                admin.firestore.FieldValue.serverTimestamp()
        });

        await resetRef.delete();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                message:
                    "Your PIN has been reset successfully."
            })
        };

    } catch (error) {
        console.error(
            "Reset student PIN error:",
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
                    "Something went wrong. Please try again."
            })
        };
    }
};