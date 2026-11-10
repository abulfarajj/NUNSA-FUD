import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

const electionsContainer =
    document.getElementById(
        "elections-container"
    );

const loadingMessage =
    document.getElementById(
        "loading-message"
    );

const messageSection =
    document.getElementById(
        "message-section"
    );

const message =
    document.getElementById(
        "message"
    );

const backBtn =
    document.getElementById(
        "back-btn"
    );

function showMessage(text) {

    message.textContent = text;

    messageSection.style.display =
        "block";
}

function getElectionState(election) {

    const now = new Date();

    const startAt =
        election.startAt?.toDate
            ? election.startAt.toDate()
            : new Date(election.startAt);

    const endAt =
        election.endAt?.toDate
            ? election.endAt.toDate()
            : new Date(election.endAt);

    if (!["published", "ended"].includes(election.status)) {
        return "unpublished";
    }

    if (election.status === "ended") return "ended";

    if (
        now < startAt
    ) {
        return "upcoming";
    }

    if (
        now >= startAt &&
        now < endAt
    ) {
        return "active";
    }

    return "ended";
}

function createElectionCard(
    electionId,
    election,
    finalized = false
) {

    const card =
        document.createElement(
            "div"
        );

    card.className =
        "welcome-card";

    const title =
        document.createElement(
            "h3"
        );

    title.textContent =
        election.title ||
        "Untitled Election";

    const description =
        document.createElement(
            "p"
        );

    description.textContent =
        election.description ||
        "";

    const state =
        getElectionState(
            election
        );

    const status =
        document.createElement(
            "p"
        );

    if (state === "active") {

        status.textContent =
            "Status: Ongoing";

    } else if (
        state === "upcoming"
    ) {

        status.textContent =
            "Status: Upcoming";

    } else if (
        state === "ended"
    ) {

        status.textContent = finalized
            ? "Status: Voting ended · Results finalized"
            : "Status: Voting ended · Awaiting results finalization";

    } else {

        status.textContent =
            "Status: Not Published";
    }

    const button =
        document.createElement(
            "button"
        );

    button.type =
        "button";

    button.className =
        "vote-button";

    button.textContent =
        "VIEW RESULTS";

    button.addEventListener(
        "click",
        () => {

            window.location.href =
                `results.html?id=${encodeURIComponent(electionId)}`;

        }
    );

    card.appendChild(title);

    card.appendChild(description);

    card.appendChild(status);

    card.appendChild(button);

    return card;
}

async function loadElections() {
    try {
        loadingMessage.textContent = "Loading elections...";
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/.netlify/functions/get-election-history", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to load elections.");

        loadingMessage.remove();
        const elections = data.elections || [];
        if (!elections.length) {
            showMessage("There are currently no completed elections available.");
            return;
        }

        elections.forEach(election => {
            const card = createElectionCard(election.id, election, election.finalized === true);
            electionsContainer.appendChild(card);
        });
    } catch (error) {
        console.error("Failed to load elections:", error);
        loadingMessage.textContent = "Unable to load elections.";
        showMessage("Unable to load elections right now. Please try again.");
    }
}

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href =
                "admin-login.html";

            return;
        }

        try {

            const adminRef =
                doc(
                    db,
                    "admins",
                    user.uid
                );

            const adminSnapshot =
                await getDoc(
                    adminRef
                );

            if (
                !adminSnapshot.exists()
            ) {

                window.location.href =
                    "admin-login.html";

                return;
            }

            const adminData =
                adminSnapshot.data();

            if (
                adminData.active !==
                true
            ) {

                window.location.href =
                    "admin-login.html";

                return;
            }

            await loadElections();

        } catch (error) {

            console.error(
                "Admin verification error:",
                error
            );

            window.location.href =
                "admin-login.html";
        }
    }
);

backBtn.addEventListener(
    "click",
    () => {

        window.location.href =
            "admin.html";
    }
);