import { auth, waitUser, el } from "./nunsa-client.js";
const root = document.getElementById("candidate-profile");
(async () => {
  try {
    const user = await waitUser(); if (!user) { localStorage.setItem("nunsaNext", location.pathname + location.search); location.href = "index.html"; return; }
    const params = new URLSearchParams(location.search), electionId = params.get("electionId"), candidateId = params.get("id");
    const back = document.getElementById("back-candidates");
    if (back && electionId) back.href = `candidate-directory.html?electionId=${encodeURIComponent(electionId)}`;
    if (!electionId || !candidateId) throw new Error("A candidate profile link is incomplete.");
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/.netlify/functions/get-election-overview?electionId=${encodeURIComponent(electionId)}&candidateId=${encodeURIComponent(candidateId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || "Unable to load candidate.");
    const c = data.candidates[0]; if (!c) throw new Error("Candidate not found.");
    document.title = `${c.name} · NUNSA-FUD`;
    root.replaceChildren();
    const img = el("img", "candidate-profile-photo"); img.src = c.profilePicture || "assets/default-profile.jpg"; img.alt = `${c.name} profile picture`; img.onerror = () => { img.src = "assets/default-profile.jpg"; };
    const intro = el("section", "candidate-profile-intro"); intro.append(el("p", "eyebrow", data.election.title || "NUNSA-FUD ELECTION"), img, el("h1", "", c.name), el("p", "candidate-profile-position", c.position)); root.append(intro);
    const bio = el("section", "candidate-profile-section"); bio.append(el("h2", "", "About the candidate"), el("p", "", c.biography || "No biography has been provided.")); root.append(bio);
    const mandate = el("section", "candidate-profile-section candidate-mandate-section"); mandate.append(el("p", "eyebrow", "CANDIDATE STATEMENT"), el("h2", "", "Mandate"), el("p", "candidate-manifesto", c.mandate || c.manifesto || "This candidate has not published a mandate yet.")); root.append(mandate);
  } catch (error) { root.replaceChildren(el("p", "message error", error.message || "Unable to load candidate profile.")); }
})();
