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
    doc,
    getDoc,
    getDocs,
    query,
    where,
    addDoc,
    deleteDoc,
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

const electionTitle =
    document.getElementById("electionTitle");

const electionDescription =
    document.getElementById("electionDescription");

const candidateFormCard =
    document.getElementById("candidateFormCard");

const draftWarning =
    document.getElementById("draftWarning");

const candidateMatric =
    document.getElementById("candidateMatric");

const lookupStudentBtn =
    document.getElementById("lookupStudentBtn");

const studentResult =
    document.getElementById("studentResult");

const studentName =
    document.getElementById("studentName");

const candidatePosition =
    document.getElementById("candidatePosition");

const addCandidateBtn =
    document.getElementById("addCandidateBtn");

const candidateMessage =
    document.getElementById("candidateMessage");

const candidateList =
    document.getElementById("candidateList");

const backBtn =
    document.getElementById("backBtn");

let currentUser = null;
let currentElection = null;
let selectedStudent = null;

const urlParams =
    new URLSearchParams(window.location.search);

const electionId =
    urlParams.get("id");

function showMessage(message, type = "") {

    if (!candidateMessage) {
        return;
    }

    candidateMessage.textContent = message;

    candidateMessage.className = "message";

    if (type) {
        candidateMessage.classList.add(type);
    }
}

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getFriendlyError(error) {

    console.error(error);

    if (!error) {
        return "An unknown error occurred.";
    }

    if (error.code === "permission-denied") {
        return "You do not have permission to perform this action.";
    }

    if (error.code === "unavailable") {
        return "Firebase is temporarily unavailable. Check your internet connection.";
    }

    if (error.code === "failed-precondition") {
        return "Firebase requires an additional database configuration or index.";
    }

    return error.message ||
        "Something went wrong.";
}

function clearStudentSelection() {

    selectedStudent = null;

    if (studentResult) {
        studentResult.style.display = "none";
    }

    if (studentName) {
        studentName.textContent = "";
    }

    if (addCandidateBtn) {
        addCandidateBtn.disabled = true;
    }
}

function showPageError(message) {

    if (electionTitle) {
        electionTitle.textContent =
            "Unable to load";
    }

    if (electionDescription) {
        electionDescription.textContent =
            message;
    }

    if (candidateFormCard) {
        candidateFormCard.style.display =
            "none";
    }

    if (candidateList) {

        candidateList.innerHTML = `

            <div class="empty">

                Unable to load candidates.

                <br><br>

                ${escapeHtml(message)}

            </div>

        `;
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

            currentUser = user;

            const adminRef =
                doc(
                    db,
                    "admins",
                    user.uid
                );

            const adminSnap =
                await getDoc(adminRef);

            if (!adminSnap.exists()) {

                alert(
                    "Access denied. You are not an administrator."
                );

                window.location.href =
                    "admin-login.html";

                return;
            }

            const adminData =
                adminSnap.data();

            if (adminData.active !== true) {

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
                    "Access denied."
                );

                window.location.href =
                    "admin-login.html";

                return;
            }

            if (!electionId) {
            window.location.replace("elections.html?next=candidates.html");
            showPageError(
                    "No election was selected."
                );

                return;
            }

            await loadElection();

            await loadCandidates();

        } catch (error) {

            console.error(
                "Initialization error:",
                error
            );

            showPageError(
                "Initialization error: " +
                getFriendlyError(error)
            );
        }
    }
);

async function loadElection() {

    const electionRef =
        doc(
            db,
            "elections",
            electionId
        );

    const electionSnap =
        await getDoc(electionRef);

    if (!electionSnap.exists()) {

        throw new Error(
            "The selected election does not exist."
        );
    }

    currentElection = {

        id: electionSnap.id,

        ...electionSnap.data()

    };

    if (electionTitle) {

        electionTitle.textContent =
            currentElection.title ||
            "NUNSA-FUD Election";
    }

    if (electionDescription) {

        electionDescription.textContent =
            currentElection.description ||
            "Manage candidates for this election.";
    }

    const status =
        getElectionStatus(
            currentElection
        );

    if (status !== "draft") {

        if (candidateFormCard) {
            candidateFormCard.style.display =
                "none";
        }

        if (draftWarning) {

            draftWarning.style.display =
                "block";

            draftWarning.textContent =
                "Candidates can only be added while this election is in Draft status.";
        }

    } else {

        if (candidateFormCard) {

            candidateFormCard.style.display =
                "block";
        }

        if (draftWarning) {

            draftWarning.style.display =
                "none";
        }
    }
}

function getElectionStatus(election) {

    const now =
        new Date();

    let status =
        election.status ||
        "draft";

    if (status === "published") {

        const start =
            election.startAt?.toDate
                ? election.startAt.toDate()
                : election.startAt
                    ? new Date(
                        election.startAt
                    )
                    : null;

        const end =
            election.endAt?.toDate
                ? election.endAt.toDate()
                : election.endAt
                    ? new Date(
                        election.endAt
                    )
                    : null;

        if (
            end &&
            now >= end
        ) {
            return "ended";
        }

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

        return "upcoming";
    }

    if (status === "ended") {
        return "ended";
    }

    if (status === "active") {
        return "active";
    }

    if (status === "upcoming") {
        return "upcoming";
    }

    return "draft";
}

function lookupStudent() {

    return performStudentLookup();
}

async function performStudentLookup() {

    const matric =
        candidateMatric?.value.trim();

    if (!matric) {

        showMessage(
            "Enter the student's matriculation number first.",
            "error"
        );

        return;
    }

    clearStudentSelection();

    lookupStudentBtn.disabled =
        true;

    lookupStudentBtn.textContent =
        "LOOKING UP...";

    showMessage(
        "Searching for student...",
        "info"
    );

    try {

        let studentSnapshot =
            await getDocs(

                query(

                    collection(
                        db,
                        "students"
                    ),

                    where(
                        "matricNumber",
                        "==",
                        matric
                    )
                )
            );

        if (
            studentSnapshot.empty
        ) {

            studentSnapshot =
                await getDocs(

                    query(

                        collection(
                            db,
                            "students"
                        ),

                        where(
                            "registrationNumber",
                            "==",
                            matric
                        )
                    )
                );
        }

        if (
            studentSnapshot.empty
        ) {

            showMessage(
                "No student was found with that matriculation number.",
                "error"
            );

            return;
        }

        const studentDoc =
            studentSnapshot.docs[0];

        const data =
            studentDoc.data();

        selectedStudent = {

            id:
                studentDoc.id,

            matricNumber:
                data.matricNumber ||
                data.registrationNumber ||
                matric,

            name:
                data.name ||
                "Unnamed Student",

            profilePicture:
                data.profilePicture ||
                ""

        };

        if (studentName) {

            studentName.textContent =
                selectedStudent.name;
        }

        if (studentResult) {

            studentResult.style.display =
                "block";
        }

        if (addCandidateBtn) {

            addCandidateBtn.disabled =
                true;
        }

        showMessage(
            "Student found successfully.",
            "success"
        );

    } catch (error) {

        console.error(
            "Student lookup error:",
            error
        );

        showMessage(
            "Student lookup failed: " +
            getFriendlyError(error),
            "error"
        );

    } finally {

        lookupStudentBtn.disabled =
            false;

        lookupStudentBtn.textContent =
            "LOOK UP STUDENT";
    }
}

async function addCandidate() {

    if (!currentElection) {

        showMessage(
            "Election information has not loaded yet.",
            "error"
        );

        return;
    }

    const status =
        getElectionStatus(
            currentElection
        );

    if (status !== "draft") {

        showMessage(
            "Candidates can only be added while the election is in Draft status.",
            "error"
        );

        return;
    }

    if (!selectedStudent) {

        showMessage(
            "Look up a student before adding the candidate.",
            "error"
        );

        return;
    }

    const position =
        candidatePosition?.value.trim();

    if (!position) {

        showMessage(
            "Enter the position the student is contesting.",
            "error"
        );

        return;
    }

    addCandidateBtn.disabled =
        true;

    addCandidateBtn.textContent =
        "ADDING...";

    showMessage(
        "Checking candidate...",
        "info"
    );

    try {

        const candidatesQuery =
            query(

                collection(
                    db,
                    "candidates"
                ),

                where(
                    "electionId",
                    "==",
                    electionId
                )
            );

        const existingSnapshot =
            await getDocs(
                candidatesQuery
            );

        const duplicate =
            existingSnapshot.docs.some(
                candidateDoc => {

                    const candidate =
                        candidateDoc.data();

                    const sameStudent =
                        candidate.matricNumber ===
                        selectedStudent.matricNumber;

                    const samePosition =
                        String(
                            candidate.position ||
                            ""
                        ).trim().toLowerCase() ===
                        position.toLowerCase();

                    return (
                        sameStudent &&
                        samePosition
                    );
                }
            );

        if (duplicate) {

            showMessage(
                "This student has already been added for this position.",
                "error"
            );

            return;
        }

        const profilePicture =
            selectedStudent.profilePicture ||
            "assets/default-profile.jpg";

        await addDoc(

            collection(
                db,
                "candidates"
            ),

            {

                electionId:
                    electionId,

                matricNumber:
                    selectedStudent.matricNumber,

                name:
                    selectedStudent.name,

                profilePicture:
                    profilePicture,

                position:
                    position,

                status:
                    "active",

                voteCount:
                    0,

                createdBy:
                    currentUser.uid,

                createdAt:
                    serverTimestamp()
            }
        );

        showMessage(
            "Candidate added successfully.",
            "success"
        );

        if (candidateMatric) {

            candidateMatric.value =
                "";
        }

        if (candidatePosition) {

            candidatePosition.value =
                "";
        }

        clearStudentSelection();

        await loadCandidates();

    } catch (error) {

        console.error(
            "Add candidate error:",
            error
        );

        showMessage(
            "Could not add candidate: " +
            getFriendlyError(error),
            "error"
        );

    } finally {

        addCandidateBtn.disabled =
            !selectedStudent;

        addCandidateBtn.textContent =
            "ADD CANDIDATE";
    }
}

async function loadCandidates() {

    if (!candidateList) {
        return;
    }

    candidateList.innerHTML = `

        <div class="empty">

            Loading candidates...

        </div>

    `;

    try {

        const candidatesQuery =
            query(

                collection(
                    db,
                    "candidates"
                ),

                where(
                    "electionId",
                    "==",
                    electionId
                )
            );

        const snapshot =
            await getDocs(
                candidatesQuery
            );

        if (snapshot.empty) {

            candidateList.innerHTML = `

                <div class="empty">

                    No candidates have been
                    added to this election.

                </div>

            `;

            return;
        }

        const candidates =
            snapshot.docs.map(
                candidateDoc => ({

                    id:
                        candidateDoc.id,

                    ...candidateDoc.data()

                })
            );

        candidates.sort(
            (a, b) => {

                const positionA =
                    String(
                        a.position || ""
                    ).toLowerCase();

                const positionB =
                    String(
                        b.position || ""
                    ).toLowerCase();

                if (
                    positionA <
                    positionB
                ) {
                    return -1;
                }

                if (
                    positionA >
                    positionB
                ) {
                    return 1;
                }

                return String(
                    a.name || ""
                ).localeCompare(
                    String(
                        b.name || ""
                    )
                );
            }
        );

        candidateList.innerHTML =
            "";

        candidates.forEach(
            candidate => {

                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "candidate-card";

                const image =
                    candidate.profilePicture ||
                    candidate.image ||
                    "assets/default-profile.jpg";

                card.innerHTML = `

                    <img
                        src="${escapeHtml(image)}"
                        alt="${escapeHtml(
                            candidate.name ||
                            "Candidate"
                        )}"
                    >

                    <div
                        class="candidate-details"
                    >

                        <h4>
                            ${escapeHtml(
                                candidate.name ||
                                "Unnamed Candidate"
                            )}
                        </h4>

                        <p>
                            ${escapeHtml(
                                candidate.matricNumber ||
                                "No matric number"
                            )}
                        </p>

                        <span
                            class="position-badge"
                        >
                                                        ${escapeHtml(
                                candidate.position ||
                                "No position"
                            )}
                        </span>
                        ${
                            candidate.status === "disqualified"
                                ? `<span class="position-badge" style="background:#b3261e;color:#fff;margin-left:6px;">DISQUALIFIED - not on ballot</span>`
                                : ""
                        }
                    </div>

                    ${
                        currentElection &&
                        currentElection.status === "draft"
                            ? `
                                <button
                                    type="button"
                                    class="remove-candidate-btn"
                                    data-candidate-id="${escapeHtml(candidate.id)}"
                                    data-candidate-name="${escapeHtml(candidate.name || "this candidate")}"
                                >
                                    REMOVE
                                </button>
                            `
                            : ""
                    }

                `;

                const imageElement =
                    card.querySelector(
                        "img"
                    );

                if (imageElement) {

                    imageElement.onerror =
                        () => {

                            imageElement.src =
                                "assets/default-profile.jpg";
                        };
                }

                const removeButton =
                    card.querySelector(
                        ".remove-candidate-btn"
                    );

                if (removeButton) {

                    removeButton.addEventListener(
                        "click",
                        () => handleRemoveCandidate(
                            removeButton.dataset.candidateId,
                            removeButton.dataset.candidateName
                        )
                    );
                }

                candidateList.appendChild(
                    card
                );
            }
        );

    } catch (error) {

        console.error(
            "Load candidates error:",
            error
        );

        candidateList.innerHTML = `

            <div class="empty">

                Could not load candidates.

                <br><br>

                ${escapeHtml(
                    getFriendlyError(error)
                )}

            </div>

        `;
    }
}

async function handleRemoveCandidate(
    candidateId,
    candidateName
) {

    if (!candidateId) {
        return;
    }

    if (
        !currentElection ||
        currentElection.status !== "draft"
    ) {

        alert(
            "Candidates can only be removed while the election is still in Draft status."
        );

        return;
    }

    const confirmed =
        window.confirm(
            `Remove ${candidateName} from this election? This cannot be undone.`
        );

    if (!confirmed) {
        return;
    }

    try {

        await deleteDoc(
            doc(
                db,
                "candidates",
                candidateId
            )
        );

        await loadCandidates();

    } catch (error) {

        console.error(
            "Remove candidate error:",
            error
        );

        alert(
            getFriendlyError(error) ||
            "Unable to remove this candidate."
        );
    }
}

if (lookupStudentBtn) {

    lookupStudentBtn.addEventListener(
        "click",
        lookupStudent
    );
}

if (candidateMatric) {

    candidateMatric.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                lookupStudent();
            }
        }
    );
}

if (addCandidateBtn) {

    addCandidateBtn.addEventListener(
        "click",
        addCandidate
    );
}

if (candidatePosition) {

    candidatePosition.addEventListener(
        "input",
        () => {

            if (
                !selectedStudent
            ) {

                addCandidateBtn.disabled =
                    true;

                return;
            }

            addCandidateBtn.disabled =
                candidatePosition.value.trim()
                    .length === 0;
        }
    );
}

if (backBtn) {

    backBtn.addEventListener(
        "click",
        () => {

            window.history.back();

        }
    );
}