import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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

const authChoice = document.getElementById("auth-choice");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");

const loginForm = document.getElementById("login-form");
const loginMatric = document.getElementById("login-matric");
const loginPinGroup = document.getElementById("login-pin-group");
const loginSubmitBtn = document.getElementById("login-submit-btn");
const loginMessage = document.getElementById("login-message");

const signupForm = document.getElementById("signup-form");
const signupMatric = document.getElementById("signup-matric");
const signupEmail = document.getElementById("signup-email");
const signupCodeSection = document.getElementById("signup-code-section");
const signupCodeGroup = document.getElementById("signup-code-group");
const signupPinSection = document.getElementById("signup-pin-section");
const signupPinGroup = document.getElementById("signup-pin-group");
const signupConfirmPinGroup = document.getElementById("signup-confirm-pin-group");
const signupSubmitBtn = document.getElementById("signup-submit-btn");
const signupMessage = document.getElementById("signup-message");

const forgotPinBtn = document.getElementById("forgot-pin-btn");

const forgotPinForm = document.getElementById("forgot-pin-form");
const resetMatric = document.getElementById("reset-matric");
const resetCodeSection = document.getElementById("reset-code-section");
const resetCodeGroup = document.getElementById("reset-code-group");
const resetPinSection = document.getElementById("reset-pin-section");
const resetPinGroup = document.getElementById("reset-pin-group");
const resetConfirmPinGroup = document.getElementById("reset-confirm-pin-group");
const resetPinSubmitBtn = document.getElementById("reset-pin-submit-btn");
const resetPinMessage = document.getElementById("reset-pin-message");

const backToChoiceFromLogin = document.getElementById("back-to-choice-from-login");
const backToChoiceFromSignup = document.getElementById("back-to-choice-from-signup");
const backToLoginFromForgot = document.getElementById("back-to-login-from-forgot");

const adminAccessButton = document.getElementById("admin-access-btn");

let signupVerificationStarted = false;
let signupEmailVerified = false;
let resetCodeSent = false;
let resetCodeVerified = false;

function normalizeMatric(value) {
    return String(value || "").trim().toUpperCase();
}

function getDigits(group) {
    if (!group) {
        return "";
    }

    return Array.from(group.querySelectorAll(".pin-box"))
        .map(input => input.value)
        .join("");
}

function clearDigits(group) {
    if (!group) {
        return;
    }

    group.querySelectorAll(".pin-box").forEach(input => {
        input.value = "";
        input.disabled = false;
    });
}

function focusFirstDigit(group) {
    if (!group) {
        return;
    }

    const first = group.querySelector(".pin-box");

    if (first) {
        first.focus();
    }
}

function setupDigitInputs(group) {
    if (!group) {
        return;
    }

    const inputs = Array.from(group.querySelectorAll(".pin-box"));

    inputs.forEach((input, index) => {
        input.addEventListener("input", () => {
            input.value = input.value
                .replace(/\D/g, "")
                .slice(0, 1);

            if (input.value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener("keydown", event => {
            if (
                event.key === "Backspace" &&
                !input.value &&
                index > 0
            ) {
                inputs[index - 1].focus();
                inputs[index - 1].value = "";
            }

            if (
                event.key === "ArrowLeft" &&
                index > 0
            ) {
                event.preventDefault();
                inputs[index - 1].focus();
            }

            if (
                event.key === "ArrowRight" &&
                index < inputs.length - 1
            ) {
                event.preventDefault();
                inputs[index + 1].focus();
            }
        });

        input.addEventListener("paste", event => {
            event.preventDefault();

            const pasted = (event.clipboardData || window.clipboardData)
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, inputs.length);

            pasted.split("").forEach((digit, digitIndex) => {
                inputs[digitIndex].value = digit;
            });

            const nextIndex = Math.min(
                pasted.length,
                inputs.length - 1
            );

            inputs[nextIndex].focus();
        });
    });
}

function hideAllStudentForms() {
    authChoice.style.display = "none";
    loginForm.style.display = "none";
    signupForm.style.display = "none";
    forgotPinForm.style.display = "none";
}

function showChoice() {
    authChoice.style.display = "flex";
    loginForm.style.display = "none";
    signupForm.style.display = "none";
    forgotPinForm.style.display = "none";

    loginMessage.textContent = "";
    signupMessage.textContent = "";
    resetPinMessage.textContent = "";
}

function showLogin() {
    hideAllStudentForms();

    loginForm.style.display = "block";
    loginMessage.textContent = "";

    clearDigits(loginPinGroup);

    loginMatric.focus();
}

function showSignup() {
    hideAllStudentForms();

    signupForm.style.display = "block";
    signupMessage.textContent = "";

    signupVerificationStarted = false;
    signupEmailVerified = false;

    signupCodeSection.style.display = "none";
    signupPinSection.style.display = "none";

    signupSubmitBtn.disabled = false;
    signupSubmitBtn.textContent = "CONTINUE";

    signupMatric.disabled = false;
    signupEmail.disabled = false;

    clearDigits(signupCodeGroup);
    clearDigits(signupPinGroup);
    clearDigits(signupConfirmPinGroup);

    signupMatric.focus();
}

function showForgotPin() {
    hideAllStudentForms();

    forgotPinForm.style.display = "block";
    resetPinMessage.textContent = "";

    resetCodeSent = false;
    resetCodeVerified = false;

    resetCodeSection.style.display = "none";
    resetPinSection.style.display = "none";

    resetPinSubmitBtn.disabled = false;
    resetPinSubmitBtn.textContent = "SEND RECOVERY CODE";
    resetPinSubmitBtn.type = "submit";
    resetPinSubmitBtn.onclick = null;

    resetMatric.disabled = false;

    clearDigits(resetCodeGroup);
    clearDigits(resetPinGroup);
    clearDigits(resetConfirmPinGroup);

    const matric = normalizeMatric(loginMatric.value);

    resetMatric.value = matric;

    resetMatric.focus();
}

function setLoginLoading(loading) {
    loginSubmitBtn.disabled = loading;
    loginSubmitBtn.textContent = loading
        ? "PLEASE WAIT..."
        : "LOGIN";
}

function setSignupLoading(loading) {
    signupSubmitBtn.disabled = loading;

    if (!loading) {
        if (!signupVerificationStarted) {
            signupSubmitBtn.textContent = "CONTINUE";
        } else if (!signupEmailVerified) {
            signupSubmitBtn.textContent = "VERIFY EMAIL";
        } else {
            signupSubmitBtn.textContent = "CREATE PIN";
        }
    } else {
        signupSubmitBtn.textContent = "PLEASE WAIT...";
    }
}

async function callFunction(functionName, data) {
    const response = await fetch(
        `/.netlify/functions/${functionName}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }
    );

    let result;

    try {
        result = await response.json();
    } catch {
        result = {
            success: false,
            message: "The server returned an invalid response."
        };
    }

    if (!response.ok || result.success !== true) {
        const error = new Error(
            result.message || "Request failed."
        );

        error.status = response.status;
        error.accountExists = result.accountExists === true;

        throw error;
    }

    return result;
}

async function openStudentDashboard(result) {
    if (result.customToken) {
        await signInWithCustomToken(
            auth,
            result.customToken
        );
    }

    sessionStorage.setItem(
        "studentMatricNumber",
        result.matricNumber ||
        normalizeMatric(
            loginMatric.value ||
            signupMatric.value
        )
    );

    sessionStorage.setItem(
        "studentDocumentId",
        result.studentDocumentId || ""
    );

    sessionStorage.setItem(
        "studentAuthUid",
        auth.currentUser
            ? auth.currentUser.uid
            : ""
    );

    sessionStorage.setItem(
        "studentName",
        result.studentName || ""
    );

    sessionStorage.setItem(
        "studentProfilePicture",
        result.profilePicture || ""
    );

    window.location.href = (function(d){try{var n=localStorage.getItem("nunsaNext");if(n&&/^\/(a\/[A-Za-z0-9_-]+|announcements\.html(\?id=[A-Za-z0-9_-]+)?|candidate\.html\?electionId=[A-Za-z0-9_-]+&id=[A-Za-z0-9_-]+|candidate-directory\.html\?electionId=[A-Za-z0-9_-]+|results\.html\?id=[A-Za-z0-9_-]+|student-receipts\.html|student-results\.html|voter-portal\.html|voting\.html\?electionId=[A-Za-z0-9_-]+)$/.test(n)){localStorage.removeItem("nunsaNext");return n;}}catch(e){}return d;})("student-dashboard.html");
}

loginBtn.addEventListener("click", () => {
    showLogin();
});

signupBtn.addEventListener("click", () => {
    showSignup();
});

backToChoiceFromLogin.addEventListener("click", () => {
    showChoice();
});

backToChoiceFromSignup.addEventListener("click", () => {
    showChoice();
});

signupForm.addEventListener("submit", async event => {
    event.preventDefault();

    const matricNumber = normalizeMatric(
        signupMatric.value
    );

    const email = String(
        signupEmail.value || ""
    )
        .trim()
        .toLowerCase();

    if (!matricNumber) {
        signupMessage.textContent =
            "Please enter your registration number.";
        return;
    }

    if (!email) {
        signupMessage.textContent =
            "Please enter your email address.";
        return;
    }

    if (!signupVerificationStarted) {
        setSignupLoading(true);

        signupMessage.textContent =
            "Checking your student record...";

        try {
            await callFunction(
                "send-verification-code",
                {
                    matricNumber,
                    email
                }
            );

            signupVerificationStarted = true;

            signupCodeSection.style.display = "block";
            signupPinSection.style.display = "none";

            signupSubmitBtn.textContent =
                "VERIFY EMAIL";

            signupMessage.textContent =
                "A 6-digit verification code has been sent to your email.";

            focusFirstDigit(signupCodeGroup);
        } catch (error) {
            signupMessage.textContent =
                error.message ||
                "Unable to send verification code.";
        } finally {
            setSignupLoading(false);
        }

        return;
    }

    if (!signupEmailVerified) {
        const code = getDigits(
            signupCodeGroup
        );

        if (!/^\d{6}$/.test(code)) {
            signupMessage.textContent =
                "Please enter the 6-digit verification code.";
            return;
        }

        setSignupLoading(true);

        signupMessage.textContent =
            "Verifying your email...";

        try {
            await callFunction(
                "verify-email-code",
                {
                    matricNumber,
                    email,
                    code
                }
            );

            signupEmailVerified = true;

            signupPinSection.style.display =
                "block";

            signupCodeGroup
                .querySelectorAll(".pin-box")
                .forEach(input => {
                    input.disabled = true;
                });

            signupMatric.disabled = true;
            signupEmail.disabled = true;

            signupSubmitBtn.textContent =
                "CREATE PIN";

            signupMessage.textContent =
                "Email verified. Create your 4-digit PIN.";

            focusFirstDigit(signupPinGroup);
        } catch (error) {
            signupMessage.textContent =
                error.message ||
                "Unable to verify your email.";
        } finally {
            setSignupLoading(false);
        }

        return;
    }

    const pin = getDigits(
        signupPinGroup
    );

    const confirmPin = getDigits(
        signupConfirmPinGroup
    );

    if (!/^\d{4}$/.test(pin)) {
        signupMessage.textContent =
            "Please enter your 4-digit PIN.";
        return;
    }

    if (!/^\d{4}$/.test(confirmPin)) {
        signupMessage.textContent =
            "Please confirm your 4-digit PIN.";
        return;
    }

    if (pin !== confirmPin) {
        signupMessage.textContent =
            "PINs do not match.";
        return;
    }

    setSignupLoading(true);

    signupMessage.textContent =
        "Creating your student account...";

    try {
        const result = await callFunction(
            "complete-student-signup",
            {
                matricNumber,
                email,
                pin
            }
        );

        signupMessage.textContent =
            "Account created successfully. Opening your dashboard...";

        await openStudentDashboard(result);
    } catch (error) {
        if (error.accountExists) {
            signupMessage.textContent =
                "An account already exists. Please LOGIN or RESET PIN instead.";
        } else {
            signupMessage.textContent =
                error.message ||
                "Unable to create your student account.";
        }

        setSignupLoading(false);
    }
});

loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const matricNumber = normalizeMatric(
        loginMatric.value
    );

    const pin = getDigits(
        loginPinGroup
    );

    if (!matricNumber) {
        loginMessage.textContent =
            "Please enter your registration number.";
        return;
    }

    if (!/^\d{4}$/.test(pin)) {
        loginMessage.textContent =
            "Please enter your 4-digit PIN.";
        return;
    }

    setLoginLoading(true);

    loginMessage.textContent =
        "Signing you in...";

    try {
        const result = await callFunction(
            "student-login",
            {
                matricNumber,
                pin
            }
        );

        loginMessage.textContent =
            "Login successful. Opening your dashboard...";

        await openStudentDashboard(result);
    } catch (error) {
        loginMessage.textContent =
            error.message ||
            "Unable to log you in.";

        setLoginLoading(false);
    }
});

forgotPinBtn.addEventListener("click", () => {
    showForgotPin();
});

backToLoginFromForgot.addEventListener("click", () => {
    showLogin();
});

forgotPinForm.addEventListener("submit", async event => {
    event.preventDefault();

    const matricNumber = normalizeMatric(
        resetMatric.value
    );

    if (!matricNumber) {
        resetPinMessage.textContent =
            "Please enter your registration number.";
        return;
    }

    if (!resetCodeSent) {
        resetPinSubmitBtn.disabled = true;
        resetPinSubmitBtn.textContent =
            "PLEASE WAIT...";

        resetPinMessage.textContent =
            "Sending your PIN recovery code...";

        try {
            await callFunction(
                "send-pin-reset-code",
                {
                    matricNumber
                }
            );

            resetCodeSent = true;

            resetCodeSection.style.display =
                "block";

            resetPinSection.style.display =
                "none";

            resetPinSubmitBtn.disabled =
                false;

            resetPinSubmitBtn.textContent =
                "VERIFY CODE";

            resetPinMessage.textContent =
                "A 6-digit recovery code has been sent to the email address you used when creating your account.";

            focusFirstDigit(resetCodeGroup);
        } catch (error) {
            resetPinSubmitBtn.disabled =
                false;

            resetPinSubmitBtn.textContent =
                "SEND RECOVERY CODE";

            resetPinMessage.textContent =
                error.message ||
                "Unable to send your PIN recovery code.";
        }

        return;
    }

    if (!resetCodeVerified) {
        const code = getDigits(
            resetCodeGroup
        );

        if (!/^\d{6}$/.test(code)) {
            resetPinMessage.textContent =
                "Please enter the 6-digit recovery code.";
            return;
        }

        resetPinSubmitBtn.disabled = true;
        resetPinSubmitBtn.textContent =
            "VERIFYING...";

        resetPinMessage.textContent =
            "Verifying your recovery code...";

        try {
            await callFunction(
                "verify-pin-reset-code",
                {
                    matricNumber,
                    code
                }
            );

            resetCodeVerified = true;

            resetCodeGroup
                .querySelectorAll(".pin-box")
                .forEach(input => {
                    input.disabled = true;
                });

            resetMatric.disabled = true;

            resetPinSection.style.display =
                "block";

            resetPinSubmitBtn.disabled =
                false;

            resetPinSubmitBtn.textContent =
                "RESET PIN";

            resetPinMessage.textContent =
                "Recovery code verified. Create your new 4-digit PIN.";

            focusFirstDigit(resetPinGroup);
        } catch (error) {
            resetPinSubmitBtn.disabled =
                false;

            resetPinSubmitBtn.textContent =
                "VERIFY CODE";

            resetPinMessage.textContent =
                error.message ||
                "Unable to verify your recovery code.";
        }

        return;
    }

    const code = getDigits(
        resetCodeGroup
    );

    const newPin = getDigits(
        resetPinGroup
    );

    const confirmPin = getDigits(
        resetConfirmPinGroup
    );

    if (!/^\d{6}$/.test(code)) {
        resetPinMessage.textContent =
            "Please enter the 6-digit recovery code.";
        return;
    }

    if (!/^\d{4}$/.test(newPin)) {
        resetPinMessage.textContent =
            "Please enter your new 4-digit PIN.";
        return;
    }

    if (!/^\d{4}$/.test(confirmPin)) {
        resetPinMessage.textContent =
            "Please confirm your new 4-digit PIN.";
        return;
    }

    if (newPin !== confirmPin) {
        resetPinMessage.textContent =
            "PINs do not match.";
        return;
    }

    resetPinSubmitBtn.disabled = true;
    resetPinSubmitBtn.textContent =
        "RESETTING...";

    resetPinMessage.textContent =
        "Resetting your PIN...";

    try {
        await callFunction(
            "reset-student-pin",
            {
                matricNumber,
                code,
                newPin
            }
        );

        clearDigits(resetCodeGroup);
        clearDigits(resetPinGroup);
        clearDigits(resetConfirmPinGroup);

        resetPinMessage.textContent =
            "Your PIN has been reset successfully. You can now log in with your new PIN.";

        resetPinSubmitBtn.disabled = false;
        resetPinSubmitBtn.textContent =
            "BACK TO LOGIN";

        resetPinSubmitBtn.type = "button";

        resetPinSubmitBtn.onclick = () => {
            resetPinSubmitBtn.type = "submit";
            resetPinSubmitBtn.onclick = null;
            showLogin();
        };
    } catch (error) {
        resetPinSubmitBtn.disabled =
            false;

        resetPinSubmitBtn.textContent =
            "RESET PIN";

        resetPinMessage.textContent =
            error.message ||
            "Unable to reset your PIN.";
    }
});

if (adminAccessButton) {
    adminAccessButton.addEventListener(
        "click",
        () => {
            window.location.href =
                "admin-login.html";
        }
    );
}

setupDigitInputs(loginPinGroup);
setupDigitInputs(signupCodeGroup);
setupDigitInputs(signupPinGroup);
setupDigitInputs(signupConfirmPinGroup);
setupDigitInputs(resetCodeGroup);
setupDigitInputs(resetPinGroup);
setupDigitInputs(resetConfirmPinGroup);

showChoice();