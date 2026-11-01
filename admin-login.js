import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    signOut
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

const loginForm = document.getElementById("admin-login-form");
const emailInput = document.getElementById("admin-email");
const passwordInput = document.getElementById("admin-password");
const loginMessage = document.getElementById("login-message");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        loginMessage.textContent = "Please enter your email and password.";
        return;
    }

    const loginButton = loginForm.querySelector("button[type='submit']");
    loginButton.disabled = true;
    loginButton.textContent = "PLEASE WAIT...";
    loginMessage.textContent = "Signing in...";

    try {
        const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        const user = userCredential.user;

        const adminRef = doc(db, "admins", user.uid);
        const adminSnapshot = await getDoc(adminRef);

        if (!adminSnapshot.exists()) {
            await signOut(auth);
            loginMessage.textContent = "This account is not registered as an administrator.";
            loginButton.disabled = false;
            loginButton.textContent = "LOGIN";
            return;
        }

        const adminData = adminSnapshot.data();

        if (adminData.active !== true) {
            await signOut(auth);
            loginMessage.textContent = "This administrator account is inactive.";
            loginButton.disabled = false;
            loginButton.textContent = "LOGIN";
            return;
        }

        if (
            adminData.role !== "admin" &&
            adminData.role !== "super_admin"
        ) {
            await signOut(auth);
            loginMessage.textContent = "This account does not have administrator access.";
            loginButton.disabled = false;
            loginButton.textContent = "LOGIN";
            return;
        }

        loginMessage.textContent = "Login successful. Opening dashboard...";

        setTimeout(() => {
            window.location.href = (function(d){try{var n=localStorage.getItem("nunsaNext");if(n&&/^\/(a\/[A-Za-z0-9_-]+|announcements\.html(\?id=[A-Za-z0-9_-]+)?|candidate\.html\?electionId=[A-Za-z0-9_-]+&id=[A-Za-z0-9_-]+|candidate-directory\.html\?electionId=[A-Za-z0-9_-]+|results\.html\?id=[A-Za-z0-9_-]+|student-receipts\.html|student-results\.html|voter-portal\.html|voting\.html\?electionId=[A-Za-z0-9_-]+)$/.test(n)){localStorage.removeItem("nunsaNext");return n;}}catch(e){}return d;})("admin.html");
        }, 400);

    } catch (error) {
        console.error("Admin login error:", error);

        if (
            error.code === "auth/invalid-credential" ||
            error.code === "auth/wrong-password" ||
            error.code === "auth/user-not-found"
        ) {
            loginMessage.textContent = "Invalid email or password.";
        } else if (error.code === "auth/invalid-email") {
            loginMessage.textContent = "Please enter a valid email address.";
        } else {
            loginMessage.textContent = "Unable to sign in. Please try again.";
        }

        loginButton.disabled = false;
        loginButton.textContent = "LOGIN";
    }
});
