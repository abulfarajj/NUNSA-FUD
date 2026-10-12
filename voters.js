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
    setDoc,
    serverTimestamp,
    writeBatch
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

const electionTitle = document.getElementById("election-title");
const electionDescription = document.getElementById("election-description");
const electionStatus = document.getElementById("election-status");
const addVoterBtn = document.getElementById("add-voter-btn");
const addVoterSection = document.getElementById("add-voter-section");
const voterForm = document.getElementById("voter-form");
const voterMatricInput = document.getElementById("voter-matric");
const cancelAddVoterBtn = document.getElementById("cancel-add-voter");
const voterMessage = document.getElementById("voter-message");

const importVotersBtn = document.getElementById("import-voters-btn");
const importSection = document.getElementById("import-section");
const voterFileInput = document.getElementById("voter-file");
const previewImportBtn = document.getElementById("preview-import-btn");
const cancelImportBtn = document.getElementById("cancel-import-btn");
const importMessage = document.getElementById("import-message");
const importPreview = document.getElementById("import-preview");
const importSummary = document.getElementById("import-summary");
const importPreviewBody = document.getElementById("import-preview-body");
const confirmImportBtn = document.getElementById("confirm-import-btn");
const clearImportBtn = document.getElementById("clear-import-btn");

const voterList = document.getElementById("voter-list");
const voterCount = document.getElementById("voter-count");
const backBtn = document.getElementById("back-btn");

let currentAdminData = null;
let currentElectionId = null;
let currentElection = null;
let importedVoters = [];

function normalizeMatric(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function voterDocumentId(electionId, matricNumber) {
    return electionId + "_" + normalizeMatric(matricNumber).replace(/[^A-Z0-9]/g, "");
}

async function checkAdmin(user) {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnapshot = await getDoc(adminRef);

    if (!adminSnapshot.exists()) {
        throw new Error("Admin record not found.");
    }

    const adminData = adminSnapshot.data();

    if (adminData.active !== true) {
        throw new Error("Admin account is inactive.");
    }

    if (adminData.role !== "super_admin") {
        throw new Error("Only a Super Admin can manage voters.");
    }

    currentAdminData = adminData;
}

async function loadElection() {
    const params = new URLSearchParams(window.location.search);
    currentElectionId = params.get("id");

    if (!currentElectionId) {
        throw new Error("Election ID is missing.");
    }

    const electionRef = doc(db, "elections", currentElectionId);
    const electionSnapshot = await getDoc(electionRef);

    if (!electionSnapshot.exists()) {
        throw new Error("Election not found.");
    }

    currentElection = electionSnapshot.data();

    electionTitle.textContent = currentElection.title || "Election";
    electionDescription.textContent = currentElection.description || "";

    electionStatus.textContent =
        currentElection.status === "published"
            ? "Published"
            : currentElection.status || "Draft";
}

async function loadVoters() {
    voterList.innerHTML = "<p>Loading voters...</p>";

    const votersQuery = query(
        collection(db, "voters"),
        where("electionId", "==", currentElectionId)
    );

    const snapshot = await getDocs(votersQuery);

    voterList.innerHTML = "";

    if (snapshot.empty) {
        voterList.innerHTML = "<p>No eligible voters have been added yet.</p>";
        voterCount.textContent = "0";
        return;
    }

    const voters = [];

    snapshot.forEach((voterDoc) => {
        voters.push({
            id: voterDoc.id,
            ...voterDoc.data()
        });
    });

    voters.sort((a, b) =>
        String(a.matricNumber || "").localeCompare(
            String(b.matricNumber || "")
        )
    );

    voterCount.textContent = String(voters.length);

    voters.forEach((voter) => {
        const item = document.createElement("div");
        item.className = "voter-item";

        const matric = document.createElement("strong");
        matric.textContent = voter.matricNumber || "";

        const status = document.createElement("span");
        status.textContent = voter.status || "active";

        item.appendChild(matric);
        item.appendChild(status);

        voterList.appendChild(item);
    });
}

addVoterBtn.addEventListener("click", () => {
    importSection.style.display = "none";
    addVoterSection.style.display = "block";
    voterMessage.textContent = "";
});

cancelAddVoterBtn.addEventListener("click", () => {
    addVoterSection.style.display = "none";
    voterForm.reset();
    voterMessage.textContent = "";
});

voterForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    voterMessage.textContent = "";

    const matricNumber = normalizeMatric(voterMatricInput.value);

    if (!matricNumber) {
        voterMessage.textContent = "Enter a matric number.";
        return;
    }

    try {
        const studentQuery = query(
            collection(db, "students"),
            where("matricNumber", "==", matricNumber)
        );

        const studentSnapshot = await getDocs(studentQuery);

        if (studentSnapshot.empty) {
            voterMessage.textContent =
                "This matric number does not exist in the student list.";
            return;
        }

        const voterId = voterDocumentId(
            currentElectionId,
            matricNumber
        );

        const voterRef = doc(db, "voters", voterId);
        const existingVoter = await getDoc(voterRef);

        if (existingVoter.exists()) {
            voterMessage.textContent =
                "This student is already an eligible voter for this election.";
            return;
        }

        await setDoc(voterRef, {
            electionId: currentElectionId,
            matricNumber,
            status: "active",
            createdBy: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });

        voterForm.reset();
        voterMessage.textContent = "Voter added successfully.";

        await loadVoters();

    } catch (error) {
        console.error(error);
        voterMessage.textContent =
            error.message || "Failed to add voter.";
    }
});

importVotersBtn.addEventListener("click", () => {
    addVoterSection.style.display = "none";
    importSection.style.display = "block";
    importMessage.textContent = "";
    importPreview.style.display = "none";
    importedVoters = [];
});

cancelImportBtn.addEventListener("click", () => {
    importSection.style.display = "none";
    importPreview.style.display = "none";
    voterFileInput.value = "";
    importedVoters = [];
    importMessage.textContent = "";
});

clearImportBtn.addEventListener("click", () => {
    importPreview.style.display = "none";
    voterFileInput.value = "";
    importedVoters = [];
    importMessage.textContent = "";
});

previewImportBtn.addEventListener("click", async () => {
    const file = voterFileInput.files[0];

    if (!file) {
        importMessage.textContent = "Select a file first.";
        return;
    }

    importMessage.textContent = "Reading file...";

    try {
        const data = await file.arrayBuffer();

        const workbook = XLSX.read(data, {
            type: "array"
        });

        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
            throw new Error("No worksheet found.");
        }

        const worksheet = workbook.Sheets[firstSheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: ""
        });

        const matricValues = [];

        rows.forEach((row) => {
            const keys = Object.keys(row);

            let value = "";

            for (const key of keys) {
                const normalizedKey = String(key)
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, "");

                if (
                    normalizedKey === "matricnumber" ||
                    normalizedKey === "matricno" ||
                    normalizedKey === "matric" ||
                    normalizedKey === "matricnumber."
                ) {
                    value = row[key];
                    break;
                }
            }

            if (!value && keys.length > 0) {
                value = row[keys[0]];
            }

            const matric = normalizeMatric(value);

            if (matric) {
                matricValues.push(matric);
            }
        });

        const uniqueMatricNumbers = [...new Set(matricValues)];

        if (uniqueMatricNumbers.length === 0) {
            throw new Error("No matric numbers were found in the file.");
        }

        const existingVotersQuery = query(
            collection(db, "voters"),
            where("electionId", "==", currentElectionId)
        );

        const existingSnapshot = await getDocs(existingVotersQuery);

        const existingMatricNumbers = new Set();

        existingSnapshot.forEach((voterDoc) => {
            const data = voterDoc.data();

            if (data.matricNumber) {
                existingMatricNumbers.add(
                    normalizeMatric(data.matricNumber)
                );
            }
        });

        importedVoters = uniqueMatricNumbers.filter(
            (matric) => !existingMatricNumbers.has(matric)
        );

        importPreviewBody.innerHTML = "";

        importedVoters.forEach((matric, index) => {
            const row = document.createElement("tr");

            const numberCell = document.createElement("td");
            numberCell.textContent = String(index + 1);

            const matricCell = document.createElement("td");
            matricCell.textContent = matric;

            const statusCell = document.createElement("td");
            statusCell.textContent = "New";

            row.appendChild(numberCell);
            row.appendChild(matricCell);
            row.appendChild(statusCell);

            importPreviewBody.appendChild(row);
        });

        importPreview.style.display = "block";

        importSummary.textContent =
            `${importedVoters.length} new voter(s) ready to import ` +
            `(${uniqueMatricNumbers.length - importedVoters.length} already on the list, skipped).`;

        importMessage.textContent = "";

    } catch (error) {
        console.error(error);
        importMessage.textContent =
            error.message || "Failed to read the file.";
    }
});

confirmImportBtn.addEventListener("click", async () => {
    if (importedVoters.length === 0) {
        importMessage.textContent = "There are no voters to import.";
        return;
    }

    confirmImportBtn.disabled = true;
    importMessage.textContent = "Importing voters...";

    try {
        for (let i = 0; i < importedVoters.length; i += 200) {
            const batch = writeBatch(db);

            const chunk = importedVoters.slice(i, i + 200);

            chunk.forEach((matricNumber) => {
                const voterId = voterDocumentId(
                    currentElectionId,
                    matricNumber
                );

                const voterRef = doc(db, "voters", voterId);

                batch.set(voterRef, {
                    electionId: currentElectionId,
                    matricNumber,
                    status: "active",
                    createdBy: auth.currentUser.uid,
                    createdAt: serverTimestamp()
                });
            });

            await batch.commit();
        }

        importMessage.textContent =
            `${importedVoters.length} voter(s) imported successfully.`;

        importedVoters = [];
        voterFileInput.value = "";
        importPreview.style.display = "none";

        await loadVoters();

    } catch (error) {
        console.error(error);
        importMessage.textContent =
            error.message || "Failed to import voters.";
    } finally {
        confirmImportBtn.disabled = false;
    }
});

backBtn.addEventListener("click", () => {
    window.location.href = currentElectionId
        ? `manage-election.html?id=${encodeURIComponent(currentElectionId)}`
        : "admin.html";
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "admin-login.html";
        return;
    }

    try {
        await checkAdmin(user);
        await loadElection();
        await loadVoters();
    } catch (error) {
        console.error(error);
        alert(error.message || "Access denied.");
        window.location.href = "admin.html";
    }
});