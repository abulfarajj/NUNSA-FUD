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

        const email =
            String(data.email || "")
                .trim()
                .toLowerCase();

        const pin =
            String(data.pin || "");

        const matricDocId =
            matricNumber.replace(/[^A-Z0-9]/g, "_");

        if (!matricNumber || !email || !pin) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Registration number, email, and PIN are required."
                })
            };
        }

        if (!/^\d{4}$/.test(pin)) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type":
                        "application/json"
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
                statusCode: 404,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "This registration number is not authorized to access the website."
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
                statusCode: 400,
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
                    "Content-Type":
                        "application/json"
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
                    "Content-Type":
                        "application/json"
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
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        accountExists: true,
                        message:
                            "An account already exists for this registration number. Please LOGIN or RESET PIN instead."
                    })
                };
            }
        }

        let existingEmailUser = null;

        try {

            existingEmailUser =
                await admin
                    .auth()
                    .getUserByEmail(email);

        } catch (error) {

            if (error.code !== "auth/user-not-found") {
                throw error;
            }
        }

        if (existingEmailUser) {

            return {
                statusCode: 409,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    accountExists: true,
                    message:
                        "An account already exists with this email address. Please LOGIN or RESET PIN instead."
                })
            };
        }

        const verificationRef =
            db
                .collection("emailVerifications")
                .doc(studentDocumentId);

        const verificationSnapshot =
            await verificationRef.get();

        if (!verificationSnapshot.exists) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Email verification is required before creating your PIN."
                })
            };
        }

        const verificationData =
            verificationSnapshot.data();

        if (verificationData.verified !== true) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "Please verify your email before creating your PIN."
                })
            };
        }

        if (
            String(
                verificationData.email || ""
            )
                .trim()
                .toLowerCase() !== email
        ) {

            return {
                statusCode: 400,
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    success: false,
                    message:
                        "The email address does not match the verified email."
                })
            };
        }

        const salt =
            crypto.randomBytes(16);

        const hash =
            crypto
                .pbkdf2Sync(
                    pin,
                    salt,
                    100000,
                    32,
                    "sha256"
                );

        const internalPassword =
            crypto
                .randomBytes(32)
                .toString("hex");

        let firebaseUser;

        try {

            firebaseUser =
                await admin
                    .auth()
                    .createUser({
                        password:
                            internalPassword,
                        email
                    });

        } catch (error) {

            if (
                error.code ===
                "auth/email-already-exists"
            ) {

                return {
                    statusCode: 409,
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        success: false,
                        accountExists: true,
                        message:
                            "An account already exists with this email address. Please LOGIN or RESET PIN instead."
                    })
                };
            }

            throw error;
        }

        try {

            await accountRef.set({
                studentDocumentId,
                matricNumber,
                email,
                pinHash:
                    hash.toString("hex"),
                pinSalt:
                    salt.toString("hex"),
                authUid:
                    firebaseUser.uid,
                active:
                    true,
                createdAt:
                    admin.firestore.FieldValue.serverTimestamp()
            });

            await studentRef.update({
                email,
                accountCreated:
                    true
            });

            await verificationRef.delete();

        } catch (error) {

            try {

                await admin
                    .auth()
                    .deleteUser(
                        firebaseUser.uid
                    );

            } catch (deleteError) {

                console.error(
                    "Failed to roll back Firebase user:",
                    deleteError
                );
            }

            throw error;
        }

        const customToken =
            await admin
                .auth()
                .createCustomToken(
                    firebaseUser.uid,
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
                    "Student account created successfully.",
                customToken,
                matricNumber,
                studentDocumentId
            })
        };

    } catch (error) {

        console.error(
            "Complete student signup error:",
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
                    "Unable to complete student registration."
            })
        };
    }
};