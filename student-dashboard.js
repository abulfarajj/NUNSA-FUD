import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./nunsa-client.js";



const CLOUDINARY_CLOUD_NAME = "buwozjy8";
const CLOUDINARY_UPLOAD_PRESET = "nunsa_profile_pictures";

const studentName =
    document.getElementById("student-name");

const profileName =
    document.getElementById("profile-name");

const profileMatric =
    document.getElementById("profile-matric");

const studentLevel = document.getElementById("student-level");
const profileMatricSecondary = document.getElementById("profile-matric-secondary");
const profileLevelSecondary = document.getElementById("profile-level-secondary");
const profileAvatarSecondary = document.getElementById("profile-avatar-secondary");

const profilePicture =
    document.getElementById(
        "student-profile-picture"
    );

const profilePictureInput =
    document.getElementById(
        "profile-picture-input"
    );

const profilePictureMessage =
    document.getElementById(
        "profile-picture-message"
    );

const voterPortalButton =
    document.getElementById(
        "voter-portal-btn"
    );

const logoutButton =
    document.getElementById(
        "student-logout-btn"
    );

const messageSection =
    document.getElementById(
        "student-message-section"
    );

const dashboardMessage =
    document.getElementById(
        "student-dashboard-message"
    );

const DEFAULT_PROFILE =
    "assets/default-profile.jpg";

let currentStudentDocumentId = null;

function showMessage(message) {
    messageSection.style.display = "block";
    dashboardMessage.textContent = message;
}

function showProfilePictureMessage(
    message,
    color
) {
    profilePictureMessage.textContent =
        message;

    profilePictureMessage.style.color =
        color;
}

async function loadStudent() {
    const studentDocumentId =
        sessionStorage.getItem(
            "studentDocumentId"
        );

    const storedMatric =
        sessionStorage.getItem(
            "studentMatricNumber"
        );

    if (
        !studentDocumentId ||
        !storedMatric
    ) {
        await signOut(auth);
        sessionStorage.clear();
        window.location.href =
            "index.html";
        return;
    }

    currentStudentDocumentId =
        studentDocumentId;

    try {
        const studentRef =
            doc(
                db,
                "students",
                studentDocumentId
            );

        const studentSnapshot =
            await getDoc(studentRef);

        if (!studentSnapshot.exists()) {
            await signOut(auth);
            sessionStorage.clear();
            window.location.href =
                "index.html";
            return;
        }

        const studentData =
            studentSnapshot.data();

        if (
            studentData.status &&
            studentData.status !== "active"
        ) {
            showMessage(
                "Your student account is currently inactive."
            );
            return;
        }

        const name =
            studentData.name ||
            sessionStorage.getItem(
                "studentName"
            ) ||
            "Student";

        const matricNumber =
            studentData.matricNumber ||
            storedMatric;

        const image =
            studentData.profilePicture ||
            DEFAULT_PROFILE;

        studentName.textContent =
            name;

        profileName.textContent =
            name;

        profileMatric.textContent = matricNumber;
        if (profileMatricSecondary) profileMatricSecondary.textContent = matricNumber;

        const academicLevel = studentData.academicLevel || studentData.level || studentData.currentLevel || "Not provided";
        if (studentLevel) studentLevel.textContent = academicLevel;
        if (profileLevelSecondary) profileLevelSecondary.textContent = academicLevel;

        profilePicture.src = image;
        if (profileAvatarSecondary) profileAvatarSecondary.src = image;

        profilePicture.onerror = () => { profilePicture.src = DEFAULT_PROFILE; };
        if (profileAvatarSecondary) profileAvatarSecondary.onerror = () => { profileAvatarSecondary.src = DEFAULT_PROFILE; };

    } catch (error) {
        console.error(
            "Load student dashboard error:",
            error
        );

        if (
            error.code ===
            "permission-denied"
        ) {
            showMessage(
                "You do not currently have permission to access your student profile."
            );
        } else {
            showMessage(
                "Unable to load your student profile. Please try again."
            );
        }
    }
}

async function uploadProfilePicture(file) {
    if (!currentStudentDocumentId) {
        showProfilePictureMessage(
            "Student profile is not ready yet.",
            "#c0392b"
        );
        return;
    }

    if (!file) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        showProfilePictureMessage(
            "Please select an image file.",
            "#c0392b"
        );

        profilePictureInput.value = "";
        return;
    }

    const maxSize =
        5 * 1024 * 1024;

    if (file.size > maxSize) {
        showProfilePictureMessage(
            "Image must be 5 MB or smaller.",
            "#c0392b"
        );

        profilePictureInput.value = "";
        return;
    }

    try {
        profilePictureInput.disabled =
            true;

        showProfilePictureMessage(
            "Uploading profile picture...",
            "#4f8f9a"
        );

        const uploadUrl =
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );

        formData.append(
            "upload_preset",
            CLOUDINARY_UPLOAD_PRESET
        );

        const response =
            await fetch(
                uploadUrl,
                {
                    method: "POST",
                    body: formData
                }
            );

        const result =
            await response.json();

        if (!response.ok) {
            console.error(
                "Cloudinary error:",
                result
            );

            throw new Error(
                result.error?.message ||
                "Cloudinary upload failed."
            );
        }

        if (!result.secure_url) {
            throw new Error(
                "Cloudinary did not return an image URL."
            );
        }

        const studentRef =
            doc(
                db,
                "students",
                currentStudentDocumentId
            );

        await updateDoc(
            studentRef,
            {
                profilePicture:
                    result.secure_url
            }
        );

        profilePicture.src = result.secure_url;
        if (profileAvatarSecondary) profileAvatarSecondary.src = result.secure_url;

        showProfilePictureMessage(
            "Profile picture updated successfully.",
            "#4f8f9a"
        );

    } catch (error) {
        console.error(
            "Profile picture upload error:",
            error
        );

        showProfilePictureMessage(
            error.message ||
            "Unable to upload your profile picture. Please try again.",
            "#c0392b"
        );

    } finally {
        profilePictureInput.disabled =
            false;

        profilePictureInput.value =
            "";
    }
}

onAuthStateChanged(
    auth,
    async (user) => {
        if (!user) {
            window.location.href =
                "index.html";
            return;
        }

                await loadStudent();

        loadForms();
    }
);

voterPortalButton.addEventListener(
    "click",
    () => {
        const matricNumber =
            sessionStorage.getItem(
                "studentMatricNumber"
            );

        const studentDocumentId =
            sessionStorage.getItem(
                "studentDocumentId"
            );

        if (
            !matricNumber ||
            !studentDocumentId
        ) {
            window.location.href =
                "index.html";

            return;
        }

        window.location.href =
            "voter-portal.html";
    }
);

profilePictureInput.addEventListener(
    "change",
    async () => {
        const file =
            profilePictureInput.files[0];

        await uploadProfilePicture(file);
    }
);

logoutButton.addEventListener(
    "click",
    async () => {
        try {
            logoutButton.disabled =
                true;

            logoutButton.textContent =
                "LOGGING OUT...";

            sessionStorage.clear();

            await signOut(auth);

            window.location.href =
                "index.html";

        } catch (error) {
            console.error(
                "Student logout error:",
                error
            );

            logoutButton.disabled =
                false;

            logoutButton.textContent =
                "LOG OUT";
        }
    }
);

/* =====================================================
   CANDIDATE APPLICATIONS
   Students apply for a position while applications are open. The admins check
   eligibility in real life and disqualify anyone who does not qualify.
===================================================== */
const formsSection = document.getElementById("forms-section");
const formsOffers = document.getElementById("forms-offers");
const formsApplications = document.getElementById("forms-applications");
const formsFeedback = document.getElementById("forms-feedback");

function formsText(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

function formsSay(text, isError) {
    formsFeedback.textContent = text || "";
    formsFeedback.style.color = isError ? "#b3261e" : "inherit";
}

async function callFormsApi(name, payload) {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/.netlify/functions/" + name, {
        method: payload ? "POST" : "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: payload ? JSON.stringify(payload) : undefined
    });

    let result;
    try {
        result = await response.json();
    } catch {
        result = { success: false, message: "The server returned an invalid response." };
    }

    if (!response.ok || result.success !== true) {
        throw new Error(result.message || "Something went wrong.");
    }
    return result;
}

const APPLICATION_STATUS_TEXT = {
    applied: "You have applied. Your name appears as a candidate unless the admins disqualify you after screening.",
    disqualified: "You were disqualified after screening."
};

function renderFormsApplications(applications) {
    formsApplications.textContent = "";
    applications.forEach(application => {
        const card = document.createElement("div");
        card.className = "forms-card";
        const main = document.createElement("div");
        main.className = "forms-card-main";
        main.appendChild(formsText("h4", `${application.position} - ${application.electionTitle || "Election"}`));
        main.appendChild(formsText("p", APPLICATION_STATUS_TEXT[application.status] || application.status));
        if (application.status === "disqualified" && application.disqualifiedReason) {
            main.appendChild(formsText("p", "Reason: " + application.disqualifiedReason));
        }
        card.appendChild(main);
        formsApplications.appendChild(card);
    });
}

function renderFormsOffers(offers, applications) {
    formsOffers.textContent = "";

    offers.forEach(offer => {
        // One application per election.
        if (applications.some(a => a.electionId === offer.electionId)) return;

        const box = document.createElement("div");
        box.className = "forms-box";
        box.appendChild(formsText("h3", offer.title || "Election"));

        offer.positions.forEach(position => {
            const card = document.createElement("div");
            card.className = "forms-card";
            const main = document.createElement("div");
            main.className = "forms-card-main";
            main.appendChild(formsText("h4", position.position));
            card.appendChild(main);

            const apply = formsText("button", "Apply", "vote-button");
            apply.type = "button";
            apply.addEventListener("click", () => applyForPosition(offer, position, apply));
            card.appendChild(apply);
            box.appendChild(card);
        });

        formsOffers.appendChild(box);
    });
}

async function applyForPosition(offer, position, button) {
    if (!confirm(
        `Apply for ${position.position}?\n\n` +
        "You can only apply for one position in this election. The admins will check that you qualify, and anyone who does not will be disqualified."
    )) {
        return;
    }

    button.disabled = true;
    formsSay("Submitting your application...", false);

    try {
        const result = await callFormsApi("apply-for-position", {
            electionId: offer.electionId,
            positionId: position.id
        });
        formsSay(result.message, false);
        await loadForms();
    } catch (error) {
        formsSay(error.message, true);
        button.disabled = false;
    }
}

async function loadForms() {
    try {
        const data = await callFormsApi("get-form-offers");
        renderFormsApplications(data.applications || []);
        renderFormsOffers(data.offers || [], data.applications || []);

        const hasContent = (data.applications || []).length > 0 || formsOffers.children.length > 0;
        formsSection.hidden = false;
        formsSection.style.display = "block";
        const intro = document.getElementById("forms-intro");
        if (intro) intro.textContent = hasContent ? "Review your applications or apply for an available position." : "Applications are currently closed. New opportunities will appear here when they open.";
        if (location.hash === "#forms-section") formsSection.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (error) {
        console.error("Candidate applications error:", error);
    }
}
