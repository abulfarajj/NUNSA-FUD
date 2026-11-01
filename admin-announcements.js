import { waitUser, noticesApi, ago, shareNotice, el } from "./nunsa-client.js";

const $ = id => document.getElementById(id);
const f = { title: $("title"), author: $("author"), text: $("text"), mode: $("mode"), file: $("file"), pinned: $("pinned"),
            save: $("save"), cancel: $("cancel"), msg: $("msg"), prev: $("preview"), wrap: $("preview-wrap"), list: $("list") };
let image = "", editId = null, MAXLEN = 600000, isAdmin = true;
const authorValue = () => (isAdmin ? f.author.value : $("author-select").value);
const say = (t, type) => { f.msg.textContent = t || ""; f.msg.className = "message" + (type ? " " + type : ""); };

/* ---- image helpers: everything ends as a compressed JPEG data URL ---- */
function toJpeg(canvas) {
    for (const q of [0.88, 0.78, 0.68, 0.58, 0.48]) {
        const url = canvas.toDataURL("image/jpeg", q);
        if (url.length <= MAXLEN) return url;
    }
    return "";
}
function wrap(ctx, text, maxW) {
    const lines = [];
    for (const para of String(text).split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/)) {
            const test = line ? line + " " + word : word;
            if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
        }
        lines.push(line);
    }
    return lines;
}
function loadImg(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }
async function makeFromText() {
    const W = 1080, H = 1350, P = 90, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0c2b31"); g.addColorStop(1, "#1d5560");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = "#c9962b"; x.fillRect(P, 250, 120, 6);
    try { const logo = await loadImg("assets/nunsa-logo.png"); x.save(); x.beginPath(); x.arc(P + 45, P + 20, 45, 0, 7); x.clip(); x.fillStyle = "#fff"; x.fillRect(P, P - 25, 90, 90); x.drawImage(logo, P + 4, P - 21, 82, 82); x.restore(); } catch {}
    x.fillStyle = "#a8cbd0"; x.font = "600 30px system-ui, sans-serif"; x.fillText("NUNSA-FUD · ANNOUNCEMENT", P + 115, P + 30);
    x.fillStyle = "#fff"; x.textBaseline = "top";
    let ts = 84; x.font = `700 ${ts}px system-ui, sans-serif`; let tl = wrap(x, f.title.value, W - 2 * P);
    while (tl.length > 4 && ts > 52) { ts -= 6; x.font = `700 ${ts}px system-ui, sans-serif`; tl = wrap(x, f.title.value, W - 2 * P); }
    let y = 290; tl.forEach(l => { x.fillText(l, P, y); y += ts * 1.18; });
    y += 30; let bs = 44; const bottom = H - 230;
    let bl; do { x.font = `400 ${bs}px system-ui, sans-serif`; bl = wrap(x, f.text.value, W - 2 * P); bs -= 2; } while (bl.length * (bs + 2) * 1.4 > bottom - y && bs > 24);
    x.fillStyle = "#dcebed"; bl.forEach(l => { if (y < bottom) { x.fillText(l, P, y); y += (bs + 2) * 1.4; } });
    x.fillStyle = "#c9962b"; x.fillRect(P, H - 170, W - 2 * P, 3);
    x.fillStyle = "#fff"; x.font = "700 40px system-ui, sans-serif"; x.fillText(authorValue().trim() || "NUNSA-FUD", P, H - 140);
    x.fillStyle = "#a8cbd0"; x.font = "400 30px system-ui, sans-serif"; x.fillText(new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }), P, H - 85);
    return toJpeg(c);
}
async function fromFile(file) {
    const url = URL.createObjectURL(file);
    try {
        const i = await loadImg(url), s = Math.min(1, 1400 / Math.max(i.width, i.height));
        const c = document.createElement("canvas"); c.width = Math.round(i.width * s); c.height = Math.round(i.height * s);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(i, 0, 0, c.width, c.height);
        return toJpeg(c);
    } finally { URL.revokeObjectURL(url); }
}
function showPreview() { f.wrap.hidden = !image; if (image) f.prev.src = image; }
async function refreshImage() {
    const m = f.mode.value; f.file.hidden = m !== "upload";
    if (m === "none") image = "";
    else if (m === "make") {
        if (!f.title.value.trim()) { image = ""; say("Add a title first, then the image is made from your text."); }
        else { image = await makeFromText(); say(image ? "" : "Image too large — shorten the text.", image ? "" : "error"); }
    }
    showPreview();
}
f.mode.onchange = refreshImage;
["input"].forEach(ev => { f.title.addEventListener(ev, () => { if (f.mode.value === "make") refreshImage(); }); f.text.addEventListener(ev, debounce(() => { if (f.mode.value === "make") refreshImage(); })); f.author.addEventListener(ev, debounce(() => { if (f.mode.value === "make") refreshImage(); })); });
function debounce(fn) { let t; return () => { clearTimeout(t); t = setTimeout(fn, 350); }; }
f.file.onchange = async () => { const file = f.file.files[0]; if (!file) return; image = await fromFile(file); say(image ? "" : "That image is too large.", image ? "" : "error"); showPreview(); };

/* ---- list + actions ---- */
async function reload() {
    const d = await noticesApi();
    if (!d.success) { say(d.message, "error"); return; }
    if (!d.canPost) { location.href = "announcements.html"; return; }
    f.list.replaceChildren();
    if (!d.announcements.length) f.list.append(el("p", "", "Nothing posted yet."));
    const mineOnly = d.announcements.filter(a => a.canEdit);
    if (!mineOnly.length) f.list.replaceChildren(el("p", "", "Nothing posted by you yet."));
    for (const a of mineOnly) {
        const row = el("div", "notice"); row.style.flexDirection = "column";
        const head = el("div", ""); head.append(el("span", "tag", a.authorName + (a.pinned ? " · Pinned" : "")), el("strong", "", a.title));
        head.querySelector("strong").style.display = "block";
        const small = el("small", "", ago(a.createdAt) + (a.hasImage ? " · has image" : "")); small.style.color = "var(--muted)";
        const acts = el("div", "form-actions"); acts.style.marginTop = "8px";
        const mk = (label, fn, danger) => { const b = el("button", "secondary-btn", label); b.type = "button"; b.style.padding = "7px 12px"; if (danger) b.style.color = "var(--danger)"; b.onclick = fn; acts.append(b); };
        mk("Copy link", async () => { const r = await shareNotice(a.id, a.title); if (r) say(r, "success"); });
        if (isAdmin) mk(a.pinned ? "Unpin" : "Pin", async () => { const r = await noticesApi({ action: "pin", id: a.id, pinned: !a.pinned }); say(r.message, r.success ? "success" : "error"); reload(); });
        mk("Edit", () => startEdit(a.id));
        mk("Delete", async () => { if (!confirm("Delete this announcement?")) return; const r = await noticesApi({ action: "delete", id: a.id }); say(r.message, r.success ? "success" : "error"); reload(); }, true);
        row.append(head, small, acts); f.list.append(row);
    }
}
async function startEdit(id) {
    const d = await noticesApi(null, "?id=" + encodeURIComponent(id));
    if (!d.success) { say(d.message, "error"); return; }
    const a = d.announcement; editId = a.id;
    f.title.value = a.title; f.author.value = a.authorName; $("author-select").value = a.authorName; f.text.value = a.body; f.pinned.checked = a.pinned;
    image = a.image || ""; f.mode.innerHTML = '<option value="keep">Keep current image</option><option value="none">No image</option><option value="make">Make an image from my text</option><option value="upload">Upload my own image</option>';
    f.mode.value = "keep"; showPreview(); $("form-title").textContent = "Edit announcement"; f.save.textContent = "SAVE CHANGES"; f.cancel.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
}
function resetForm() {
    editId = null; image = ""; $("form").reset();
    f.mode.innerHTML = '<option value="none">No image (text only)</option><option value="make">Make an image from my text</option><option value="upload">Upload my own image</option>';
    f.file.hidden = true; f.wrap.hidden = true; $("form-title").textContent = "New announcement"; f.save.textContent = "POST ANNOUNCEMENT"; f.cancel.hidden = true;
}
f.cancel.onclick = () => { resetForm(); say(""); };
$("form").onsubmit = async e => {
    e.preventDefault();
    if (f.mode.value === "make") await refreshImage();
    f.save.disabled = true; say("Posting…");
    const r = await noticesApi({ action: editId ? "update" : "create", id: editId, title: f.title.value, authorName: authorValue(), body: f.text.value, image, pinned: f.pinned.checked });
    f.save.disabled = false; say(r.message, r.success ? "success" : "error");
    if (r.success) { resetForm(); say(r.message, "success"); reload(); }
};

(async () => {
    const user = await waitUser();
    if (!user) { try { localStorage.setItem("nunsaNext", "/announcements.html"); } catch {} location.href = "index.html"; return; }
    const me = await noticesApi(null, "?me=1");
    if (!me.success || !me.canPost) { location.href = "announcements.html"; return; }
    isAdmin = me.isAdmin;
    if (!isAdmin) {
        const sel = $("author-select"); sel.hidden = false; $("author").hidden = true; $("pin-row").hidden = true;
        $("back").href = "student-dashboard.html";
        for (const o of me.offices) { const op = document.createElement("option"); op.value = o.position; op.textContent = o.position; sel.append(op); }
        sel.onchange = () => { if (f.mode.value === "make") refreshImage(); };
    }
    reload();
})();
