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

        const matricNumber =
            String(data.matricNumber || "")
                .trim()
                .toUpperCase();

        const pin =
            String(data.pin || "");

        const matricDocId =
            matricNumber.replace(/[^A-Z0-9]/g, "_");

        if (!matricNumber || !pin) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Registration number and PIN are required."
                })
            };
        }

        if (!/^\d{4}$/.test(pin)) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "PIN must contain exactly 4 digits."
                })
            };
        }

        const accessRef =
            db
                .collection("studentAccess")
                .doc(matricDocId);

        const accessSnapshot =
            await accessRef.get();

        if (!accessSnapshot.exists) {

            return {
                statusCode: 401,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid registration number or PIN."
                })
            };
        }

        const accessData =
            accessSnapshot.data();

        if (accessData.active !== true) {

            return {
                statusCode: 403,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This student account is not active."
                })
            };
        }

        const studentDocumentId =
            String(
                accessData.studentDocumentId || ""
            ).trim();

        if (!studentDocumentId) {

            return {
                statusCode: 500,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student account information is incomplete."
                })
            };
        }

        const accountRef =
            db
                .collection("studentAccounts")
                .doc(studentDocumentId);

        const accountSnapshot =
            await accountRef.get();

        if (!accountSnapshot.exists) {

            return {
                statusCode: 401,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid registration number or PIN."
                })
            };
        }

        const accountData =
            accountSnapshot.data();

        if (accountData.active !== true) {

            return {
                statusCode: 403,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This student account is not active."
                })
            };
        }

        if (
            accountData.matricNumber !==
            matricNumber
        ) {

            return {
                statusCode: 401,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid registration number or PIN."
                })
            };
        }

        const storedHash =
            String(
                accountData.pinHash || ""
            );

        const storedSalt =
            String(
                accountData.pinSalt || ""
            );

        if (
            !storedHash ||
            !storedSalt
        ) {

            return {
                statusCode: 500,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student PIN information is incomplete."
                })
            };
        }

        const salt =
            Buffer.from(
                storedSalt,
                "hex"
            );

        const expectedHash =
            Buffer.from(
                storedHash,
                "hex"
            );

        const suppliedHash =
            crypto
                .pbkdf2Sync(
                    pin,
                    salt,
                    100000,
                    32,
                    "sha256"
                );

        if (
            expectedHash.length !==
            suppliedHash.length ||
            !crypto.timingSafeEqual(
                expectedHash,
                suppliedHash
            )
        ) {

            return {
                statusCode: 401,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Invalid registration number or PIN."
                })
            };
        }

        const authUid =
            String(
                accountData.authUid || ""
            ).trim();

        if (!authUid) {

            return {
                statusCode: 500,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Student authentication information is incomplete."
                })
            };
        }

        const customToken =
            await admin
                .auth()
                .createCustomToken(
                    authUid,
                    {
                        matricNumber
                    }
                );

        return {
            statusCode: 200,
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                success: true,
                message:
                    "Login successful.",
                customToken,
                matricNumber,
                studentDocumentId
            })
        };

    } catch (error) {

        console.error(
            "Student login error:",
            error
        );

        return {
            statusCode: 500,
            headers: {
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify({
                success: false,
                message:
                    "Unable to log in."
            })
        };
    }
};