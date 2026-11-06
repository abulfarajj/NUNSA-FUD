// Browsers without -webkit-text-security would show PIN digits in the clear, so fall back to password fields there.
if (!CSS.supports("-webkit-text-security", "disc")) {
    document.querySelectorAll('.pin-box, input[aria-label^="PIN digit"]').forEach((input) => {
        input.type = "password";
    });
}
