import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    getDocs,
    doc,
    getDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0",
    authDomain: "nunsa-voting-app.firebaseapp.com",
    projectId: "nunsa-voting-app",
    storageBucket: "nunsa-voting-app.firebasestorage.app",
    messagingSenderId: "1069853481069",
    appId: "1:1069853481069:web:63ebcca28764"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const voterWelcome =
    document.getElementById("voter-welcome");

const electionsContainer =
    document.getElementById("elections-container");

const electionLoading =
    document.getElementById("election-loading");

const noElections =
    document.getElementById("no-elections");

let currentUser = null;
let currentMatricNumber = "";

function normalizeMatric(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

function voterDocumentId(
    electionId,
    matricNumber
) {
    return (
        electionId +
        "_" +
        normalizeMatric(matricNumber)
            .replace(/[^A-Z0-9]/g, "")
    );
}

function formatDate(timestamp) {

    if (!timestamp) {
        return "Not available";
    }

    const date =
        timestamp.toDate
            ? timestamp.toDate()
            : new Date(timestamp);

    return date.toLocaleString();
}

async function getStudentMatric() {

    const storedMatric =
        sessionStorage.getItem(
            "studentMatricNumber"
        );

    if (storedMatric) {
        return normalizeMatric(storedMatric);
    }

    const studentDocumentId =
        sessionStorage.getItem(
            "studentDocumentId"
        );

    if (!studentDocumentId) {
        return "";
    }

    try {

        const studentSnapshot =
            await getDoc(
                doc(
                    db,
                    "students",
                    studentDocumentId
                )
            );

        if (!studentSnapshot.exists()) {
            return "";
        }

        const studentData =
            studentSnapshot.data();

        return normalizeMatric(
            studentData.matricNumber
        );

    } catch (error) {

        console.error(
            "Unable to load student information:",
            error
        );

        return "";
    }
}

async function checkEligibility(
    electionId
) {

    if (!currentMatricNumber) {
        return false;
    }

    try {

        const voterRef =
            doc(
                db,
                "voters",
                voterDocumentId(
                    electionId,
                    currentMatricNumber
                )
            );

        const voterSnapshot =
            await getDoc(voterRef);

        if (!voterSnapshot.exists()) {
            return false;
        }

        const voterData =
            voterSnapshot.data();

        return (
            voterData.electionId === electionId &&
            normalizeMatric(
                voterData.matricNumber
            ) === currentMatricNumber &&
            voterData.status === "active"
        );

    } catch (error) {

        console.error(
            "Eligibility check failed:",
            error
        );

        return false;
    }
}

async function checkHasVoted(
    electionId
) {

    if (
        sessionStorage.getItem(
            `voted_${electionId}`
        ) === "true"
    ) {
        return true;
    }

    if (!currentMatricNumber) {
        return false;
    }

    try {

        const voteRef =
            doc(
                db,
                "votes",
                voterDocumentId(
                    electionId,
                    currentMatricNumber
                )
            );

        const voteSnapshot =
            await getDoc(voteRef);

        return voteSnapshot.exists();

    } catch (error) {

        console.error(
            "Vote status check failed:",
            error
        );

        return false;
    }
}

function getElectionState(
    election
) {

    const now = new Date();

    const start =
        election.startAt?.toDate
            ? election.startAt.toDate()
            : new Date(election.startAt);

    const end =
        election.endAt?.toDate
            ? election.endAt.toDate()
            : new Date(election.endAt);

    if (now < start) {
        return "upcoming";
    }

    if (now >= start && now < end) {
        return "active";
    }

    return "ended";
}

function createActionButton(
    label,
    href
) {

    const button =
        document.createElement("button");

    button.type = "button";
    button.className = "vote-button";
    button.textContent = label;

    button.addEventListener(
        "click",
        () => {
            window.location.href = href;
        }
    );

    return button;
}

function createElectionCard(
    election,
    state,
    eligible,
    hasVoted
) {

    const card =
        document.createElement("div");

    card.className =
        "welcome-card";

    const title =
        document.createElement("h2");

    title.textContent =
        election.title || "Election";

    const description =
        document.createElement("p");

    description.textContent =
        election.description || "";

    const status =
        document.createElement("p");

    status.innerHTML =
        "<strong>Status:</strong> " +
        (
            state === "active"
                ? "Active"
                : state === "upcoming"
                    ? "Upcoming"
                    : "Ended"
        );

    const dates =
        document.createElement("p");

    dates.innerHTML =
        "<strong>Starts:</strong> " +
        formatDate(election.startAt) +
        "<br><strong>Ends:</strong> " +
        formatDate(election.endAt);

    const buttonGroup =
        document.createElement("div");

    buttonGroup.className =
        "election-buttons";

    const votingHref =
        "voting.html?id=" +
        encodeURIComponent(
            election.id
        );

    const resultsHref =
        "results.html?id=" +
        encodeURIComponent(
            election.id
        );

    if (state === "active") {

        if (eligible && !hasVoted) {

            buttonGroup.appendChild(
                createActionButton(
                    "VOTE NOW",
                    votingHref
                )
            );
        }

        buttonGroup.appendChild(
            createActionButton(
                "VIEW LIVE RESULTS",
                resultsHref
            )
        );

    } else if (state === "upcoming") {

        buttonGroup.appendChild(
            createActionButton(
                "VIEW ELECTION",
                votingHref
            )
        );

    } else {

        buttonGroup.appendChild(
            createActionButton(
                "VIEW FINAL RESULTS",
                resultsHref
            )
        );
    }

    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(status);
    card.appendChild(dates);
    card.appendChild(buttonGroup);

    return card;
}

async function loadElections() {

    electionLoading.textContent =
        "Loading elections...";

    noElections.style.display =
        "none";

    electionsContainer.innerHTML = "";

    const headingCard =
        document.createElement("div");

    headingCard.className =
        "welcome-card";

    const heading =
        document.createElement("h2");

    heading.textContent =
        "Elections";

    const loading =
        document.createElement("p");

    loading.textContent =
        "Loading elections...";

    headingCard.appendChild(heading);
    headingCard.appendChild(loading);

    electionsContainer.appendChild(
        headingCard
    );

    try {

        const electionsQuery =
            query(
                collection(
                    db,
                    "elections"
                ),
                where(
                    "status",
                    "in",
                    [
                        "published",
                        "ended"
                    ]
                )
            );

        const snapshot =
            await getDocs(
                electionsQuery
            );

        electionsContainer.innerHTML =
            "";

        if (snapshot.empty) {

            noElections.style.display =
                "block";

            return;
        }

        const elections =
            snapshot.docs.map(
                electionDoc => ({
                    id:
                        electionDoc.id,
                    ...electionDoc.data()
                })
            );

        elections.sort(
            (a, b) => {

                const aDate =
                    a.startAt?.toDate
                        ? a.startAt.toDate()
                        : new Date(a.startAt);

                const bDate =
                    b.startAt?.toDate
                        ? b.startAt.toDate()
                        : new Date(b.startAt);

                return (
                    bDate.getTime() -
                    aDate.getTime()
                );
            }
        );

        for (
            const election of elections
        ) {

            const state =
                getElectionState(
                    election
                );

            const eligible =
                state === "active"
                    ? await checkEligibility(
                        election.id
                    )
                    : false;

            const hasVoted =
                state === "active" && eligible
                    ? await checkHasVoted(
                        election.id
                    )
                    : false;

            electionsContainer.appendChild(
                createElectionCard(
                    election,
                    state,
                    eligible,
                    hasVoted
                )
            );
        }

    } catch (error) {

        console.error(
            "Failed to load elections:",
            error
        );

        electionsContainer.innerHTML =
            "";

        const errorCard =
            document.createElement("div");

        errorCard.className =
            "welcome-card";

        errorCard.innerHTML =
            "<h2>Unable to Load Elections</h2>" +
            "<p>Please try again later.</p>";

        electionsContainer.appendChild(
            errorCard
        );
    }
}

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            window.location.href =
                "index.html";

            return;
        }

        currentUser = user;

        currentMatricNumber =
            await getStudentMatric();

        voterWelcome.textContent =
            "Welcome";

        await loadElections();
    }
);