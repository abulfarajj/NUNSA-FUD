/*
 * ANNOUNCEMENTS (notice board)
 *  GET  ?id=ID          -> one announcement (full, with image)
 *  GET                  -> feed (no images; `hasImage` flag), pinned first
 *  POST {action:create|update|delete|pin, ...}  -> active admins and currently recognised elected office holders
 * Readers: logged-in students (custom-token claims) or active admins.
 * Stored in the server-only `announcements` collection (default-deny rule keeps clients out).
 */
const admin = require("firebase-admin");
const { jsonResponse, parseBody, logError, consume, tooManyResponse } = require("./_lib/guard");
const forms = require("./_lib/forms");
const { getOfficesForStudent, getCurrentOfficeHolders } = require("./_lib/office-holders");

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
const MAX_IMAGE = 700 * 1024; // characters of the data URL (~500 KB)

async function whoIsCalling(event) {
    const header = event.headers.authorization || event.headers.Authorization || "";
    if (!header.startsWith("Bearer ")) return { error: [401, "Please log in again."] };
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(header.substring(7).trim()); }
    catch { return { error: [401, "Your session has expired. Please log in again."] }; }

    const adminSnap = await db.collection("admins").doc(decoded.uid).get();
    if (adminSnap.exists && adminSnap.data().active === true) {
        return { role: "admin", uid: decoded.uid, name: String(adminSnap.data().displayName || adminSnap.data().name || "Admin") };
    }
    const studentAuth = await forms.authenticateStudent(db, event);
    if (studentAuth.error) return { error: studentAuth.error };
    return { role: "student", uid: decoded.uid, student: studentAuth.student };
}

/*
 * A student may publish only while they are the currently recognised office
 * holder. This is calculated from finalized results, not elapsed time or a
 * provisional/live tally. Blank tenure end dates remain active until a newer
 * finalized election supersedes the position.
 */
async function officesFor(student) {
    return getOfficesForStudent(db, student);
}

const ms = v => (v && v.toMillis ? v.toMillis() : (v instanceof Date ? v.getTime() : (typeof v === "number" ? v : (v ? new Date(v).getTime() || 0 : 0))));
function shape(id, d, withImage, canEditAll, uid) {
    // Compatibility: older announcements stored the office in authorName and
    // the real person's name in createdByName. New records store both explicitly.
    const legacyOffice = !d.authorPosition && d.createdByName && d.authorName !== d.createdByName;
    return {
        id, title: d.title || "", body: d.body || "",
        authorName: d.authorName && !legacyOffice ? d.authorName : (d.createdByName || d.authorName || "NUNSA-FUD"),
        authorPosition: d.authorPosition || (legacyOffice ? d.authorName : ""),
        canEdit: canEditAll || d.createdBy === uid,
        pinned: d.pinned === true, hasImage: d.hasImage === true || !!d.image, image: withImage ? (d.image || "") : undefined,
        createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt)
    };
}
const clean = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
function validImage(v) {
    if (!v) return "";
    const s = String(v);
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || s.length > MAX_IMAGE) return null;
    return s;
}

exports.handler = async function (event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return fail(405, "Method not allowed.");
    try {
        const who = await whoIsCalling(event);
        if (who.error) return fail(who.error[0], who.error[1]);
        const col = db.collection("announcements");
        const isAdmin = who.role === "admin";
        let offices = [];
        if (who.role === "student") {
            try { offices = await officesFor(who.student); }
            catch (error) { logError("Office lookup failed", error); }
        }
        const canPost = isAdmin || offices.length > 0;
        const q = event.queryStringParameters || {};
        if (event.httpMethod === "GET" && q.me) {
            let currentOffices = [];
            try {
                currentOffices = (await getCurrentOfficeHolders(db)).map(office => ({
                    position: office.position,
                    name: office.name,
                    profilePicture: office.profilePicture,
                    studentProfileId: office.studentProfileId,
                    academicLevel: office.academicLevel,
                    electionId: office.electionId,
                    electionTitle: office.electionTitle,
                    termEndsAt: office.termEndsAt
                }));
            } catch (error) {
                logError("Current office-holder list failed", error);
            }
            return jsonResponse(200, { success: true, isAdmin, canPost, offices, currentOffices, name: who.student ? who.student.name : who.name });
        }

        if (event.httpMethod === "GET") {
            const id = clean((event.queryStringParameters || {}).id, 80);
            if (id) {
                const snap = await col.doc(id).get();
                if (!snap.exists) return fail(404, "This announcement no longer exists.");
                return jsonResponse(200, { success: true, canManage: isAdmin, canPost, announcement: shape(snap.id, snap.data(), true, isAdmin, who.uid) });
            }
            const limit = Math.min(Number((event.queryStringParameters || {}).limit) || 30, 50);
            // select(): the feed never needs the (large) image data, so it is not read at all.
            const snap = await col.orderBy("createdAt", "desc").limit(60)
                .select("title", "body", "authorName", "authorPosition", "createdByName", "createdBy", "pinned", "hasImage", "createdAt", "updatedAt").get();
            const items = snap.docs.map(d => shape(d.id, d.data(), false, isAdmin, who.uid))
                .sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt)).slice(0, limit);
            return jsonResponse(200, { success: true, canManage: isAdmin, canPost, announcements: items });
        }

        if (!canPost) return fail(403, "Only administrators and currently recognised office holders can post announcements.");
        const body = parseBody(event);
        if (!body) return fail(400, "Invalid request.");
        const posting = await consume(`announce:${who.uid}`, 30, 60 * 60 * 1000);
        if (!posting.allowed) return tooManyResponse(posting.retryAfterSec, "You are posting too fast. Please wait a little.");
        const now = admin.firestore.FieldValue.serverTimestamp();

        if (body.action === "create" || body.action === "update") {
            const title = clean(body.title, 120), text = clean(body.body, 4000);
            let authorName = isAdmin ? clean(body.authorName, 80) : clean(who.student.name, 80);
            let authorPosition = clean(body.authorPosition, 80);
            if (!isAdmin) { // an office holder may publish only under an office they currently hold
                const mine = offices.find(o => o.position === authorPosition);
                if (!mine) return fail(403, "Choose one of the positions you hold.");
                authorPosition = mine.position;
            }
            const image = validImage(body.image);
            if (!title) return fail(400, "Please add a title.");
            if (!authorName) return fail(400, "Please enter the name of the person making this announcement.");
            if (!authorPosition) return fail(400, "Please enter the official position or role.");
            if (!text && !image) return fail(400, "Add some text or an image.");
            if (image === null) return fail(400, "That image is too large or not a valid image.");
            const data = { title, body: text, authorName, authorPosition, image: image || "", hasImage: !!image, pinned: isAdmin && body.pinned === true, updatedAt: now };
            if (body.action === "create") {
                data.createdAt = now; data.createdBy = who.uid; data.createdByName = authorName;
                const ref = await col.add(data);
                return jsonResponse(200, { success: true, id: ref.id, message: "Announcement posted." });
            }
            const id = clean(body.id, 80);
            const ref = col.doc(id);
            const cur = id ? await ref.get() : null;
            if (!cur || !cur.exists) return fail(404, "Announcement not found.");
            if (!isAdmin && cur.data().createdBy !== who.uid) return fail(403, "You can only edit your own announcements.");
            await ref.update(data);
            return jsonResponse(200, { success: true, id, message: "Announcement updated." });
        }
        if (body.action === "delete" || body.action === "pin") {
            const id = clean(body.id, 80);
            const ref = col.doc(id);
            const cur = id ? await ref.get() : null;
            if (!cur || !cur.exists) return fail(404, "Announcement not found.");
            if (body.action === "pin" && !isAdmin) return fail(403, "Only administrators can pin.");
            if (!isAdmin && cur.data().createdBy !== who.uid) return fail(403, "You can only delete your own announcements.");
            if (body.action === "delete") { await ref.delete(); return jsonResponse(200, { success: true, message: "Deleted." }); }
            await ref.update({ pinned: body.pinned === true });
            return jsonResponse(200, { success: true, message: body.pinned === true ? "Pinned." : "Unpinned." });
        }
        return fail(400, "Unknown action.");
    } catch (error) {
        logError("Announcements error", error);
        return fail(500, "Unable to load announcements.");
    }
};
