/*
 * Authenticated, public-facing student profile endpoint.
 * Only public profile fields are returned. Student records, contact details,
 * matric numbers, login credentials and voting data are never exposed here.
 */
const admin = require("firebase-admin");
const { jsonResponse, logError } = require("./_lib/guard");
const forms = require("./_lib/forms");
const { getOfficesForStudent } = require("./_lib/office-holders");

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
const fail = (status, message) => jsonResponse(status, { success: false, message });
const clean = (value, max) => String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max);

exports.handler = async event => {
    if (event.httpMethod !== "GET") return fail(405, "Method not allowed.");
    try {
        const header = event.headers.authorization || event.headers.Authorization || "";
        if (!header.startsWith("Bearer ")) return fail(401, "Please log in to view student profiles.");

        let decoded;
        try { decoded = await admin.auth().verifyIdToken(header.slice(7).trim()); }
        catch { return fail(401, "Your session has expired. Please log in again."); }

        const adminSnap = await db.collection("admins").doc(decoded.uid).get();
        const isAdmin = adminSnap.exists && adminSnap.data().active === true &&
            ["admin", "super_admin"].includes(adminSnap.data().role);
        if (!isAdmin) {
            const auth = await forms.authenticateStudent(db, event);
            if (auth.error) return fail(auth.error[0], auth.error[1]);
        }

        const studentId = clean((event.queryStringParameters || {}).id, 100);
        if (!studentId || studentId.includes("/")) return fail(400, "Student profile ID is required.");
        const studentSnap = await db.collection("students").doc(studentId).get();
        if (!studentSnap.exists) return fail(404, "Student profile not found.");
        const student = studentSnap.data();
        if (student.status && student.status !== "active") return fail(404, "Student profile not found.");

        let offices = [];
        try { offices = await getOfficesForStudent(db, { matricNumber: student.matricNumber }); }
        catch (error) { logError("Student profile office lookup failed", error); }

        const academicLevel = clean(student.academicLevel || student.level || student.currentLevel, 40);
        return jsonResponse(200, {
            success: true,
            profile: {
                id: studentId,
                name: clean(student.name, 100) || "NUNSA-FUD Student",
                profilePicture: clean(student.profilePicture, 800) || "assets/default-profile.jpg",
                biography: clean(typeof student.biography === "string" ? student.biography : student.bio, 1200),
                academicLevel: academicLevel && /^\d+$/.test(academicLevel) ? academicLevel + " Level" : academicLevel,
                offices: offices.map(office => ({ position: office.position, electionTitle: office.electionTitle }))
            }
        });
    } catch (error) {
        logError("Get student profile error", error);
        return fail(500, "Unable to load this student profile.");
    }
};
