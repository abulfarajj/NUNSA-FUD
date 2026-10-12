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
    getDoc,
    updateDoc,
    serverTimestamp
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

const params =
    new URLSearchParams(
        window.location.search
    );

const electionId =
    params.get("id");

const electionTitle =
    document.getElementById(
        "election-title"
    );

const electionDescription =
    document.getElementById(
        "election-description"
    );

const electionStatus =
    document.getElementById(
        "election-status"
    );

const electionStart =
    document.getElementById(
        "election-start"
    );

const electionEnd =
    document.getElementById(
        "election-end"
    );

const electionCreatedBy =
    document.getElementById(
        "election-created-by"
    );

const currentTime =
    document.getElementById(
        "current-time"
    );

const statusHeading =
    document.getElementById(
        "status-heading"
    );

const statusDescription =
    document.getElementById(
        "status-description"
    );

const statusCountdown =
    document.getElementById(
        "status-countdown"
    );

const publishButton =
    document.getElementById(
        "publish-election-btn"
    );

const publishMessage =
    document.getElementById(
        "publish-message"
    );

const backElectionsButton =
    document.getElementById(
        "back-elections-btn"
    );

const manageCandidatesButton =
    document.getElementById(
        "manage-candidates-btn"
    );

const manageVotersButton =
    document.getElementById(
        "manage-voters-btn"
    );

const viewResultsButton =
    document.getElementById(
        "view-results-btn"
    );

let currentElection =
    null;

let statusTimer =
    null;

if (
    backElectionsButton
) {
    backElectionsButton.addEventListener(
        "click",
        () => {
            window.location.href =
                "elections.html";
        }
    );
}

function formatDate(
    value
) {
    if (!value) {
        return "Not available";
    }

    let date;

    if (
        typeof value.toDate ===
        "function"
    ) {
        date =
            value.toDate();
    } else {
        date =
            new Date(value);
    }

    if (
        isNaN(
            date.getTime()
        )
    ) {
        return "Not available";
    }

    return date.toLocaleString();
}

function getDate(
    value
) {
    if (!value) {
        return null;
    }

    if (
        typeof value.toDate ===
        "function"
    ) {
        return value.toDate();
    }

    const date =
        new Date(value);

    if (
        isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date;
}

function getElectionState(
    election
) {
    const now =
        new Date();

    const start =
        getDate(
            election.startAt
        );

    const end =
        getDate(
            election.endAt
        );

    if (
        election.status ===
        "draft"
    ) {
        return "draft";
    }

    if (
        election.status ===
        "published"
    ) {
        if (
            start &&
            now < start
        ) {
            return "upcoming";
        }

        if (
            start &&
            end &&
            now >= start &&
            now < end
        ) {
            return "active";
        }

        if (
            end &&
            now >= end
        ) {
            return "ended";
        }
    }

    if (
        election.status ===
        "ended"
    ) {
        return "ended";
    }

    return "unknown";
}

function updateElectionState() {
    if (!currentElection) {
        return;
    }

    const state =
        getElectionState(
            currentElection
        );

    const now =
        new Date();

    if (
        currentTime
    ) {
        currentTime.textContent =
            now.toLocaleString();
    }

    if (
        state === "draft"
    ) {
        electionStatus.textContent =
            "draft";

        statusHeading.textContent =
            "Draft";

        statusDescription.textContent =
            "This election has not been published yet.";

        statusCountdown.textContent =
            "Publish the election when its candidates and voter list are ready.";

        publishButton.disabled =
            false;

        publishButton.textContent =
            "PUBLISH ELECTION";

        return;
    }

    if (
        state === "upcoming"
    ) {
        electionStatus.textContent =
            "published";

        statusHeading.textContent =
            "Election Published";

        statusDescription.textContent =
            "The election is published and waiting for its scheduled start time.";

        statusCountdown.textContent =
            "Starts in " +
            formatDuration(
                currentElection.startAt
            );

        publishButton.disabled =
            true;

        publishButton.textContent =
            "ELECTION PUBLISHED";

        return;
    }

    if (
        state === "active"
    ) {
        electionStatus.textContent =
            "voting";

        statusHeading.textContent =
            "Voting Is Open";

        statusDescription.textContent =
            "The scheduled voting period is currently active.";

        statusCountdown.textContent =
            "Voting ends in " +
            formatDuration(
                currentElection.endAt
            );

        publishButton.disabled =
            true;

        publishButton.textContent =
            "VOTING IN PROGRESS";

        return;
    }

    if (
        state === "ended"
    ) {
        electionStatus.textContent =
            "ended";

        statusHeading.textContent =
            "Election Ended";

        statusDescription.textContent =
            "The scheduled voting period has ended. Voting is no longer available.";

        statusCountdown.textContent =
            "Final results can be viewed from the Results section.";

        publishButton.disabled =
            true;

        publishButton.textContent =
            "ELECTION ENDED";

        if (
            currentElection.status !==
            "ended"
        ) {
            markElectionEnded();
        }

        return;
    }

    electionStatus.textContent =
        "unknown";

    statusHeading.textContent =
        "Unknown Election State";

    statusDescription.textContent =
        "The election status could not be determined.";

    statusCountdown.textContent =
        "Please check the election settings.";

    publishButton.disabled =
        true;
}

function formatDuration(
    targetValue
) {
    const target =
        getDate(
            targetValue
        );

    if (!target) {
        return "Not available";
    }

    const now =
        new Date();

    const difference =
        target.getTime() -
        now.getTime();

    if (
        difference <= 0
    ) {
        return "0 seconds";
    }

    const seconds =
        Math.floor(
            difference / 1000
        );

    const days =
        Math.floor(
            seconds / 86400
        );

    const hours =
        Math.floor(
            (
                seconds % 86400
            ) / 3600
        );

    const minutes =
        Math.floor(
            (
                seconds % 3600
            ) / 60
        );

    const remainingSeconds =
        seconds % 60;

    const parts =
        [];

    if (
        days > 0
    ) {
        parts.push(
            `${days}d`
        );
    }

    if (
        hours > 0 ||
        days > 0
    ) {
        parts.push(
            `${hours}h`
        );
    }

    if (
        minutes > 0 ||
        hours > 0 ||
        days > 0
    ) {
        parts.push(
            `${minutes}m`
        );
    }

    parts.push(
        `${remainingSeconds}s`
    );

    return parts.join(
        " "
    );
}

async function markElectionEnded() {
    if (!electionId) {
        return;
    }

    try {
        const electionRef =
            doc(
                db,
                "elections",
                electionId
            );

        await updateDoc(
            electionRef,
            {
                status:
                    "ended",

                updatedAt:
                    serverTimestamp()
            }
        );

        currentElection.status =
            "ended";

        console.log(
            "Election automatically marked as ended."
        );

    } catch (error) {
        console.error(
            "Unable to mark election as ended:",
            error
        );
    }
}

async function loadElection() {
    if (!electionId) {
        electionTitle.textContent =
            "No election selected";

        electionDescription.textContent =
            "No election ID was provided.";

        publishButton.disabled =
            true;

        return;
    }

    try {
        const electionRef =
            doc(
                db,
                "elections",
                electionId
            );

        const electionSnapshot =
            await getDoc(
                electionRef
            );

        if (
            !electionSnapshot.exists()
        ) {
            electionTitle.textContent =
                "Election not found";

            electionDescription.textContent =
                "This election does not exist.";

            publishButton.disabled =
                true;

            return;
        }

        currentElection = {
            id:
                electionSnapshot.id,

            ...electionSnapshot.data()
        };

        electionTitle.textContent =
            currentElection.title ||
            "Untitled Election";

        electionDescription.textContent =
            currentElection.description ||
            "No description provided.";

        electionStart.textContent =
            formatDate(
                currentElection.startAt
            );

        electionEnd.textContent =
            formatDate(
                currentElection.endAt
            );

        electionCreatedBy.textContent =
            currentElection.createdByEmail ||
            currentElection.createdBy ||
            "Unknown";

        updateElectionState();

        if (statusTimer) {
            clearInterval(
                statusTimer
            );
        }

        statusTimer =
            setInterval(
                updateElectionState,
                1000
            );

    } catch (error) {
        console.error(
            "Load election error:",
            error
        );

        electionTitle.textContent =
            "Error loading election";

        electionDescription.textContent =
            error.message ||
            "Unable to load this election.";

        publishButton.disabled =
            true;
    }
}

publishButton.addEventListener(
    "click",
    async () => {
        if (!electionId) {
            publishMessage.textContent =
                "No election selected.";

            publishMessage.style.color =
                "#c0392b";

            return;
        }

        if (!currentElection) {
            publishMessage.textContent =
                "Election data has not loaded yet.";

            publishMessage.style.color =
                "#c0392b";

            return;
        }

        if (
            currentElection.status !==
            "draft"
        ) {
            publishMessage.textContent =
                "Only draft elections can be published.";

            publishMessage.style.color =
                "#c0392b";

            return;
        }

        const start =
            getDate(
                currentElection.startAt
            );

        const end =
            getDate(
                currentElection.endAt
            );

        if (
            !start ||
            !end
        ) {
            publishMessage.textContent =
                "This election does not have valid start and end times.";

            publishMessage.style.color =
                "#c0392b";

            return;
        }

        if (
            end <= start
        ) {
            publishMessage.textContent =
                "The election end time must be after the start time.";

            publishMessage.style.color =
                "#c0392b";

            return;
        }

        const confirmed =
            window.confirm(
                "Publish this election now?\n\nOnce published, its scheduled voting period will control when voting opens and ends."
            );

        if (!confirmed) {
            return;
        }

        publishButton.disabled =
            true;

        publishButton.textContent =
            "PUBLISHING...";

        publishMessage.textContent =
            "Publishing election...";

        publishMessage.style.color =
            "#4f8f9a";

        try {
            const electionRef =
                doc(
                    db,
                    "elections",
                    electionId
                );

            const electionSnapshot =
                await getDoc(
                    electionRef
                );

            if (
                !electionSnapshot.exists()
            ) {
                throw new Error(
                    "Election not found."
                );
            }

            const election =
                electionSnapshot.data();

            if (
                election.status !==
                "draft"
            ) {
                throw new Error(
                    "Only draft elections can be published."
                );
            }

            await updateDoc(
                electionRef,
                {
                    status:
                        "published",

                    publishedAt:
                        serverTimestamp(),

                    publishedBy:
                        auth.currentUser?.uid ||
                        null,

                    publishedByEmail:
                        auth.currentUser?.email ||
                        null,

                    updatedAt:
                        serverTimestamp()
                }
            );

            currentElection.status =
                "published";

            currentElection.publishedAt =
                new Date();

            currentElection.publishedBy =
                auth.currentUser?.uid ||
                null;

            currentElection.publishedByEmail =
                auth.currentUser?.email ||
                null;

            publishMessage.textContent =
                "Election published successfully.";

            publishMessage.style.color =
                "#4f8f9a";

            updateElectionState();

        } catch (error) {
            console.error(
                "Publish election error:",
                error
            );

            publishButton.disabled =
                false;

            publishButton.textContent =
                "PUBLISH ELECTION";

            publishMessage.textContent =
                error.message ||
                "Failed to publish election.";

            publishMessage.style.color =
                "#c0392b";
        }
    }
);

manageCandidatesButton.addEventListener(
    "click",
    () => {
        if (!electionId) {
            return;
        }

        window.location.href =
            `candidates.html?id=${encodeURIComponent(
                electionId
            )}`;
    }
);

manageVotersButton.addEventListener(
    "click",
    () => {
        if (!electionId) {
            return;
        }

        window.location.href =
            `voters.html?id=${encodeURIComponent(
                electionId
            )}`;
    }
);

viewResultsButton.addEventListener(
    "click",
    () => {
        if (!electionId) {
            return;
        }

        window.location.href =
            `results.html?id=${encodeURIComponent(
                electionId
            )}`;
    }
);

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
                alert(
                    "Admin account not found."
                );

                window.location.href =
                    "admin-login.html";

                return;
            }

            const adminData =
                adminSnapshot.data();

            if (
                adminData.active !== true
            ) {
                alert(
                    "Your administrator account is inactive."
                );

                window.location.href =
                    "admin-login.html";

                return;
            }

            if (
                adminData.role !== "admin" &&
                adminData.role !== "super_admin"
            ) {
                alert(
                    "This account does not have administrator access."
                );

                window.location.href =
                    "admin-login.html";

                return;
            }

            console.log(
                "Admin authenticated:",
                user.email
            );

            await loadElection();

        } catch (error) {
            console.error(
                "Authentication error:",
                error
            );

            electionTitle.textContent =
                "Authentication Error";

            electionDescription.textContent =
                "Unable to verify your administrator account.";

            publishButton.disabled =
                true;
        }
    }
);