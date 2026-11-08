/* Pages write "Loading..." while data arrives. This gives that text a spinner, removes it when the text changes,
 * and adds a "Try again" button if the text turns into an error. */
(function () {
    var LOADING = /^\s*loading\b/i;
    var FAILED = /^\s*(unable|could not|couldn't|failed|something went wrong)/i;
    var TAGS = "p, div, span, li, h2, h3, small, strong";

    function isLeaf(element) { return element.children.length === 0; }

    function scan(root) {
        if (root.nodeType !== 1) return;
        var nodes = root.matches && root.matches(TAGS) ? [root] : [];
        nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll(TAGS)));
        nodes.forEach(function (element) {
            if (isLeaf(element) && LOADING.test(element.textContent)) element.classList.add("is-loading");
        });
    }

    function settle(element) {
        var text = element.textContent;
        if (LOADING.test(text)) return;
        element.classList.remove("is-loading");
        if (FAILED.test(text) && !element.nextElementSibling?.classList.contains("retry-btn")) {
            var retry = document.createElement("button");
            retry.type = "button";
            retry.className = "retry-btn";
            retry.textContent = "Try again";
            retry.addEventListener("click", function () { location.reload(); });
            element.after(retry);
        }
    }

    function start() {
        scan(document.body);
        new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(scan);
                var target = mutation.target.nodeType === 3 ? mutation.target.parentElement : mutation.target;
                if (target && target.classList && target.classList.contains("is-loading")) settle(target);
                if (target && target.nodeType === 1 && isLeaf(target) && LOADING.test(target.textContent)) target.classList.add("is-loading");
            });
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
