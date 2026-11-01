import { auth, waitUser, noticesApi, ago, shareNotice, el, backHref } from "/nunsa-client.js";

const feed = document.getElementById("feed"), detail = document.getElementById("detail"),
      gate = document.getElementById("gate"), msg = document.getElementById("msg"),
      back = document.getElementById("back-link");
const say = (t, type) => { msg.textContent = t || ""; msg.className = "message" + (type ? " " + type : ""); };

function meta(a) {
    const row = el("div", "", "");
    row.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.8rem;color:var(--muted)";
    row.append(el("span", "tag", a.authorName), el("span", "", ago(a.createdAt)));
    if (a.pinned) row.append(el("span", "tag", "Pinned"));
    return row;
}

async function showFeed(canManageHint) {
    const data = await noticesApi();
    if (!data.success) { say(data.message || "Unable to load.", "error"); return; }
    back.href = "/" + backHref(data.canManage);
    feed.replaceChildren();
    const top = el("div", ""); top.style.cssText = "display:flex;justify-content:space-between;align-items:flex-end;margin:20px 0 6px";
    top.append(el("h2", "", "Notice board"));
    if (data.canPost) { const m = el("a", "tag", data.canManage ? "Manage →" : "Post a notice →"); m.href = "/admin-announcements.html"; top.append(m); }
    feed.append(top);
    if (!data.announcements.length) feed.append(el("p", "", "Nothing posted yet."));
    for (const a of data.announcements) {
        const row = el("a", "notice"); row.href = "/a/" + encodeURIComponent(a.id); row.style.textDecoration = "none";
        const left = el("div", ""); left.style.minWidth = "0";
        const t = el("strong", "", a.title); t.style.display = "block";
        left.append(meta(a), t);
        if (a.body) { const p = el("p", "", a.body.length > 120 ? a.body.slice(0, 120) + "…" : a.body); p.style.cssText = "color:var(--muted);margin:4px 0 0;font-size:.92rem"; left.append(p); }
        row.append(left);
        if (a.hasImage) { const b = el("span", "tag", "Image"); b.style.whiteSpace = "nowrap"; row.append(b); }
        feed.append(row);
    }
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
