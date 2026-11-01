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
    addDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


/* =====================================================
   FIREBASE CONFIG
===================================================== */

const firebaseConfig = {
    apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0",
    authDomain: "nunsa-voting-app.firebaseapp.com",
    projectId: "nunsa-voting-app",
    storageBucket: "nunsa-voting-app.firebasestorage.app",
    messagingSenderId: "1069853481069",
    appId: "1:1069853481069:web:63ebcca28764",
    measurementId: "G-EMYNQR6T0F"
};

/* =====================================================
   INITIALIZE FIREBASE
===================================================== */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdminRole = "";


/* =====================================================
   ELEMENTS
===================================================== */

const backDashboardBtn =
    document.getElementById("back-dashboard-btn");

const createElectionForm =
    document.getElementById("create-election-form");

const electionTitle =
    document.getElementById("election-title");

const electionDescription =
    document.getElementById("election-description");

const electionStart =
    document.getElementById("election-start");

const electionEnd =
    document.getElementById("election-end");
const electionTermEnd =
    document.getElementById("election-term-end");

const electionMessage =
    document.getElementById("election-message");

const electionList =
    document.getElementById("election-list");


/* =====================================================
   DASHBOARD BUTTON
===================================================== */

if (backDashboardBtn) {

    backDashboardBtn.addEventListener(
        "click",
        () => {
            window.location.href = "admin.html";
        }
    );

}


/* =====================================================
   AUTHENTICATION
===================================================== */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href = "index.html";
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
                await getDoc(adminRef);

            if (!adminSnapshot.exists()) {

                alert(
                    "Admin account not found."
                );

                window.location.href =
                    "index.html";

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
                    "index.html";

                return;

            }

                        currentAdminRole =
                adminData.role;

            await loadElections();
        } catch (error) {
            console.error(
                "Admin verification error:",
                error
            );

            electionList.innerHTML = `
                <div class="admin-welcome-card">
                    <h3>Authentication Error</h3>
                    <p>
                        Unable to verify administrator account.
                    </p>
                </div>
            `;

        }

    }
);


/* =====================================================
   CREATE ELECTION
===================================================== */

createElectionForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const user =
            auth.currentUser;

        if (!user) {

            electionMessage.textContent =
                "You must be logged in.";

            electionMessage.style.color =
                "#c0392b";

            return;

        }

        const title =
            electionTitle.value.trim();

        const description =
            electionDescription.value.trim();

        const start =
            electionStart.value;

        const end =
            electionEnd.value;
        const termEnd =
            electionTermEnd?.value || "";

        if (
            !title ||
            !description ||
            !start ||
            !end
        ) {

            electionMessage.textContent =
                "Please complete all fields.";

            electionMessage.style.color =
                "#c0392b";

            return;

        }

        const startDate =
            new Date(start);

        const endDate =
            new Date(end);
        const termEndDate = termEnd ? new Date(termEnd) : null;

        if (
            isNaN(startDate.getTime()) ||
            isNaN(endDate.getTime()) ||
            (termEndDate && isNaN(termEndDate.getTime()))
        ) {

            electionMessage.textContent =
                "Please enter valid dates.";

            electionMessage.style.color =
                "#c0392b";

            return;

        }

        if (
            endDate <= startDate
        ) {

            electionMessage.textContent =
                "The end date and time must be after the start date and time.";

            electionMessage.style.color =
                "#c0392b";

            return;

        }

        if (termEndDate && termEndDate <= endDate) {
            electionMessage.textContent = "The tenure end must be after the voting end date.";
            electionMessage.style.color = "#c0392b";
            return;
        }

        try {

            electionMessage.textContent =
                "Creating election...";

            electionMessage.style.color =
                "#4f8f9a";

            const electionRef =
                await addDoc(
                    collection(
                        db,
                        "elections"
                    ),
                    {

                        title:
                            title,

                        description:
                            description,

                        startAt:
                            startDate,

                        endAt:
                            endDate,

                        ...(termEndDate ? { termEndsAt: termEndDate } : {}),

                        status:
                            "draft",

                        createdBy:
                            user.uid,

                        createdByEmail:
                            user.email,

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()

                    }
                );

            console.log(
                "Election created:",
                electionRef.id
            );

            electionMessage.textContent =
                "Election created successfully!";

            electionMessage.style.color =
                "#4f8f9a";

            createElectionForm.reset();

            await loadElections();

        } catch (error) {

            console.error(
                "Create election error:",
                error
            );

            electionMessage.textContent =
                error.code === "permission-denied"
                    ? "Permission denied. Firestore rules may need to allow election management."
                    : "Unable to create election. Please try again.";

            electionMessage.style.color =
                "#c0392b";

        }

    }
);


/* =====================================================
   LOAD ELECTIONS
===================================================== */

async function loadElections() {

    try {

        electionList.innerHTML =
            "<p>Loading elections...</p>";

        const snapshot =
            await getDocs(
                collection(
                    db,
                    "elections"
                )
            );

        if (snapshot.empty) {

            electionList.innerHTML = `
                <div class="admin-welcome-card">
                    <h3>No Elections Yet</h3>
                    <p>
                        Create your first election using the form above.
                    </p>
                </div>
            `;

            return;

        }

        const elections = [];

        snapshot.forEach(
            (documentSnapshot) => {

                elections.push({

                    id:
                        documentSnapshot.id,

                    ...documentSnapshot.data()

                });

            }
        );

        elections.sort(
            (a, b) => {

                const aTime =
                    a.createdAt?.toMillis?.() || 0;

                const bTime =
                    b.createdAt?.toMillis?.() || 0;

                return bTime - aTime;

            }
        );

        electionList.innerHTML = "";

        elections.forEach(
            (election) => {

                electionList.appendChild(
                    createElectionCard(
                        election
                    )
                );

            }
        );

    } catch (error) {

        console.error(
            "Load elections error:",
            error
        );

        electionList.innerHTML = `
            <div class="admin-welcome-card">
                <h3>Unable to Load Elections</h3>
                <p>
                    ${escapeHtml(
                        error.message ||
                        "Please try again."
                    )}
                </p>
            </div>
        `;

    }

}

/* =====================================================
   CREATE ELECTION CARD
===================================================== */

function createElectionCard(election) {

    const card =
        document.createElement("div");

    card.className =
        "admin-welcome-card";

    const startText =
        formatDate(election.startAt);

    const endText =
        formatDate(election.endAt);

    const status =
        election.status || "draft";


    card.innerHTML = `

        <h3>
            ${escapeHtml(
                election.title ||
                "Untitled Election"
            )}
        </h3>

        <p>
            ${escapeHtml(
                election.description ||
                "No description provided."
            )}
        </p>

        <p>
            <strong>Start:</strong>
            ${startText}
        </p>

        <p>
            <strong>End:</strong>
            ${endText}
        </p>

        <p>
            <strong>Status:</strong>

            <span class="role-badge">
                ${escapeHtml(status)}
            </span>
        </p>

        <div
            style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                margin-top:15px;
            "
        >

            <button
                type="button"
                class="login-button manage-election-btn"
            >
                MANAGE
            </button>

            <button
                type="button"
                class="login-button edit-election-btn"
            >
                EDIT
            </button>

        </div>
    `;


    /* ---------------------------------------------
       MANAGE BUTTON
    --------------------------------------------- */

    const manageBtn =
        card.querySelector(
            ".manage-election-btn"
        );


    manageBtn.addEventListener(
        "click",
        () => {

            const nextPage = new URLSearchParams(window.location.search).get("next");
            const target = ["candidates.html", "voters.html"].includes(nextPage) ? nextPage : "manage-election.html";
            window.location.href = `${target}?id=${encodeURIComponent(election.id)}`;

        }
    );


    /* ---------------------------------------------
       EDIT BUTTON
    --------------------------------------------- */

    const editBtn =
        card.querySelector(
            ".edit-election-btn"
        );


        editBtn.addEventListener(
        "click",
        () => {
            editElection(election);
        }
    );

    /* ---------------------------------------------
       DELETE BUTTON (Super Admin only; the server checks too)
    --------------------------------------------- */
    if (currentAdminRole === "super_admin") {
        const deleteBtn =
            document.createElement(
                "button"
            );

        deleteBtn.type =
            "button";

        deleteBtn.className =
            "login-button delete-election-btn";

        deleteBtn.textContent =
            "DELETE";

        deleteBtn.addEventListener(
            "click",
            () => {
                deleteElection(
                    election,
                    deleteBtn
                );
            }
        );

        editBtn.parentElement.appendChild(
            deleteBtn
        );
    }

    return card;
}


/* =====================================================
   DELETE ELECTION (Super Admin) - for elections made or
   published by mistake. Refused if any vote was cast.
===================================================== */
async function deleteElection(
    election,
    button
) {
    const answer =
        prompt(
            "Delete this election?\n\n" +
            "This removes its candidates, applications, voter list and positions. " +
            "It is refused if anyone has already voted.\n\n" +
            "Type the election title to confirm:\n" +
            (election.title || "")
        );

    if (answer === null) {
        return;
    }

    button.disabled = true;

    try {
        const token =
            await auth.currentUser.getIdToken();

        const response =
            await fetch(
                "/.netlify/functions/delete-election",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        "Authorization":
                            "Bearer " + token
                    },
                    body: JSON.stringify({
                        electionId:
                            election.id,
                        confirmTitle:
                            answer
                    })
                }
            );

        let result;

        try {
            result =
                await response.json();
        } catch {
            result = {
                success: false,
                message:
                    "The server returned an invalid response."
            };
        }

        if (
            !response.ok ||
            result.success !== true
        ) {
            throw new Error(
                result.message ||
                "Unable to delete this election."
            );
        }

        alert(result.message);

        await loadElections();
    } catch (error) {
        alert(
            error.message ||
            "Unable to delete this election."
        );

        button.disabled = false;
    }
}

/* =====================================================
   EDIT ELECTION
===================================================== */

async function editElection(election) {

    /* ---------------------------------------------
       ONLY DRAFT ELECTIONS CAN BE EDITED
    --------------------------------------------- */

    if (
        election.status !== "draft"
    ) {

        alert(
            "Only draft elections can be edited."
        );

        return;
    }


    /* ---------------------------------------------
       TITLE
    --------------------------------------------- */

    const newTitle =
        prompt(
            "Enter the new election title:",
            election.title || ""
        );


    if (
        newTitle === null
    ) {
        return;
    }


    const cleanedTitle =
        newTitle.trim();


    if (
        !cleanedTitle
    ) {

        alert(
            "Election title cannot be empty."
        );

        return;
    }


    /* ---------------------------------------------
       DESCRIPTION
    --------------------------------------------- */

    const newDescription =
        prompt(
            "Enter the new election description:",
            election.description || ""
        );


    if (
        newDescription === null
    ) {
        return;
    }


    const cleanedDescription =
        newDescription.trim();


    if (
        !cleanedDescription
    ) {

        alert(
            "Election description cannot be empty."
        );

        return;
    }


    /* ---------------------------------------------
       CURRENT DATES
    --------------------------------------------- */

    const currentStart =
        getDate(election.startAt);

    const currentEnd =
        getDate(election.endAt);


    /* ---------------------------------------------
       START DATE
    --------------------------------------------- */

    const newStart =
        prompt(
            "Enter the new start date and time.\n\nFormat:\nYYYY-MM-DD HH:MM",
            formatDateForInput(currentStart)
        );


    if (
        newStart === null
    ) {
        return;
    }


    /* ---------------------------------------------
       END DATE
    --------------------------------------------- */

    const newEnd =
        prompt(
            "Enter the new end date and time.\n\nFormat:\nYYYY-MM-DD HH:MM",
            formatDateForInput(currentEnd)
        );


    if (
        newEnd === null
    ) {
        return;
    }


    /* ---------------------------------------------
       CONVERT DATES
    --------------------------------------------- */

    const newTermEnd = prompt(
        "Enter the elected officers' tenure end date and time. Leave blank if it has not been determined.\n\nFormat:\nYYYY-MM-DD HH:MM",
        formatDateForInput(getDate(election.termEndsAt))
    );
    if (newTermEnd === null) return;

    const startDate =
        parseDateInput(newStart);

    const endDate =
        parseDateInput(newEnd);

    const termEndDate = newTermEnd.trim() ? parseDateInput(newTermEnd) : null;

    if (newTermEnd.trim() && !termEndDate) {
        alert("Invalid tenure end date. Use YYYY-MM-DD HH:MM, or leave it blank.");
        return;
    }

    if (termEndDate && endDate && termEndDate <= endDate) {
        alert("The officers' tenure must end after the voting period ends.");
        return;
    }

    if (
        !startDate ||
        !endDate
    ) {

        alert(
            "Invalid date format.\n\nUse:\nYYYY-MM-DD HH:MM"
        );

        return;
    }


    /* ---------------------------------------------
       VALIDATE DATE ORDER
    --------------------------------------------- */

    if (
        endDate <= startDate
    ) {

        alert(
            "The end date and time must be after the start date and time."
        );

        return;
    }


    /* ---------------------------------------------
       CONFIRM
    --------------------------------------------- */

    const confirmed =
        window.confirm(
            "Save these election changes?"
        );


    if (
        !confirmed
    ) {
        return;
    }


    /* ---------------------------------------------
       UPDATE FIRESTORE
    --------------------------------------------- */

    try {

        await updateDoc(
            doc(
                db,
                "elections",
                election.id
            ),
            {

                title:
                    cleanedTitle,

                description:
                    cleanedDescription,

                startAt:
                    startDate,

                endAt:
                    endDate,

                termEndsAt:
                    termEndDate || null,

                updatedAt:
                    serverTimestamp()

            }
        );


        alert(
            "Election updated successfully."
        );


        await loadElections();


    } catch (error) {

        console.error(
            "Edit election error:",
            error
        );


        if (
            error.code ===
            "permission-denied"
        ) {

            alert(
                "Permission denied. Firestore rules may not allow election updates."
            );

        } else {

            alert(
                "Unable to update election. Please try again."
            );

        }

    }
}


/* =====================================================
   GET DATE
===================================================== */

function getDate(value) {

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


/* =====================================================
   FORMAT DATE FOR EDIT
===================================================== */

function formatDateForInput(date) {

    if (!date) {
        return "";
    }


    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    const hours =
        String(
            date.getHours()
        ).padStart(2, "0");

    const minutes =
        String(
            date.getMinutes()
        ).padStart(2, "0");


    return (
        `${year}-${month}-${day} ${hours}:${minutes}`
    );
}


/* =====================================================
   PARSE DATE INPUT
===================================================== */

function parseDateInput(value) {

    if (!value) {
        return null;
    }


    const cleaned =
        value.trim().replace("T", " ");


    const match =
        cleaned.match(
            /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/
        );


    if (!match) {
        return null;
    }


    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    const day =
        Number(match[3]);

    const hours =
        Number(match[4]);

    const minutes =
        Number(match[5]);


    const date =
        new Date(
            year,
            month - 1,
            day,
            hours,
            minutes,
            0,
            0
        );


    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hours ||
        date.getMinutes() !== minutes
    ) {

        return null;
    }


    return date;
}


/* =====================================================
   FORMAT DATE
===================================================== */

function formatDate(timestamp) {

    if (!timestamp) {
        return "Not set";
    }


    try {

        const date =
            timestamp.toDate
                ? timestamp.toDate()
                : new Date(timestamp);


        if (
            isNaN(
                date.getTime()
            )
        ) {

            return "Invalid date";
        }


        return date.toLocaleString();


    } catch {

        return "Invalid date";
    }
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );
}
