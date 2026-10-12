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
    getDocs
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

let currentAdminData = null;

const adminCount =
    document.getElementById("admin-count");

const adminList =
    document.getElementById("admin-list");

const inviteForm =
    document.getElementById("invite-admin-form");

const inviteMessage =
    document.getElementById("invite-message");

const nameInput =
    document.getElementById("admin-display-name");

const emailInput =
    document.getElementById("admin-email");

const roleInput =
    document.getElementById("admin-role");

const backDashboardBtn =
    document.getElementById("back-dashboard-btn");

backDashboardBtn.addEventListener("click", () => {
    window.location.href = "admin.html";
});

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "admin-login.html";
        return;
    }

    try {

        const adminRef =
            doc(db, "admins", user.uid);

        const adminSnapshot =
            await getDoc(adminRef);

        if (!adminSnapshot.exists()) {

            alert(
                "You are not registered as an administrator."
            );

            await auth.signOut();

            window.location.href =
                "admin-login.html";

            return;
        }

        currentAdminData =
            adminSnapshot.data();

        if (
            currentAdminData.role !== "super_admin" ||
            currentAdminData.active !== true
        ) {

            alert(
                "Only active Super Admins can access Admin Management."
            );

            window.location.href =
                "admin.html";

            return;
        }

        await loadAdmins();

    } catch (error) {

        console.error(
            "Admin verification error:",
            error
        );

        alert(
            "Unable to verify your administrator account."
        );

        window.location.href =
            "admin.html";
    }
});

async function loadAdmins() {

    try {

        const adminsSnapshot =
            await getDocs(
                collection(db, "admins")
            );

        const admins = [];

        adminsSnapshot.forEach((docSnapshot) => {

            admins.push({
                id: docSnapshot.id,
                ...docSnapshot.data()
            });

        });

        const activeAdmins =
            admins.filter(
                admin => admin.active === true
            );

        adminCount.textContent =
            `${activeAdmins.length} / 5 Admins`;

        if (activeAdmins.length === 0) {

            adminList.innerHTML =
                "<p>No administrators found.</p>";

            return;
        }

        activeAdmins.sort((a, b) => {

            if (
                a.role === "super_admin" &&
                b.role !== "super_admin"
            ) {
                return -1;
            }

            if (
                a.role !== "super_admin" &&
                b.role === "super_admin"
            ) {
                return 1;
            }

            return 0;
        });

        adminList.innerHTML =
            activeAdmins.map(
                admin => createAdminCard(admin)
            ).join("");

        document
            .querySelectorAll(".admin-status-btn")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    handleAdminStatusChange
                );
            });

    } catch (error) {

        console.error(
            "Error loading administrators:",
            error
        );

        adminList.innerHTML =
            '<p style="color:red;">Unable to load administrators.</p>';
    }
}

function createAdminCard(admin) {

    const roleLabel =
        admin.role === "super_admin"
            ? "Super Admin"
            : "Regular Admin";

    const statusLabel =
        admin.active === true
            ? "Active"
            : "Inactive";

    const isCurrentUser =
        auth.currentUser &&
        admin.id === auth.currentUser.uid;

    let actionButton = "";

    if (isCurrentUser) {

        actionButton = `
            <p><strong>Current account</strong></p>
        `;

    } else if (
        admin.role === "super_admin"
    ) {

        const currentUserIsFounder =
            currentAdminData &&
            currentAdminData.founder === true;

        const currentUserIsPromoter =
            auth.currentUser &&
            admin.promotedBy === auth.currentUser.uid;

        const canManageSuperAdmin =
            currentUserIsFounder ||
            currentUserIsPromoter;

        if (canManageSuperAdmin) {

            actionButton = `
                <button
                    type="button"
                    class="logout-button admin-status-btn"
                    data-admin-id="${escapeHtml(admin.id)}"
                    data-admin-role="super_admin"
                >
                    Deactivate
                </button>
            `;

        } else {

            actionButton = `
                <p>
                    <strong>Super Admin</strong>
                </p>
            `;
        }

    } else {

        actionButton = `
            <button
                type="button"
                class="logout-button admin-status-btn"
                data-admin-id="${escapeHtml(admin.id)}"
                data-admin-role="admin"
            >
                Deactivate
            </button>
        `;
    }

    return `
        <div
            class="admin-welcome-card"
            style="margin-bottom:15px;"
        >

            <h3>
                ${escapeHtml(
                    admin.name || "Unnamed Admin"
                )}
            </h3>

            <p>
                <strong>Email:</strong>
                ${escapeHtml(
                    admin.email || "No email"
                )}
            </p>

            <p>
                <strong>Role:</strong>
                ${roleLabel}
            </p>

            <p>
                <strong>Status:</strong>
                ${statusLabel}
            </p>

            ${admin.founder === true ? `
                <p>
                    <strong>Authority:</strong>
                    Founder
                </p>
            ` : ""}

            ${actionButton}

        </div>
    `;
}

async function handleAdminStatusChange(event) {

    const button =
        event.currentTarget;

    const adminId =
        button.dataset.adminId;

    const action = "deactivate";

    if (
        auth.currentUser &&
        adminId === auth.currentUser.uid
    ) {

        alert(
            "You cannot change your own administrator status."
        );

        return;
    }

    if (
        !window.confirm(
            "Are you sure you want to deactivate this administrator? " +
            "Their account will be removed and they can only regain access " +
            "through a brand new invitation."
        )
    ) {
        return;
    }

    try {

        button.disabled = true;

        const user =
            auth.currentUser;

        if (!user) {

            alert(
                "Your administrator session has expired. Please log in again."
            );

            window.location.href =
                "admin-login.html";

            return;
        }

        const idToken =
            await user.getIdToken();

        const response =
            await fetch(
                "/.netlify/functions/manage-admin",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        "Authorization":
                            `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        adminId,
                        action
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
                "Unable to change administrator status."
            );
        }

        alert(
            result.message
        );

        await loadAdmins();

    } catch (error) {

        console.error(
            "Administrator status change error:",
            error
        );

        alert(
            error.message ||
            "Unable to change administrator status."
        );

        button.disabled = false;
    }
}

inviteForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    inviteMessage.textContent = "";
    inviteMessage.style.color = "";

    const name =
        nameInput.value.trim();

    const email =
        emailInput.value
            .trim()
            .toLowerCase();

    const role =
        roleInput.value;

    if (!name || !email || !role) {

        inviteMessage.textContent =
            "Please complete all fields.";

        inviteMessage.style.color =
            "red";

        return;
    }

    if (
        role !== "admin" &&
        role !== "super_admin"
    ) {

        inviteMessage.textContent =
            "Please select a valid administrator role.";

        inviteMessage.style.color =
            "red";

        return;
    }

    const user =
        auth.currentUser;

    if (!user) {

        inviteMessage.textContent =
            "Your administrator session has expired. Please log in again.";

        inviteMessage.style.color =
            "red";

        return;
    }

    try {

        inviteMessage.textContent =
            "Sending administrator invitation...";

        inviteMessage.style.color =
            "#4f8f9a";

        const idToken =
            await user.getIdToken();

        const response =
            await fetch(
                "/.netlify/functions/send-admin-invitation",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        "Authorization":
                            `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        role
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
                "Unable to send the administrator invitation."
            );
        }

        inviteMessage.textContent =
            "Invitation sent successfully!";

        inviteMessage.style.color =
            "green";

        inviteForm.reset();

        await loadAdmins();

    } catch (error) {

        console.error(
            "Invitation error:",
            error
        );

        inviteMessage.textContent =
            error.message ||
            "Failed to send administrator invitation.";

        inviteMessage.style.color =
            "red";
    }
});

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}