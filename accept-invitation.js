const urlParams =
    new URLSearchParams(
        window.location.search
    );

const inviteId =
    urlParams.get("inviteId");

const invitationStatus =
    document.getElementById(
        "invitation-status"
    );

const invitationDetails =
    document.getElementById(
        "invitation-details"
    );

const invitedRole =
    document.getElementById(
        "invited-role"
    );

const invitedEmail =
    document.getElementById(
        "invited-email"
    );

const form =
    document.getElementById(
        "accept-invitation-form"
    );

const emailInput =
    document.getElementById(
        "invitation-email"
    );

const passwordInput =
    document.getElementById(
        "invitation-password"
    );

const confirmPasswordInput =
    document.getElementById(
        "confirm-password"
    );

const acceptMessage =
    document.getElementById(
        "accept-message"
    );

function showMessage(
    message,
    color = "#c0392b"
) {

    acceptMessage.textContent =
        message;

    acceptMessage.style.color =
        color;
}

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function checkInvitation() {

    if (!inviteId) {

        invitationStatus.textContent =
            "Invalid invitation link.";

        return;
    }

    invitationStatus.textContent =
        "Checking your invitation...";

    try {

        const response =
            await fetch(
                `/.netlify/functions/check-admin-invitation?inviteId=${encodeURIComponent(
                    inviteId
                )}`
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

            invitationStatus.textContent =
                result.message ||
                "This invitation is invalid or no longer available.";

            return;
        }

        invitedRole.textContent =
            result.role === "super_admin"
                ? "Super Admin"
                : "Regular Admin";

        invitedEmail.textContent =
            result.email;

        emailInput.value =
            result.email;

        invitationDetails.style.display =
            "block";

        form.style.display =
            "block";

        invitationStatus.textContent =
            "Invitation verified. Create your administrator password.";

    } catch (error) {

        console.error(
            "Invitation check error:",
            error
        );

        invitationStatus.textContent =
            "Unable to verify this invitation. Please try again later.";
    }
}

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const email =
            emailInput.value
                .trim()
                .toLowerCase();

        const password =
            passwordInput.value;

        const confirmPassword =
            confirmPasswordInput.value;

        if (!email) {

            showMessage(
                "Please enter your email address."
            );

            return;
        }

        if (password.length < 6) {

            showMessage(
                "Password must be at least 6 characters."
            );

            return;
        }

        if (
            password !==
            confirmPassword
        ) {

            showMessage(
                "Passwords do not match."
            );

            return;
        }

        if (!inviteId) {

            showMessage(
                "Invalid invitation link."
            );

            return;
        }

        const button =
            form.querySelector(
                "button[type='submit']"
            );

        button.disabled = true;

        button.textContent =
            "CREATING ACCOUNT...";

        showMessage(
            "Creating your administrator account...",
            "#4f8f9a"
        );

        try {

            const response =
                await fetch(
                    "/.netlify/functions/accept-admin-invitation",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            inviteId,
                            email,
                            password
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
                    "Unable to create your administrator account."
                );
            }

            invitationStatus.textContent =
                "Administrator account created successfully.";

            showMessage(
                "Your administrator account has been created. You can now log in.",
                "#4f8f9a"
            );

            form.style.display =
                "none";

            setTimeout(() => {

                window.location.href =
                    "admin-login.html";

            }, 1500);

        } catch (error) {

            console.error(
                "Administrator account creation error:",
                error
            );

            showMessage(
                error.message ||
                "Unable to create your administrator account."
            );

            button.disabled = false;

            button.textContent =
                "ACCEPT INVITATION";
        }
    }
);

checkInvitation();