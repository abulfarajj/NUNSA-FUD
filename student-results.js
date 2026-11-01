import { waitUser, el, db } from "./nunsa-client.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const root = document.getElementById("student-results-list");
(async () => {
  try {
    const user = await waitUser(); if (!user) { localStorage.setItem("nunsaNext", location.pathname + location.search); location.href = "index.html"; return; }
    const snap = await getDocs(query(collection(db, "elections"), where("status", "in", ["published", "ended"])));
    const now = Date.now();
    const elections = snap.docs.map(d => ({ id:d.id, ...d.data(), end:d.data().endAt?.toMillis?.() || new Date(d.data().endAt).getTime() })).filter(e => e.end <= now || e.status === "ended").sort((a,b) => b.end-a.end);
    root.replaceChildren();
    if (!elections.length) { root.append(el("p", "empty-note", "No completed elections yet. Results will appear here after voting closes.")); return; }
    elections.forEach(e => { const row = el("div", "candidate-directory-row"); row.append(el("div", "", e.title || "Election"), el("a", "section-link", "View results →")); row.querySelector("a").href = `results.html?id=${encodeURIComponent(e.id)}`; root.append(row); });
  } catch (error) { root.replaceChildren(el("p", "message error", error.message || "Unable to load results.")); }
})();
