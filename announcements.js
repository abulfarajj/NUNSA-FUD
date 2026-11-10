import { kebab } from "./row-menu.js";
import { auth, waitUser, noticesApi, ago, shareNotice, noticeLink, el } from "/nunsa-client.js";
import { copyText } from "./share-sheet.js";
const shareIcon = () => { const w = document.createElement("span"); w.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>'; return w.firstChild; };
const iconShareBtn = () => { const b = el("button", "secondary-btn announcement-share share-icon-btn"); b.type = "button"; b.setAttribute("aria-label", "Share link"); b.title = "Share"; b.append(shareIcon()); return b; };

const feed = document.getElementById("feed"), detail = document.getElementById("detail"),
      gate = document.getElementById("gate"), msg = document.getElementById("msg"),
      back = document.getElementById("back-link");
const say = (t, type) => { msg.textContent = t || ""; msg.className = "message" + (type ? " " + type : ""); };

function meta(a) {
    const row = el("div", "", "");
    row.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.8rem;color:var(--muted)";
    row.append(el("span", "tag", a.authorName));
    if (a.authorPosition) row.append(el("span", "", a.authorPosition));
    row.append(el("span", "", ago(a.createdAt)));
    if (a.pinned) row.append(el("span", "tag", "Pinned"));
    return row;
}

async function showFeed() {
    const data = await noticesApi();
    if (!data.success) { say(data.message || "Unable to load.", "error"); return; }
    // Identify students from the signed Firebase token, not tab-scoped storage.
    // This also works when announcements was opened in a fresh browser tab.
    const token = await auth.currentUser.getIdTokenResult();
    const isStudent = typeof token.claims.matricNumber === "string" && !!token.claims.matricNumber;
    back.href = isStudent ? "/student-dashboard.html" : (data.canManage ? "/admin.html" : "/index.html");
    feed.replaceChildren();

    const top = el("div", "announcement-feed-heading");
    top.append(el("h2", "", "Notice board"));
    if (data.canPost) {
        const manage = el("a", "tag", data.canManage ? "Manage announcements →" : "Post an announcement →");
        manage.href = "/admin-announcements.html"; top.append(manage);
    }
    feed.append(top);

    const search = el("input", "announcement-search");
    search.type = "search"; search.placeholder = "Search";
    search.setAttribute("aria-label", "Search announcements");
    feed.append(search);
    const list = el("div", "announcement-feed-list");
    feed.append(list);

    const render = () => {
        const term = search.value.trim().toLocaleLowerCase();
        const items = (data.announcements || []).filter(a =>
            !term || [a.title, a.body, a.authorName, a.authorPosition].some(v => String(v || "").toLocaleLowerCase().includes(term))
        );
        list.replaceChildren();
        if (!items.length) { list.append(el("p", "empty-note", term ? "No announcements match your search." : "No announcements yet.")); return; }
        for (const a of items) {
            const row = el("div", "announcement-feed-row");
            const link = el("a", "announcement-feed-link"); link.href = "/a/" + encodeURIComponent(a.id);
            const title = el("strong", "", a.title);
            const info = el("div", "announcement-meta");
            info.append(el("span", "tag", a.authorName));
            if (a.authorPosition) info.append(el("span", "", a.authorPosition));
            info.append(el("span", "", ago(a.createdAt)));
            if (a.pinned) info.append(el("span", "tag", "Pinned"));
            link.append(info, title);
            if (a.body) link.append(el("p", "announcement-excerpt", a.body.length > 160 ? a.body.slice(0, 160) + "…" : a.body));
            if (a.hasImage) link.append(el("span", "tag", "Image attached"));
            const menu = kebab(`Options for ${a.title}`, [
                { label: "Share", onClick: () => shareNotice(a.id, a.title) },
                { label: "Copy link", onClick: async (item) => { const ok = await copyText(noticeLink(a.id)); item.textContent = ok ? "Link copied" : "Could not copy"; } }
            ]);
            row.append(link, menu); list.append(row);
        }
    };
    search.addEventListener("input", render);
    render();
}

async function showOne(id) {
    const data = await noticesApi(null, "?id=" + encodeURIComponent(id));
    if (!data.success) { say(data.message || "Unable to load.", "error"); return; }
    back.href = "/announcements.html"; back.textContent = "← All notices";
    const a = data.announcement;
    detail.hidden = false; detail.replaceChildren();
    const h = el("h2", "", a.title); h.style.margin = "20px 0 8px";
    detail.append(meta(a), h);
    if (a.image) { const img = el("img"); img.src = a.image; img.alt = a.title; img.style.cssText = "width:100%;border-radius:8px;margin:12px 0"; detail.append(img); }
    if (a.body) { const p = el("p", "", a.body); p.style.cssText = "white-space:pre-wrap;margin:12px 0;color:var(--text)"; detail.append(p); }
    const share = iconShareBtn();
    share.onclick = async () => { const r = await shareNotice(a.id, a.title); if (r) say(r, "success"); };
    detail.append(share);
}

(async () => {
    const user = await waitUser();
    const pm = location.pathname.match(/\/a\/([^/]+)/);
    const id = pm ? decodeURIComponent(pm[1]) : new URLSearchParams(location.search).get("id");
    if (!user) {
        try { localStorage.setItem("nunsaNext", location.pathname + location.search); } catch {}
        gate.hidden = false; return;
    }
    try { if (id) await showOne(id); else await showFeed(); }
    catch (error) { console.error("Announcements failed:", error); say("Unable to load announcements. Check your connection.", "error"); }
})();
