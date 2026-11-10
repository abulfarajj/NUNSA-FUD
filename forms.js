import { kebab } from "./row-menu.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
    collection, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0", authDomain: "nunsa-voting-app.firebaseapp.com", projectId: "nunsa-voting-app", storageBucket: "nunsa-voting-app.firebasestorage.app", messagingSenderId: "1069853481069", appId: "1:1069853481069:web:63ebcca28764", measurementId: "G-EMYNQR6T0F" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const electionSelect = $("form-election");
const workspace = $("forms-workspace");
const messageBox = $("forms-message");
const salesStatus = $("sales-status");
const toggleSalesBtn = $("toggle-sales-btn");
const positionTitle = $("position-form-title");
const positionName = $("position-name");
const positionActive = $("position-active");
const savePositionBtn = $("save-position-btn");
const cancelEditBtn = $("cancel-edit-btn");
const positionList = $("position-list");
const applicantList = $("applicant-list");
const moneySummary = $("money-summary");

let currentElectionId = "";
let currentElection = null;
let positions = [];
let applications = [];
let electionPhase = "unknown";
let editingPositionId = "";

function toMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

async function getElectionApplications(electionId) {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/.netlify/functions/get-election-applications?electionId=${encodeURIComponent(electionId)}`, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("The server returned an invalid application status response."); }
    if (!response.ok || !data.success) throw new Error(data.message || "Unable to load applications.");
    return data;
}

function say(text, isError) {
    messageBox.textContent = text || "";
    messageBox.style.color = isError ? "#b3261e" : "inherit";
}

function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

async function callFunction(name, payload) {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/.netlify/functions/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(payload)
    });
    let result;
    try { result = await response.json(); } catch { result = { success: false, message: "The server returned an invalid response." }; }
    if (!response.ok || result.success !== true) throw new Error(result.message || "Request failed.");
    return result;
}

function resetPositionForm() {
    editingPositionId = "";
    positionTitle.textContent = "Add a position";
    positionName.value = "";
        positionActive.checked = true;
    cancelEditBtn.style.display = "none";
    savePositionBtn.textContent = "SAVE POSITION";
}

/* ---------- loading ---------- */
async function loadElections() {
    const snapshot = await getDocs(collection(db, "elections"));
    const elections = snapshot.docs.map(electionDoc => ({ id: electionDoc.id, ...electionDoc.data() }))
        .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt) || toMs(b.startAt) - toMs(a.startAt));
    electionSelect.textContent = "";
    electionSelect.appendChild(new Option(elections.length ? "Choose an election" : "No elections found", ""));
    elections.forEach(election => {
        const stored = election.status === "draft" ? "Draft" : election.status === "ended" ? "Ended" : election.status === "published" ? "Published" : election.status || "Unknown";
        electionSelect.appendChild(new Option(`${election.title || election.id} · ${stored}`, election.id));
    });
}

async function loadElection() {
    const electionSnap = await getDoc(doc(db, "elections", currentElectionId));
    currentElection = electionSnap.exists() ? { id: currentElectionId, ...electionSnap.data() } : null;
    if (!currentElection) throw new Error("Election not found.");

    const [positionSnap, applicationData] = await Promise.all([
        getDocs(query(collection(db, "formPositions"), where("electionId", "==", currentElectionId))),
        getElectionApplications(currentElectionId)
    ]);
    positions = positionSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.position).localeCompare(String(b.position)));
    applications = applicationData.applications || [];
    electionPhase = applicationData.electionPhase || "unknown";
    render();
}

/* ---------- rendering ---------- */
function render() {
    const isDraft = currentElection && currentElection.status === "draft";
    const open = isDraft && currentElection.formsOpen === true;
    const phaseLabels = {
        draft: "Draft",
        applications_open: "Applications open",
        screening: "Screening",
        voting_published: "Voting published — candidates are on the ballot",
        voting_open: "Voting open",
        voting_ended: "Voting ended — awaiting results finalization",
        results_finalized: "Results finalized",
        archived: "Historical election",
        invalid_schedule: "Invalid election schedule",
        unavailable: "Election unavailable"
    };
    salesStatus.textContent = isDraft
        ? (open ? "Applications are OPEN. Students can see the positions on their dashboard." : "Applications are CLOSED. Screening decisions can still be made before publication.")
        : `${phaseLabels[electionPhase] || "Election status unavailable"}. This election is read-only here; its application and candidate outcomes are shown below.`;
    toggleSalesBtn.textContent = open ? "CLOSE APPLICATIONS" : "OPEN APPLICATIONS";
    toggleSalesBtn.style.display = isDraft ? "" : "none";
    const editor = document.getElementById("position-editor-section");
    if (editor) editor.hidden = !isDraft;

    positionList.textContent = "";
    if (!positions.length) positionList.appendChild(el("p", "No positions yet."));
    positions.forEach(position => {
        const card = el("div", "", "forms-card");
        const info = el("div", "", "forms-card-main");
        info.appendChild(el("h4", position.position));
        info.appendChild(el("p", position.active ? "Open for applications" : "Not open for applications"));
        const applied = applications.filter(a => a.positionId === position.id).length;
        info.appendChild(el("p", `${applied} applicant(s)`));
        card.appendChild(info);

        if (isDraft) {
            card.appendChild(kebab(`Options for ${position.position}`, [
                { label: "Edit", onClick: () => startEdit(position) },
                { label: "Delete", danger: true, onClick: () => removePosition(position) }
            ]));
        }
        positionList.appendChild(card);
    });

    renderApplicants();
}

function renderApplicants() {
    applicantList.textContent = "";
    const eligible = applications.filter(a => a.candidateEligible && a.storedStatus !== "disqualified").length;
    const disqualified = applications.filter(a => a.storedStatus === "disqualified").length;
    const screening = applications.filter(a => ["applied", "screening"].includes(a.status)).length;
    moneySummary.textContent = currentElection?.status === "draft"
        ? `${applications.length} applicant(s) · ${screening} awaiting screening · ${disqualified} disqualified`
        : `${applications.length} applicant(s) · ${eligible} ballot candidate(s) · ${disqualified} disqualified`;

    if (!applications.length) {
        applicantList.appendChild(el("p", "No applicants have been recorded for this election."));
        return;
    }

    applications.forEach(application => {
        const card = el("div", "", "forms-card");
        const info = el("div", "", "forms-card-main");
        info.appendChild(el("h4", application.studentName || "Unnamed student"));
        info.appendChild(el("p", `${application.matricNumber} · ${application.position}`));
        const state = el("p", application.statusLabel || "Status unavailable", "forms-status forms-status-" + (application.status || "unknown"));
        info.appendChild(state);
        if (application.statusMessage) info.appendChild(el("p", application.statusMessage));
        if (application.status === "disqualified" && application.disqualifiedReason) {
            info.appendChild(el("p", "Reason: " + application.disqualifiedReason));
        }
        card.appendChild(info);

        if (currentElection?.status === "draft" && application.storedStatus === "applied") {
            card.appendChild(kebab(`Options for ${application.studentName || "this applicant"}`, [
                { label: "Disqualify", danger: true, onClick: (item) => review(application, "disqualify", item) }
            ]));
        } else if (currentElection?.status === "draft" && application.storedStatus === "disqualified") {
            card.appendChild(kebab(`Options for ${application.studentName || "this applicant"}`, [
                { label: "Reinstate", onClick: (item) => review(application, "reinstate", item) }
            ]));
        }
        applicantList.appendChild(card);
    });
}

/* ---------- actions ---------- */
async function review(application, action, button) {
    let reason = "";
    if (action === "disqualify") {
        const answer = prompt(`Disqualify ${application.studentName} from ${application.position}?\n\nReason (shown to the student):`, "");
        if (answer === null) return;
        reason = answer.trim();
        if (!reason) { alert("Please give a reason."); return; }
    } else if (!confirm(`Reinstate ${application.studentName} for ${application.position}?`)) {
        return;
    }

    button.disabled = true;
    try {
        const result = await callFunction("review-application", { applicationId: application.id, action, reason });
        say(result.message, false);
        await loadElection();
    } catch (error) {
        alert(error.message);
        button.disabled = false;
    }
}

function startEdit(position) {
    if (!currentElection || currentElection.status !== "draft") return;
    editingPositionId = position.id;
    positionTitle.textContent = "Edit position";
    positionName.value = position.position || "";
    positionActive.checked = position.active === true;
    cancelEditBtn.style.display = "inline-block";
    savePositionBtn.textContent = "UPDATE POSITION";
    positionName.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function removePosition(position) {
    if (!currentElection || currentElection.status !== "draft") return;
    if (applications.some(a => a.positionId === position.id)) {
        alert("Students have already applied for this position, so it cannot be deleted. You can close it to new applications instead (Edit, untick Open for applications).");
        return;
    }
    if (!confirm(`Delete the ${position.position} position?`)) return;
    try {
        await deleteDoc(doc(db, "formPositions", position.id));
        if (editingPositionId === position.id) resetPositionForm();
        await loadElection();
    } catch (error) {
        alert(error.message || "Unable to delete this position.");
    }
}

savePositionBtn.addEventListener("click", async () => {
    if (!currentElection || currentElection.status !== "draft") {
        say("Positions can only be edited while the election is a draft.", true);
        return;
    }
    const name = positionName.value.trim();

    if (!name) { say("Enter the position name.", true); return; }
    const duplicate = positions.some(p => p.id !== editingPositionId && String(p.position).toLowerCase() === name.toLowerCase());
    if (duplicate) { say("This position is already listed.", true); return; }

    const data = { electionId: currentElectionId, position: name, active: positionActive.checked };

    savePositionBtn.disabled = true;
    try {
        if (editingPositionId) {
            await setDoc(doc(db, "formPositions", editingPositionId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
        } else {
            await addDoc(collection(db, "formPositions"), { ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
        }
        say(editingPositionId ? "Position updated." : "Position added.", false);
        resetPositionForm();
        await loadElection();
    } catch (error) {
        say(error.message || "Unable to save the position.", true);
    } finally {
        savePositionBtn.disabled = false;
    }
});

cancelEditBtn.addEventListener("click", resetPositionForm);

toggleSalesBtn.addEventListener("click", async () => {
    if (!currentElection || currentElection.status !== "draft") {
        say("Applications can only be changed while the election is a draft.", true);
        return;
    }
    const open = currentElection.formsOpen === true;
    if (!open && !positions.some(p => p.active)) {
        say("Add at least one position that is open for applications first.", true);
        return;
    }
    toggleSalesBtn.disabled = true;
    try {
        await updateDoc(doc(db, "elections", currentElectionId), { formsOpen: !open });
        await loadElection();
        say(open ? "Applications closed." : "Applications are now open.", false);
    } catch (error) {
        say(error.message || "Unable to change applications.", true);
    } finally {
        toggleSalesBtn.disabled = false;
    }
});

electionSelect.addEventListener("change", async () => {
    currentElectionId = electionSelect.value;
    resetPositionForm();
    say("");
    if (!currentElectionId) { workspace.style.display = "none"; return; }
    workspace.style.display = "block";
    try { await loadElection(); } catch (error) { say(error.message || "Unable to load this election.", true); }
});

$("back-dashboard-btn").addEventListener("click", () => { window.location.href = "admin.html"; });

onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = "admin-login.html"; return; }
    try {
        const adminSnap = await getDoc(doc(db, "admins", user.uid));
        const data = adminSnap.exists() ? adminSnap.data() : null;
        if (!data || data.active !== true || !["admin", "super_admin"].includes(data.role)) {
            window.location.href = "admin-login.html";
            return;
        }
        await loadElections();
    } catch (error) {
        say(error.message || "Administrator access could not be verified.", true);
    }
});
