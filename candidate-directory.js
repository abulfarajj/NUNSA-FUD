import { auth, db, waitUser, el } from "./nunsa-client.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const groups = document.getElementById("candidate-groups"), picker = document.getElementById("election-picker"), desc = document.getElementById("election-description"), msg = document.getElementById("candidate-directory-message");
async function api(electionId) {
  const token = await auth.currentUser.getIdToken();
  const r = await fetch(`/.netlify/functions/get-election-overview?electionId=${encodeURIComponent(electionId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.message || "Unable to load candidates."); return d;
}
function render(data) {
  groups.replaceChildren(); desc.textContent = data.election.description || "Browse the candidates for this election.";
  if (!data.candidates.length) { groups.append(el("p", "empty-note", "No candidates have been published for this election.")); return; }
  const byPosition = new Map();
  data.candidates.forEach(c => { if (!byPosition.has(c.position)) byPosition.set(c.position, []); byPosition.get(c.position).push(c); });
  for (const [position, candidates] of byPosition) {
    const section = el("section", "candidate-directory-group"); section.append(el("h2", "", position));
    const list = el("div", "candidate-directory-list");
    candidates.forEach(c => {
      const row = el("a", "candidate-directory-row"); row.href = `candidate.html?electionId=${encodeURIComponent(data.election.id)}&id=${encodeURIComponent(c.id)}`;
      const img = el("img"); img.src = c.profilePicture || "assets/default-profile.jpg"; img.alt = ""; img.onerror = () => { img.src = "assets/default-profile.jpg"; };
      const info = el("div", ""); info.append(el("strong", "", c.name), el("small", "", c.biography || "View candidate profile and manifesto."));
      row.append(img, info, el("span", "candidate-arrow", "→")); list.append(row);
    });
    section.append(list); groups.append(section);
  }
}
(async () => {
  try {
    const user = await waitUser(); if (!user) { localStorage.setItem("nunsaNext", location.pathname + location.search); location.href = "index.html"; return; }
    const snap = await getDocs(query(collection(db, "elections"), where("status", "in", ["published", "ended"])));
    const elections = snap.docs.map(d => ({ id: d.id, ...d.data(), start: d.data().startAt?.toMillis?.() || new Date(d.data().startAt).getTime(), end: d.data().endAt?.toMillis?.() || new Date(d.data().endAt).getTime() }));
    const requested = new URLSearchParams(location.search).get("electionId");
    const selected = elections.find(e => e.id === requested) || elections.sort((a,b) => b.start-a.start)[0];
    if (!selected) { groups.replaceChildren(el("p", "empty-note", "No published elections are available.")); return; }
    if (elections.length > 1) {
      const select = document.createElement("select"); select.setAttribute("aria-label", "Choose election");
      elections.sort((a,b) => b.start-a.start).forEach(e => { const option = document.createElement("option"); option.value = e.id; option.textContent = e.title || "Election"; option.selected = e.id === selected.id; select.append(option); });
      select.addEventListener("change", () => { location.href = `candidate-directory.html?electionId=${encodeURIComponent(select.value)}`; }); picker.append(select);
    }
    render(await api(selected.id));
  } catch (error) { msg.textContent = error.message || "Unable to load candidate information."; }
})();
