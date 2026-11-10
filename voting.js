import { setDigit, readDigit, typedDigit } from "./pin-boxes.js";
import { buildReceiptCard } from "./receipt-card.js";
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

const params =
    new URLSearchParams(window.location.search);

const electionId =
    params.get("id");

const electionTitle =
    document.getElementById("election-title");

const electionDescription =
    document.getElementById("election-description");

const electionStatus =
    document.getElementById("election-status");

const positionsContainer =
    document.getElementById("positions-container");

const loadingMessage =
    document.getElementById("loading-message");

const voteSummary =
    document.getElementById("vote-summary");

const selectedVotes =
    document.getElementById("selected-votes");

const castVoteButton =
    document.getElementById("cast-vote-btn");

const voteMessage =
    document.getElementById("vote-message");

const backToPortalButton =
    document.getElementById("back-to-portal");

const voteConfirmation =
    document.getElementById("vote-confirmation");

const confirmationSelectedVotes =
    document.getElementById(
        "confirmation-selected-votes"
    );

const proceedToPinButton =
    document.getElementById(
        "proceed-to-pin-btn"
    );

const cancelConfirmationButton =
    document.getElementById(
        "cancel-confirmation-btn"
    );

const votePinSection =
    document.getElementById(
        "vote-pin-section"
    );

const votePinGroup =
    document.getElementById(
        "vote-pin-group"
    );

const confirmVoteButton =
    document.getElementById(
        "confirm-vote-btn"
    );

const backToConfirmationButton =
    document.getElementById(
        "back-to-confirmation-btn"
    );

const votePinMessage =
    document.getElementById(
        "vote-pin-message"
    );

const selectedCandidates = {};

let currentStudentMatric = null;
let currentElectionEligible = false;
let currentElection = null;
let submittingVote = false;

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
            .replace(
                /[^A-Z0-9]/g,
                ""
            )
    );
}

function getSelectedPin() {
    return Array.from(
        votePinGroup.querySelectorAll("input")
    )
        .map(readDigit)
        .join("");
}

function clearPinInputs() {
    votePinGroup
        .querySelectorAll("input")
        .forEach(input => {
            setDigit(input, "");
        });

    votePinMessage.textContent = "";

    const firstInput =
        votePinGroup.querySelector("input");

    if (firstInput) {
        firstInput.focus();
    }
}

function setupPinInputs() {
    const inputs =
        Array.from(
            votePinGroup.querySelectorAll("input")
        );

    inputs.forEach((input, index) => {
        input.addEventListener(
            "input",
            () => {
                setDigit(input, typedDigit(input));

                if (
                    readDigit(input) &&
                    index <
                    inputs.length - 1
                ) {
                    inputs[index + 1].focus();
                }
            }
        );

        input.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Backspace" &&
                    !input.value &&
                    index > 0
                ) {
                    inputs[index - 1].focus();
                    setDigit(inputs[index - 1], "");
                }
            }
        );

        input.addEventListener(
            "paste",
            event => {
                event.preventDefault();

                const pasted =
                    event.clipboardData
                        .getData("text")
                        .replace(/\D/g, "")
                        .slice(0, 4);

                pasted
                    .split("")
                    .forEach(
                        (digit, digitIndex) => {
                            if (
                                inputs[
                                    digitIndex
                                ]
                            ) {
                                setDigit(
                                    inputs[digitIndex],
                                    digit
                                );
                            }
                        }
                    );

                const nextEmpty =
                    inputs.find(
                        input =>
                            !input.value
                    );

                if (nextEmpty) {
                    nextEmpty.focus();
                } else {
                    inputs[
                        inputs.length - 1
                    ].focus();
                }
            }
        );
    });
}

function hideVotingConfirmation() {
    voteConfirmation.style.display =
        "none";

    votePinSection.style.display =
        "none";

    voteSummary.style.display =
        "block";

    castVoteButton.style.display =
        "block";

    clearPinInputs();
}

function showEligibilityError(
    message
) {
    currentElectionEligible =
        false;

    positionsContainer.innerHTML =
        "";

    voteSummary.style.display =
        "none";

    castVoteButton.disabled =
        true;

    voteMessage.textContent =
        message;
}

async function checkElectionEligibility() {
    const storedMatric =
        sessionStorage.getItem(
            "studentMatricNumber"
        );

    if (!storedMatric) {
        showEligibilityError(
            "Your student session could not be verified. Please return to the student portal."
        );

        return false;
    }

    currentStudentMatric =
        normalizeMatric(
            storedMatric
        );

    if (!electionId) {
        showEligibilityError(
            "No election was selected."
        );

        return false;
    }

    try {
        const voterId =
            voterDocumentId(
                electionId,
                currentStudentMatric
            );

        const voterRef =
            doc(
                db,
                "voters",
                voterId
            );

        const voterSnapshot =
            await getDoc(
                voterRef
            );

        if (!voterSnapshot.exists()) {
            showEligibilityError(
                "You are not eligible to vote in this election."
            );

            return false;
        }

        const voterData =
            voterSnapshot.data();

        if (
            voterData.electionId !==
            electionId
        ) {
            showEligibilityError(
                "You are not eligible to vote in this election."
            );

            return false;
        }

        if (
            normalizeMatric(
                voterData.matricNumber
            ) !==
            currentStudentMatric
        ) {
            showEligibilityError(
                "You are not eligible to vote in this election."
            );

            return false;
        }

        if (
            voterData.status !==
            "active"
        ) {
            showEligibilityError(
                "Your voting eligibility for this election is inactive."
            );

            return false;
        }

        currentElectionEligible =
            true;

        return true;

    } catch (error) {
        console.error(
            "Election eligibility error:",
            error
        );

        showEligibilityError(
            "Unable to verify your eligibility for this election. Please try again."
        );

        return false;
    }
}

async function loadElection() {
    if (!electionId) {
        electionTitle.textContent =
            "Election Not Found";

        electionDescription.textContent =
            "No election was selected.";

        electionStatus.textContent =
            "";

        return false;
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

        if (!electionSnapshot.exists()) {
            electionTitle.textContent =
                "Election Not Found";

            electionDescription.textContent =
                "The selected election could not be found.";

            electionStatus.textContent =
                "";

            return false;
        }

        const election =
            electionSnapshot.data();

        currentElection =
            election;

        electionTitle.textContent =
            election.title ||
            "Untitled Election";

        electionDescription.textContent =
            election.description ||
            "No description provided.";

        const now =
            new Date();

        const startAt =
            election.startAt?.toDate
                ? election.startAt.toDate()
                : new Date(
                    election.startAt
                );

        const endAt =
            election.endAt?.toDate
                ? election.endAt.toDate()
                : new Date(
                    election.endAt
                );

        if (
            election.status !==
            "published"
        ) {
            electionStatus.textContent =
                "This election is not available.";

            castVoteButton.disabled =
                true;

            return false;
        }

        if (now < startAt) {
            electionStatus.textContent =
                "Election has not started yet.";

            castVoteButton.disabled =
                true;

            return false;
        }

        if (now >= endAt) {
            electionStatus.textContent =
                "Election Ended.";

            castVoteButton.disabled =
                true;

            return false;
        }

        electionStatus.textContent =
            "Election is currently active.";

        return true;

    } catch (error) {
        console.error(
            "Load election error:",
            error
        );

        electionTitle.textContent =
            "Unable to Load Election";

        electionDescription.textContent =
            "Unable to load this election.";

        return false;
    }
}

async function loadCandidates() {
    if (!electionId) {
        showMessage(
            "No election was selected."
        );

        return;
    }

    if (!currentElectionEligible) {
        return;
    }

    try {
        const user =
            auth.currentUser;

        if (!user) {
            showMessage(
                "Your session has expired. Please log in again."
            );

            return;
        }

        const token =
            await user.getIdToken();

        const response =
            await fetch(
                `/.netlify/functions/get-election-candidates?electionId=${encodeURIComponent(electionId)}`,
                {
                    method: "GET",
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                "Unable to load candidates."
            );
        }

        positionsContainer.innerHTML =
            "";

        if (
            !data.candidates ||
            data.candidates.length === 0
        ) {
            showMessage(
                "No candidates have been added to this election yet."
            );

            castVoteButton.disabled =
                true;

            return;
        }

        const positions = {};

        data.candidates.forEach(
            candidate => {
                const position =
                    candidate.position ||
                    "General";

                if (!positions[position]) {
                    positions[position] =
                        [];
                }

                positions[position].push({
                    id:
                        candidate.id,

                    name:
                        candidate.name ||
                        "Unnamed Candidate",

                    profilePicture:
                        candidate.profilePicture ||
                        "assets/default-profile.jpg"
                });
            }
        );

        renderPositions(
            positions
        );

    } catch (error) {
        console.error(
            "Load candidates error:",
            error
        );

        showMessage(
            error.message ||
            "Unable to load candidates."
        );

        castVoteButton.disabled =
            true;
    }
}

function renderPositions(
    positions
) {
    positionsContainer.innerHTML =
        "";

    Object.keys(
        positions
    ).forEach(
        position => {
            const positionCard =
                document.createElement(
                    "div"
                );

            positionCard.className =
                "admin-welcome-card";

            const positionTitle =
                document.createElement(
                    "h2"
                );

            positionTitle.textContent =
                position;

            positionCard.appendChild(
                positionTitle
            );

            const candidateContainer =
                document.createElement(
                    "div"
                );

            candidateContainer.className =
                "candidate-options";

            positions[position].forEach(
                candidate => {
                    const candidateLabel =
                        document.createElement(
                            "label"
                        );

                    candidateLabel.className =
                        "candidate-option";

                    const radio =
                        document.createElement(
                            "input"
                        );

                    radio.type =
                        "radio";

                    radio.name =
                        `position-${position}`;

                    radio.value =
                        candidate.id;

                    radio.dataset.position =
                        position;

                    radio.dataset.name =
                        candidate.name;

                    radio.addEventListener(
                        "change",
                        () => {
                            selectedCandidates[
                                position
                            ] = candidate;

                            updateVoteSummary();
                        }
                    );

                    const image =
                        document.createElement(
                            "img"
                        );

                    image.src =
                        candidate.profilePicture ||
                        "assets/default-profile.jpg";

                    image.alt =
                        candidate.name;

                    image.className =
                        "candidate-profile-picture";

                    image.onerror =
                        () => {
                            image.src =
                                "assets/default-profile.jpg";
                        };

                    const candidateInfo =
                        document.createElement(
                            "span"
                        );

                    candidateInfo.className =
                        "candidate-info";

                    const candidateName =
                        document.createElement(
                            "strong"
                        );

                    candidateName.textContent =
                        candidate.name;

                    candidateInfo.appendChild(
                        candidateName
                    );

                    candidateLabel.appendChild(
                        radio
                    );

                    candidateLabel.appendChild(
                        image
                    );

                    candidateLabel.appendChild(
                        candidateInfo
                    );

                    candidateContainer.appendChild(
                        candidateLabel
                    );
                }
            );

            positionCard.appendChild(
                candidateContainer
            );

            positionsContainer.appendChild(
                positionCard
            );
        }
    );

    castVoteButton.disabled =
        true;

    updateVoteProgress();
}

function buildVoteReceipt(receipt) {
    return buildReceiptCard(receipt, "This receipt is only shown once. Download it now if you want a copy.");
}


function updateVoteProgress() {

    const total =
        positionsContainer.querySelectorAll(
            ".candidate-options"
        ).length;

    let bar =
        document.getElementById("vote-progress");

    if (!total) {
        if (bar) bar.remove();
        return;
    }

    const done =
        Object.keys(selectedCandidates).length;

    if (!bar) {
        bar = document.createElement("div");
        bar.id = "vote-progress";
        bar.className = "vote-progress";
        bar.innerHTML =
            '<div class="vote-progress-text"></div>' +
            '<div class="vote-progress-track"><span></span></div>';
        positionsContainer.parentNode.insertBefore(
            bar,
            positionsContainer
        );
    }

    bar.querySelector(".vote-progress-text").textContent =
        done === total
            ? "All positions selected - ready to vote"
            : `${done} of ${total} positions selected`;

    bar.querySelector(".vote-progress-track span")
        .style.width = `${(done / total) * 100}%`;

    bar.classList.toggle("complete", done === total);
}

function updateVoteSummary() {

    updateVoteProgress();

    selectedVotes.innerHTML =
        "";

    const selectedPositionCount =
        Object.keys(
            selectedCandidates
        ).length;

    const totalPositionCount =
        positionsContainer.querySelectorAll(
            ".candidate-options"
        ).length;

    if (
        selectedPositionCount ===
        0
    ) {
        voteSummary.style.display =
            "none";

        castVoteButton.disabled =
            true;

        return;
    }

    voteSummary.style.display =
        "block";

    Object.keys(
        selectedCandidates
    ).forEach(
        position => {
            const candidate =
                selectedCandidates[
                    position
                ];

            const row =
                document.createElement(
                    "p"
                );

            const positionName =
                document.createElement(
                    "strong"
                );

            positionName.textContent =
                `${position}: `;

            row.appendChild(
                positionName
            );

            row.appendChild(
                document.createTextNode(
                    candidate.name
                )
            );

            selectedVotes.appendChild(
                row
            );
        }
    );

    if (
        selectedPositionCount <
        totalPositionCount
    ) {
        const remaining =
            totalPositionCount -
            selectedPositionCount;

        const warning =
            document.createElement(
                "p"
            );

        warning.textContent =
            remaining === 1
                ? "Please select a candidate for the remaining position."
                : `Please select a candidate for all ${remaining} remaining positions.`;

        warning.style.color =
            "#c0392b";

        selectedVotes.appendChild(
            warning
        );

        castVoteButton.disabled =
            true;

        return;
    }

    castVoteButton.disabled =
        false;
}

function populateConfirmation() {
    confirmationSelectedVotes.innerHTML =
        "";

    Object.keys(
        selectedCandidates
    ).forEach(
        position => {
            const candidate =
                selectedCandidates[
                    position
                ];

            const row =
                document.createElement(
                    "p"
                );

            const positionName =
                document.createElement(
                    "strong"
                );

            positionName.textContent =
                `${position}: `;

            row.appendChild(
                positionName
            );

            row.appendChild(
                document.createTextNode(
                    candidate.name
                )
            );

            confirmationSelectedVotes.appendChild(
                row
            );
        }
    );
}

castVoteButton.addEventListener(
    "click",
    () => {
        if (
            !currentElectionEligible
        ) {
            voteMessage.textContent =
                "You are not eligible to vote in this election.";

            return;
        }

        const selectedPositionCount =
            Object.keys(
                selectedCandidates
            ).length;

        const totalPositionCount =
            positionsContainer.querySelectorAll(
                ".candidate-options"
            ).length;

        if (
            selectedPositionCount !==
            totalPositionCount
        ) {
            voteMessage.textContent =
                "Please select a candidate for every position before continuing.";

            return;
        }

        populateConfirmation();

        voteSummary.style.display =
            "none";

        castVoteButton.style.display =
            "none";

        voteConfirmation.style.display =
            "block";

        votePinSection.style.display =
            "none";

        voteMessage.textContent =
            "";
    }
);

cancelConfirmationButton.addEventListener(
    "click",
    () => {
        hideVotingConfirmation();

        voteMessage.textContent =
            "";
    }
);

proceedToPinButton.addEventListener(
    "click",
    () => {
        voteConfirmation.style.display =
            "none";

        votePinSection.style.display =
            "block";

        clearPinInputs();
    }
);

backToConfirmationButton.addEventListener(
    "click",
    () => {
        votePinSection.style.display =
            "none";

        voteConfirmation.style.display =
            "block";

        clearPinInputs();
    }
);

confirmVoteButton.addEventListener(
    "click",
    async () => {
        if (submittingVote) {
            return;
        }

        const pin =
            getSelectedPin();

        if (!/^\d{4}$/.test(pin)) {
            votePinMessage.textContent =
                "Please enter your complete 4-digit PIN.";

            return;
        }

        if (
            !currentStudentMatric ||
            !electionId
        ) {
            votePinMessage.textContent =
                "Your voting session could not be verified.";

            return;
        }

        const positions =
            Object.keys(
                selectedCandidates
            );

        if (
            positions.length === 0
        ) {
            votePinMessage.textContent =
                "No candidates have been selected.";

            return;
        }

        submittingVote =
            true;

        confirmVoteButton.disabled =
            true;

        confirmVoteButton.textContent =
            "SUBMITTING...";

        votePinMessage.textContent =
            "Recording your vote...";

        try {
            const user =
                auth.currentUser;

            if (!user) {
                throw new Error(
                    "Your session has expired. Please log in again."
                );
            }

            const token =
                await user.getIdToken();

            const selections =
                positions.map(
                    position => {
                        const candidate =
                            selectedCandidates[
                                position
                            ];

                        return {
                            position,
                            candidateId:
                                candidate.id
                        };
                    }
                );

            const response =
                await fetch(
                    "/.netlify/functions/cast-vote",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                            Authorization:
                                `Bearer ${token}`
                        },
                        body:
                            JSON.stringify({
                                electionId,
                                matricNumber:
                                    currentStudentMatric,
                                pin,
                                selections
                            })
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {
                throw new Error(
                    data.message ||
                    "Unable to record your vote."
                );
            }

                        const receiptOrder = Array.from(
                positionsContainer.querySelectorAll(".candidate-options")
            ).map(group => {
                const heading = group.parentNode.querySelector("h2");
                return heading ? heading.textContent : "";
            });

            const receiptRows = (
                receiptOrder.filter(name => selectedCandidates[name]).length
                    ? receiptOrder.filter(name => selectedCandidates[name])
                    : Object.keys(selectedCandidates)
            ).map(name => ({
                position: name,
                name: selectedCandidates[name].name
            }));

            sessionStorage.setItem(
                `voted_${electionId}`,
                "true"
            );

            votePinSection.style.display =
                "none";

            voteConfirmation.style.display =
                "none";

            voteSummary.style.display =
                "none";

            castVoteButton.style.display =
                "none";

            positionsContainer.innerHTML =
                "";

            const successCard = buildVoteReceipt({
                election:
                    (currentElection && currentElection.title) ||
                    electionTitle.textContent,
                matric: currentStudentMatric,
                rows: receiptRows,
                code: data.receiptCode || "",
                votedAt: data.votedAt || ""
            });

            positionsContainer.appendChild(successCard);

            updateVoteProgress();

            window.scrollTo({ top: 0, behavior: "smooth" });

            voteMessage.textContent =
                "";

        } catch (error) {
            console.error(
                "Vote submission error:",
                error
            );

            votePinMessage.textContent =
                error.message ||
                "Unable to record your vote. Please try again.";

        } finally {
            submittingVote =
                false;

            confirmVoteButton.disabled =
                false;

            confirmVoteButton.textContent =
                "CONFIRM VOTE";
        }
    }
);

backToPortalButton.addEventListener(
    "click",
    () => {
        window.location.href =
            "voter-portal.html";
    }
);

function showMessage(
    message
) {
    positionsContainer.innerHTML =
        "";

    const card =
        document.createElement(
            "div"
        );

    card.className =
        "admin-welcome-card";

    const paragraph =
        document.createElement(
            "p"
        );

    paragraph.textContent =
        message;

    card.appendChild(
        paragraph
    );

    positionsContainer.appendChild(
        card
    );
}

setupPinInputs();

onAuthStateChanged(
    auth,
    async user => {
        if (!user) {
            window.location.href =
                "index.html";

            return;
        }

        const electionLoaded =
            await loadElection();

        if (!electionLoaded) {
            return;
        }

        const eligible =
            await checkElectionEligibility();

        if (!eligible) {
            return;
        }

        await loadCandidates();
    }
);