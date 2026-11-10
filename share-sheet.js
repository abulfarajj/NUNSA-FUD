/* A share sheet that slides up from the bottom: a few popular apps, Copy link, and More, which opens the phone's own list of apps. */

const ICONS = {
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M12 4.6a7.4 7.4 0 0 0-6.4 11.1L4.7 19.4l3.8-1a7.4 7.4 0 1 0 3.5-13.8zm4 10.4c-.2.5-1 1-1.5 1-.4.1-.9.1-2.8-.6-2.3-1-3.8-3.3-3.9-3.5-.1-.2-.9-1.2-.9-2.300 0-1.100.600-1.600.800-1.900.2-.2.500-.3.700-.3h.5c.200 0 .400 0 .500.400l.700 1.700c.1.200.1.300 0 .500l-.3.400-.3.3c-.1.100-.3.300-.1.600.200.300.800 1.300 1.700 2 1.100.900 2 1.200 2.300 1.300.300.100.400.100.600-.1l.700-.9c.200-.2.300-.2.600-.1l1.600.8c.2.100.4.200.4.300.100.200.1.700-.1 1.200z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path fill="#fff" d="M5.200 11.800l11.600-4.500c.5-.2 1 .1.800.9l-2 9.300c-.1.700-.6.900-1.200.5l-3.100-2.300-1.500 1.500c-.2.200-.3.300-.7.300l.2-3.200 5.800-5.200c.3-.2-.1-.4-.4-.2l-7.200 4.500-3.100-1c-.7-.2-.7-.7.200-1z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#111"/><path d="M7.500 7l9 10M16.500 7l-9 10" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M13.400 19.500v-6.300h2.100l.4-2.600h-2.500V9c0-.8.300-1.300 1.400-1.300h1.200V5.400c-.2 0-1-.1-1.800-.1-2 0-3.300 1.200-3.300 3.400v1.900H8.800v2.600H11v6.300h2.400z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#6b7c85"/><rect x="5.500" y="7.500" width="13" height="9" rx="1.500" fill="none" stroke="#fff" stroke-width="1.600"/><path d="M6 8.500l6 4.500 6-4.500" fill="none" stroke="#fff" stroke-width="1.600" stroke-linejoin="round"/></svg>',
    sms: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#34A853"/><path fill="#fff" d="M6.500 6.500h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H11l-3.500 3v-3h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" opacity=".14"/><path d="M10.200 13.800a3.200 3.200 0 0 0 4.500 0l2-2a3.200 3.200 0 0 0-4.500-4.500l-.8.8M13.800 10.200a3.200 3.200 0 0 0-4.500 0l-2 2a3.200 3.200 0 0 0 4.500 4.500l.8-.8" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" opacity=".14"/><circle cx="7.500" cy="12" r="1.600" fill="currentColor"/><circle cx="12" cy="12" r="1.600" fill="currentColor"/><circle cx="16.500" cy="12" r="1.600" fill="currentColor"/></svg>'
};

function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        const box = document.createElement("textarea");
        box.value = text;
        document.body.appendChild(box);
        box.select();
        let done = false;
        try { done = document.execCommand("copy"); } catch (inner) { done = false; }
        box.remove();
        return done;
    }
}

export function openShareSheet({ title, url, text }) {
    const message = text || title || "NUNSA-FUD";
    const full = `${message}\n${url}`;
    const enc = encodeURIComponent;

    const apps = [
        { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${enc(full)}` },
        { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}` },
        { key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(url)}` },
        { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
        { key: "email", label: "Email", href: `mailto:?subject=${enc(title || "NUNSA-FUD")}&body=${enc(full)}` },
        { key: "sms", label: "Messages", href: `sms:?&body=${enc(full)}` }
    ];

    const sheet = node("dialog", "share-sheet");
    sheet.setAttribute("aria-labelledby", "share-sheet-title");

    const head = node("div", "popup-head");
    const heading = node("h2", "", "Share");
    heading.id = "share-sheet-title";
    const close = node("button", "popup-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    head.append(heading, close);

    const preview = node("div", "share-preview");
    preview.append(node("strong", "", title || "Announcement"), node("span", "", url));

    const grid = node("div", "share-grid");
    const status = node("p", "share-status");
    status.setAttribute("role", "status");

    function item(icon, label) {
        const holder = node("span", "share-icon");
        holder.innerHTML = ICONS[icon];
        const wrapper = [holder, node("span", "share-label", label)];
        return wrapper;
    }

    apps.forEach((app) => {
        const link = node("a", "share-item");
        link.href = app.href;
        link.target = "_blank";
        link.rel = "noopener";
        link.append(...item(app.key, app.label));
        link.addEventListener("click", () => setTimeout(() => sheet.close(), 150));
        grid.append(link);
    });

    const copy = node("button", "share-item");
    copy.type = "button";
    copy.append(...item("copy", "Copy link"));
    copy.addEventListener("click", async () => {
        status.textContent = (await copyText(url)) ? "Link copied." : "Could not copy. Press and hold the link above to copy it.";
    });
    grid.append(copy);

    if (navigator.share) {
        const more = node("button", "share-item");
        more.type = "button";
        more.append(...item("more", "More"));
        more.addEventListener("click", async () => {
            try {
                await navigator.share({ title, text: message, url });
                sheet.close();
            } catch (error) {
                if (error && error.name !== "AbortError") status.textContent = "Could not open your other apps.";
            }
        });
        grid.append(more);
    }

    sheet.append(head, preview, grid, status);
    document.body.append(sheet);

    const dispose = () => sheet.remove();
    sheet.addEventListener("close", dispose);
    close.addEventListener("click", () => sheet.close());
    sheet.addEventListener("click", (event) => { if (event.target === sheet) sheet.close(); });
    sheet.showModal();
}
