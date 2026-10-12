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
        .map(input => input.value)
        .join("");
}

function clearPinInputs() {
    votePinGroup
        .querySelectorAll("input")
        .forEach(input => {
            input.value = "";
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
                input.value =
                    input.value.replace(
                        /\D/g,
                        ""
                    );

                if (
                    input.value &&
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
                    inputs[index - 1].value = "";
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
                                inputs[
                                    digitIndex
                                ].value =
                                    digit;
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

function receiptEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function formatReceiptTime(value) {
    const date = value ? new Date(value) : new Date();
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    return safe.toLocaleString([], {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function buildVoteReceipt(receipt) {
    const card = receiptEl("div", "welcome-card vote-receipt");

    card.appendChild(receiptEl("div", "receipt-check", "\u2713"));
    card.appendChild(receiptEl("h2", "", "Vote recorded"));
    card.appendChild(receiptEl(
        "p",
        "receipt-sub",
        "Thank you for taking part in the NUNSA-FUD election. Your vote has been counted."
    ));

    const meta = receiptEl("dl", "receipt-meta");
    const metaRows = [
        ["Election", receipt.election],
        ["Voter", receipt.matric],
        ["Date and time", formatReceiptTime(receipt.votedAt)]
    ];
    if (receipt.code) metaRows.push(["Reference", receipt.code]);
    metaRows.forEach(([label, value]) => {
        const row = receiptEl("div", "receipt-meta-row");
        row.appendChild(receiptEl("dt", "", label));
        row.appendChild(receiptEl("dd", label === "Reference" ? "receipt-code" : "", value || "-"));
        meta.appendChild(row);
    });
    card.appendChild(meta);

    card.appendChild(receiptEl("h3", "receipt-heading", "Your selections"));
    const list = receiptEl("div", "receipt-selections");
    receipt.rows.forEach(item => {
        const row = receiptEl("div", "receipt-selection");
        row.appendChild(receiptEl("span", "receipt-position", item.position));
        row.appendChild(receiptEl("strong", "", item.name));
        list.appendChild(row);
    });
    card.appendChild(list);

    card.appendChild(receiptEl(
        "p",
        "receipt-note",
        "This receipt is only shown once. Save it now if you want a copy."
    ));

    const saveButton = receiptEl("button", "vote-button", "Save receipt as image");
    saveButton.type = "button";
    saveButton.addEventListener("click", () => saveReceiptImage(receipt));
    card.appendChild(saveButton);

    return card;
}

function saveReceiptImage(receipt) {
    const width = 800;
    const rowHeight = 84;
    const headerHeight = 170;
    const metaHeight = 250;
    const footerHeight = 90;
    const height = headerHeight + metaHeight + 70 + receipt.rows.length * rowHeight + footerHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const fit = (text, maxWidth) => {
        let out = String(text || "");
        while (out.length > 1 && ctx.measureText(out).width > maxWidth) {
            out = out.slice(0, -2);
            if (ctx.measureText(out + "...").width <= maxWidth) return out + "...";
        }
        return out;
    };

    ctx.fillStyle = "#faf9f5";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#4f8f9a";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 40px Arial";
    ctx.fillText("NUNSA-FUD", width / 2, 78);
    ctx.font = "26px Arial";
    ctx.fillText("Vote receipt", width / 2, 122);

    ctx.textAlign = "left";
    let y = headerHeight + 56;
    const meta = [
        ["Election", receipt.election],
        ["Voter", receipt.matric],
        ["Date and time", formatReceiptTime(receipt.votedAt)]
    ];
    if (receipt.code) meta.push(["Reference", receipt.code]);
    meta.forEach(([label, value]) => {
        ctx.fillStyle = "#6b7678";
        ctx.font = "22px Arial";
        ctx.fillText(label, 50, y);
        ctx.fillStyle = "#1f2a2c";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "right";
        ctx.fillText(fit(value || "-", 480), width - 50, y);
        ctx.textAlign = "left";
        y += 52;
    });

    y = headerHeight + metaHeight + 30;
    ctx.fillStyle = "#4f8f9a";
    ctx.font = "bold 20px Arial";
    ctx.fillText("YOUR SELECTIONS", 50, y);
    y += 24;

    receipt.rows.forEach(item => {
        ctx.strokeStyle = "#e6e3da";
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(width - 50, y);
        ctx.stroke();
        ctx.fillStyle = "#6b7678";
        ctx.font = "20px Arial";
        ctx.fillText(fit(item.position, 700), 50, y + 30);
        ctx.fillStyle = "#1f2a2c";
        ctx.font = "bold 28px Arial";
        ctx.fillText(fit(item.name, 700), 50, y + 64);
        y += rowHeight;
    });

    ctx.fillStyle = "#6b7678";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("NUNSA-FUD Electronic Voting System", width / 2, height - 36);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "vote-receipt" + (receipt.code ? "-" + receipt.code : "") + ".png";
    link.click();
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