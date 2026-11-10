// Mask PIN digits on browsers that do not support the WebKit text-security property.
if (!window.CSS || typeof CSS.supports !== "function" || !CSS.supports("-webkit-text-security", "disc")) {
    document.querySelectorAll('.pin-box, input[aria-label^="PIN digit"]').forEach((input) => {
        input.type = "password";
    });
}
