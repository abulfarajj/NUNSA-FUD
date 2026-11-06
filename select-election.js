import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0",
    authDomain: "nunsa-voting-app.firebaseapp.com",
    projectId: "nunsa-voting-app",
    storageBucket: "nunsa-voting-app.firebasestorage.app",
    messagingSenderId: "1069853481069",
    appId: "1:1069853481069:web:63ebcca28764",
    measurementId: "G-EMYNQR6T0F"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TARGETS = {
    "candidates.html": "Candidates",
    "voters.html": "Voter register"
};

const next = new URLSearchParams(window.location.search).get("next");
const target = Object.hasOwn(TARGETS, next) ? next : "manage-election.html";

const title = document.getElementById("pick-title");
const list = document.getElementById("pick-list");

if (Object.hasOwn(TARGETS, next)) {
    title.textContent = TARGETS[next];
    title.setAttribute("aria-label", TARGETS[next]);
}

document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "admin.html";
});

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatRange(election) {
    const start = toDate(election.startAt);
    const end = toDate(election.endAt);
    if (!start || !end) return "";
    const options = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };
    return `${start.toLocaleString([], options)} to ${end.toLocaleString([], options)}`;
}

function showEmpty() {
    list.replaceChildren();

    const message = document.createElement("p");
    message.className = "pick-empty";
    message.textContent = "There are no draft elections. Create one first, then come back here.";

    const link = document.createElement("a");
    link.className = "pick-create";
    link.href = "elections.html";
    link.textContent = "Go to Elections";

    list.append(message, link);
}

function showElections(elections) {
    list.replaceChildren();

    for (const election of elections) {
        const row = document.createElement("a");
        row.className = "pick-row";
        row.href = `${target}?id=${encodeURIComponent(election.id)}`;

        const text = document.createElement("span");
        text.className = "pick-text";

        const name = document.createElement("strong");
        name.textContent = election.title || "Untitled election";
        text.append(name);

        const range = formatRange(election);
        if (range) {
            const dates = document.createElement("span");
            dates.textContent = range;
            text.append(dates);
        }

        const arrow = document.createElement("span");
        arrow.className = "pick-arrow";
        arrow.textContent = "→";

        row.append(text, arrow);
        list.append(row);
    }
}

async function loadDrafts() {
    const snapshot = await getDocs(collection(db, "elections"));
    const drafts = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((election) => (election.status || "draft") === "draft");

    drafts.sort((a, b) => (toDate(b.startAt)?.getTime() || 0) - (toDate(a.startAt)?.getTime() || 0));

    if (drafts.length === 0) {
        showEmpty();
    } else {
        showElections(drafts);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "admin-login.html";
        return;
    }

    try {
        const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
        if (!adminSnapshot.exists() || adminSnapshot.data().active !== true) {
            window.location.href = "admin-login.html";
            return;
        }
        await loadDrafts();
    } catch (error) {
        console.error(error);
        list.textContent = "Could not load elections. Check your connection and try again.";
    }
});
