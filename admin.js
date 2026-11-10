import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0", authDomain: "nunsa-voting-app.firebaseapp.com", projectId: "nunsa-voting-app", storageBucket: "nunsa-voting-app.firebasestorage.app", messagingSenderId: "1069853481069", appId: "1:1069853481069:web:63ebcca28764", measurementId: "G-EMYNQR6T0F" };

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const adminName = document.getElementById("admin-name");

const adminRole = document.getElementById("admin-role");

const logoutBtn = document.getElementById("logout-btn");

const superAdminSection = document.getElementById("super-admin-section");

const adminManagementBtn = document.getElementById("admin-management-btn");

const electionsBtn = document.getElementById("elections-btn");

const candidatesBtn = document.getElementById("candidates-btn");

const votersBtn = document.getElementById("voters-btn");

const resultsBtn = document.getElementById("results-btn");

const studentsBtn = document.getElementById("students-btn");

const formsBtn = document.getElementById("forms-btn");
const announcementsBtn = document.getElementById("announcements-btn");

onAuthStateChanged(auth, async (user) => {

if (!user) { window.location.href = "admin-login.html"; return; } try { const adminRef = doc( db, "admins", user.uid ); const adminSnapshot = await getDoc(adminRef); if (!adminSnapshot.exists()) { console.error( "Admin record not found." ); await signOut(auth); window.location.href = "admin-login.html"; return; } const adminData = adminSnapshot.data(); if (adminData.active !== true) { console.error( "Admin account is inactive." ); await signOut(auth); window.location.href = "admin-login.html"; return; } if ( adminData.role !== "admin" && adminData.role !== "super_admin" ) { console.error( "Invalid administrator role." ); await signOut(auth); window.location.href = "admin-login.html"; return; } adminName.textContent = adminData.name || "Administrator"; document.getElementById("admin-avatar").textContent = (adminData.name || "A").trim().charAt(0).toUpperCase() || "A"; adminRole.textContent = adminData.role === "super_admin" ? "Super Admin" : "Admin"; if ( adminData.role === "super_admin" ) { superAdminSection.style.display = ""; votersBtn.style.display = ""; loadHero(); } else { superAdminSection.style.display = "none"; votersBtn.style.display = "none"; loadHero(); } } catch (error) { console.error( "Admin verification error:", error ); await signOut(auth); window.location.href = "admin-login.html"; }

});

electionsBtn.addEventListener( "click", () => {

window.location.href = "elections.html"; }

);

candidatesBtn.addEventListener( "click", () => {

window.location.href = "select-election.html?next=candidates.html"; }

);

votersBtn.addEventListener( "click", () => {

window.location.href = "select-election.html?next=voters.html"; }

);

resultsBtn.addEventListener( "click", () => {

window.location.href = "admin-results.html"; }

);

studentsBtn.addEventListener( "click", () => {

window.location.href = "students.html"; }

);

adminManagementBtn.addEventListener( "click", () => {

window.location.href = "admin-management.html"; }

);

logoutBtn.addEventListener( "click", async () => {

try { await signOut(auth); window.location.href = "admin-login.html"; } catch (error) { console.error( "Logout error:", error ); } }

);

formsBtn.addEventListener("click", () => { window.location.href = "forms.html"; });
announcementsBtn.addEventListener("click", () => { window.location.href = "admin-announcements.html"; });

/* ---------- menu ---------- */
const menuButton = document.getElementById("menu-toggle");
const menu = document.getElementById("student-menu");
menuButton.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) {
        menu.hidden = true;
        menuButton.setAttribute("aria-expanded", "false");
    }
});

/* ---------- gradient card: what is happening with elections right now ---------- */
const toMillis = (value) => (value && typeof value.toMillis === "function" ? value.toMillis() : (value ? new Date(value).getTime() || 0 : 0));

function timeLeft(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    return days ? (hours ? `${days}d ${hours}h` : `${days}d`) : hours ? (rest ? `${hours}h ${rest}m` : `${hours}h`) : `${minutes}m`;
}

const when = (ms) => new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");

async function loadHero() {
    const title = document.getElementById("admin-hero-title");
    const sub = document.getElementById("admin-hero-sub");
    const stats = document.getElementById("admin-hero-stats");
    const action = document.getElementById("admin-hero-action");

    try {
        const snapshot = await getDocs(collection(db, "elections"));
        const now = Date.now();
        const list = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), start: toMillis(item.data().startAt), end: toMillis(item.data().endAt) }));
        const drafts = list.filter((e) => (e.status || "draft") === "draft");
        const published = list.filter((e) => ["published", "ended"].includes(e.status));
        const live = published.filter((e) => e.status === "published" && e.start <= now && now < e.end).sort((a, b) => a.end - b.end)[0];
        const upcoming = published.filter((e) => e.status === "published" && e.start > now).sort((a, b) => a.start - b.start)[0];
        const ended = published.filter((e) => e.status === "ended" || e.end <= now);
        const featured = live || upcoming;

        if (live) {
            title.textContent = live.title || "Election";
            sub.textContent = `Voting is live, ${timeLeft(live.end - now)} left. Closes ${when(live.end)}.`;
        } else if (upcoming) {
            title.textContent = upcoming.title || "Election";
            sub.textContent = `Voting opens ${when(upcoming.start)}.`;
        } else if (drafts.length) {
            title.textContent = "No election is running";
            sub.textContent = `${drafts.length} draft ${drafts.length === 1 ? "election is" : "elections are"} ready to set up.`;
        } else {
            title.textContent = "No elections yet";
            sub.textContent = "Create one to get started.";
        }

        stats.replaceChildren(...[[drafts.length === 1 ? "Draft" : "Drafts", drafts.length], ["Open", published.length - ended.length], ["Ended", ended.length]].map(([label, count]) => {
            const chip = document.createElement("span");
            const number = document.createElement("strong");
            number.textContent = String(count);
            chip.append(number, ` ${label}`);
            return chip;
        }));

        action.hidden = false;
        if (featured) {
            action.textContent = "Manage election";
            action.onclick = () => { window.location.href = `manage-election.html?id=${encodeURIComponent(featured.id)}`; };
        } else {
            action.textContent = drafts.length ? "Open elections" : "Create election";
            action.onclick = () => { window.location.href = "elections.html"; };
        }
    } catch (error) {
        console.error("Dashboard summary error:", error);
        title.textContent = "Election control";
        sub.textContent = "";
        stats.replaceChildren();
        action.hidden = true;
    }
}
