// Student dashboard extras: live election countdown + latest announcements. Read-only; touches nothing else.
import { db, waitUser, noticesApi, ago, el } from "./nunsa-client.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const root = document.getElementById("home-extras");
const toMs = v => (v && v.toMillis ? v.toMillis() : v ? new Date(v).getTime() : 0);

function counter(label, target, cta) {
    const box = el("div", "");
    const lab = el("p", "small-label", label); lab.style.marginBottom = "10px";
    const row = el("div", "countdown"); const cells = {};
    for (const [k, n] of [["d", "days"], ["h", "hrs"], ["m", "min"], ["s", "sec"]]) {
        const c = el("div", ""); const b = el("b", "", "00"); cells[k] = b; c.append(b, el("small", "", n)); row.append(c);
    }
    box.append(lab, row);
    if (cta) { const a = el("a", "vote-button", cta.text); a.href = cta.href; a.style.cssText = "display:inline-block;text-decoration:none;margin-top:16px;text-align:center"; box.append(a); }
    const tick = () => {
        let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
        const p = n => String(n).padStart(2, "0");
        cells.d.textContent = p(Math.floor(s / 86400)); cells.h.textContent = p(Math.floor(s / 3600) % 24);
        cells.m.textContent = p(Math.floor(s / 60) % 60); cells.s.textContent = p(s % 60);
        if (s === 0) { clearInterval(timer); setTimeout(() => location.reload(), 1500); }
    };
    const timer = setInterval(tick, 1000); tick();
    return box;
}

async function electionBlock() {
    const snap = await getDocs(query(collection(db, "elections"), where("status", "in", ["published", "ended"])));
    const now = Date.now();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data(), s: toMs(d.data().startAt), e: toMs(d.data().endAt) }));
    const live = list.filter(x => x.status === "published" && x.s <= now && now < x.e).sort((a, b) => a.e - b.e)[0];
    const soon = list.filter(x => x.status === "published" && x.s > now).sort((a, b) => a.s - b.s)[0];
    const last = list.filter(x => x.status === "ended").sort((a, b) => b.e - a.e)[0];
    const sec = el("section", "dashboard-section"); sec.style.borderTop = "0";
    if (live) { sec.append(el("h2", "", live.title || "Election"), counter("VOTING CLOSES IN", live.e, { text: "VOTE NOW", href: "voter-portal.html" })); }
    else if (soon) { sec.append(el("h2", "", soon.title || "Election"), counter("VOTING OPENS IN", soon.s, { text: "VIEW ELECTION", href: "voter-portal.html" })); }
    else if (last) { sec.append(el("h2", "", last.title || "Election"), el("p", "", "Results are out.")); const a = el("a", "vote-button", "SEE RESULTS"); a.href = "voter-portal.html"; a.style.cssText = "display:inline-block;text-decoration:none"; sec.append(a); }
    else return null;
    return sec;
}

async function noticeBlock() {
    const d = await noticesApi();
    if (!d.success || !d.announcements.length) return null;
    const sec = el("section", "dashboard-section");
    const head = el("div", ""); head.style.cssText = "display:flex;justify-content:space-between;align-items:baseline";
    const all = el("a", "tag", "All →"); all.href = "announcements.html"; head.append(el("h2", "", "Notice board"), all); sec.append(head);
    for (const a of d.announcements.slice(0, 3)) {
        const row = el("a", "notice"); row.href = "/a/" + encodeURIComponent(a.id); row.style.textDecoration = "none";
        const left = el("div", ""); const t = el("strong", "", a.title); t.style.display = "block";
        left.append(el("span", "tag", a.authorName + (a.pinned ? " · Pinned" : "")), t);
        const when = el("small", "", ago(a.createdAt)); when.style.color = "var(--muted)"; left.append(when); row.append(left); sec.append(row);
    }
    return sec;
}

async function officeBlock() {
    const d = await noticesApi(null, "?me=1");
    if (!d.success || !d.offices || !d.offices.length) return null;
    const sec = el("section", "dashboard-section"); sec.style.borderTop = "0";
    sec.append(el("p", "small-label", "YOUR OFFICE"));
    for (const o of d.offices) {
        const h = el("h2", "", o.position); h.style.margin = "6px 0 2px";
        const sub = el("p", "", "Elected · " + (o.electionTitle || "NUNSA election")); sub.style.cssText = "color:var(--muted);margin:0 0 10px";
        sec.append(h, sub);
    }
    const a = el("a", "vote-button", "POST AN ANNOUNCEMENT"); a.href = "admin-announcements.html"; a.style.cssText = "display:inline-block;text-decoration:none;margin-top:6px";
    sec.append(a); return sec;
}

(async () => {
    if (!root) return;
    try {
        const user = await waitUser(); if (!user) return;
        const [o, a, b] = await Promise.allSettled([officeBlock(), electionBlock(), noticeBlock()]);
        for (const r of [o, a, b]) if (r.status === "fulfilled" && r.value) root.append(r.value);
    } catch (e) { console.error("home extras", e && e.code); }
})();
