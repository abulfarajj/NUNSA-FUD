import { auth, waitUser, noticesApi, ago, shareNotice, el, backHref } from "/nunsa-client.js";

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
    back.href = "/" + backHref(data.canManage);
    feed.replaceChildren();

    const top = el("div", "announcement-feed-heading");
    top.append(el("h2", "", "Notice board"));
    if (data.canPost) {
        const manage = el("a", "tag", data.canManage ? "Manage announcements →" : "Post an announcement →");
        manage.href = "/admin-announcements.html"; top.append(manage);
    }
    feed.append(top);

    const search = el("input", "announcement-search");
    search.type = "search"; search.placeholder = "Search announcements";
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
        if (!items.length) { list.append(el("p", "empty-note", term ? "No announcements match your search." : "Nothing posted yet.")); return; }
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
            const share = el("button", "secondary-btn announcement-share", "Copy link");
            share.type = "button"; share.addEventListener("click", async () => {
                const result = await shareNotice(a.id, a.title);
                if (result) say(result, "success");
            });
            row.append(link, share); list.append(row);
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
    const share = el("button", "vote-button", "COPY / SHARE LINK"); share.type = "button";
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
    catch { say("Unable to load announcements. Check your connection.", "error"); }
})();
