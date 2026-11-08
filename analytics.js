/* Counts a visit to a public page. No cookies and no personal data; skipped when the browser asks not to be tracked. */
(function () {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

    var path = location.pathname;
    var page = document.body.classList.contains("page-404") ? "not-found"
        : path.indexOf("/privacy") === 0 ? "privacy"
        : "home";

    /* One count per page per browser session, so refreshing does not inflate the numbers. */
    var key = "nunsa-visit-" + page;
    try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
    } catch (error) { /* private mode: just count it */ }

    var payload = JSON.stringify({ page: page });
    if (navigator.sendBeacon) {
        navigator.sendBeacon("/.netlify/functions/track", new Blob([payload], { type: "application/json" }));
    } else {
        fetch("/.netlify/functions/track", { method: "POST", body: payload, keepalive: true });
    }
})();
