import { auth, waitUser, el } from "./nunsa-client.js";
const root = document.getElementById("student-results-list");

(async () => {
  try {
    const user = await waitUser();
    if (!user) {
      localStorage.setItem("nunsaNext", location.pathname + location.search);
      location.href = "index.html";
      return;
    }
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/.netlify/functions/get-election-history", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Unable to load results.");

    const elections = data.elections || [];
    root.replaceChildren();
    if (!elections.length) {
      root.append(el("p", "empty-note", "No completed elections yet. Results will appear here after voting closes."));
      return;
    }
    elections.forEach(election => {
      const row = el("div", "candidate-directory-row");
      const copy = el("div", "");
      copy.append(el("strong", "", election.title || "Election"));
      copy.append(el("small", "", election.finalized ? "Results finalized" : "Voting ended · Awaiting results finalization"));
      const link = el("a", "section-link", "View results →");
      link.href = `results.html?id=${encodeURIComponent(election.id)}`;
      row.append(copy, link);
      root.append(row);
    });
  } catch (error) {
    root.replaceChildren(el("p", "message error", error.message || "Unable to load results."));
  }
})();
