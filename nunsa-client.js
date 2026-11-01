// Shared helpers for the notice board + dashboard extras (ES module).
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0",
    authDomain: "nunsa-voting-app.firebaseapp.com",
    projectId: "nunsa-voting-app",
    storageBucket: "nunsa-voting-app.firebasestorage.app",
    messagingSenderId: "1069853481069",
    appId: "1:1069853481069:web:63ebcca28764",
    measurementId: "G-EMYNQR6T0F"
};
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function waitUser() {
    return new Promise(resolve => { const off = onAuthStateChanged(auth, u => { off(); resolve(u); }); });
}
export async function noticesApi(payload, query) {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/.netlify/functions/announcements" + (query || ""), {
        method: payload ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: payload ? JSON.stringify(payload) : undefined
    });
    let data;
    try { data = await res.json(); } catch { data = { success: false, message: "The server returned an invalid response." }; }
    return data;
}
export function ago(ms) {
    if (!ms) return "";
    const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24); if (d < 7) return d + "d ago";
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
export const noticeLink = id => location.origin + "/a/" + encodeURIComponent(id);
export async function shareNotice(id, title) {
    const url = noticeLink(id);
    try {
        if (navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
            await navigator.share({ title, url }); return "Shared.";
        }
    } catch (e) { if (e && e.name === "AbortError") return ""; }
    try { await navigator.clipboard.writeText(url); return "Link copied."; }
    catch {
        const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); } catch {} t.remove(); return "Link copied.";
    }
}
export function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}
export const backHref = canManage => sessionStorage.getItem("studentDocumentId") ? "student-dashboard.html" : (canManage ? "admin.html" : "index.html");
