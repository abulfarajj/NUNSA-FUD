import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    updateDoc
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

const CLOUDINARY_CLOUD_NAME = "buwozjy8";
const CLOUDINARY_UPLOAD_PRESET = "nunsa_profile_pictures";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const studentName =
    document.getElementById("student-name");

const profileName =
    document.getElementById("profile-name");

const profileMatric =
    document.getElementById("profile-matric");

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

        profileMatric.textContent =
            matricNumber;

        profilePicture.src =
            image;

        profilePicture.onerror =
            () => {
                profilePicture.src =
                    DEFAULT_PROFILE;
            };

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

        profilePicture.src =
            result.secure_url;

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