/*
 * TRACK: anonymous visit counter for the public pages only (home, privacy, 404).
 *   POST { page: "home" | "privacy" | "not-found" } -> adds 1 to today's total in `analytics/{date}`.
 * Stores no IP address, name, device detail or cookie. The caller's IP is only used (hashed, by the shared
 * limiter) to stop one source from inflating the numbers. Read the totals in the Firebase console.
 */
const admin = require("firebase-admin");
const { parseBody, logError, clientIp, consume } = require("./_lib/guard");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        })
    });
}

const PAGES = ["home", "privacy", "not-found"];
const LAGOS_OFFSET_MS = 60 * 60 * 1000;   // WAT is UTC+1 all year

const reply = statusCode => ({ statusCode, headers: { "Cache-Control": "no-store" }, body: "" });

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return reply(405);
    try {
        const body = parseBody(event);
        if (!body || !PAGES.includes(body.page)) return reply(400);

        const limit = await consume(`track:${clientIp(event)}`, 120, 60 * 60 * 1000);
        if (!limit.allowed) return reply(429);

        const day = new Date(Date.now() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
        await admin.firestore().collection("analytics").doc(day).set({
            date: day,
            total: admin.firestore.FieldValue.increment(1),
            pages: { [body.page]: admin.firestore.FieldValue.increment(1) }
        }, { merge: true });
        return reply(204);
    } catch (error) {
        logError("Track error", error);
        return reply(500);
    }
};
