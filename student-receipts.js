import { auth, db, waitUser, el } from "./nunsa-client.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const root = document.getElementById("student-receipts-list");
const message = document.getElementById("student-receipts-message");
const matricKey = value => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const asDate = value => value?.toDate ? value.toDate() : value ? new Date(value) : null;

(async () => {
  try {
    const user = await waitUser();
    if (!user) {
      try { localStorage.setItem("nunsaNext", location.pathname + location.search); } catch {}
      location.href = "index.html";
      return;
    }

    const matric = sessionStorage.getItem("studentMatricNumber");
    if (!matric) throw new Error("Your student session has expired. Please log in again.");

    const elections = await getDocs(query(collection(db, "elections"), where("status", "in", ["published", "ended"])));
    const records = await Promise.all(elections.docs.map(async snap => {
      const election = { id: snap.id, ...snap.data() };
      const voteId = `${election.id}_${matricKey(matric)}`;
      const vote = await getDoc(doc(db, "votes", voteId)).catch(() => null);
      if (!vote?.exists()) return null;
      const data = vote.data();
      return { election, receiptCode: data.receiptCode || "Recorded", votedAt: asDate(data.createdAt) };
    }));

    const voted = records.filter(Boolean).sort((a, b) => (b.votedAt?.getTime() || 0) - (a.votedAt?.getTime() || 0));
    root.replaceChildren();
    if (!voted.length) {
      root.append(el("p", "empty-note", "No voting receipts are available yet. After you vote in an election, its confirmation record will appear here."));
      return;
    }

    const list = el("div", "receipt-history-list");
    voted.forEach(({ election, receiptCode, votedAt }) => {
      const item = el("article", "receipt-history-item");
      const head = el("div", "receipt-history-head");
      head.append(el("span", "receipt-confirmed", "✓ VOTE RECORDED"));
      item.append(head, el("h2", "", election.title || "NUNSA-FUD Election"));
      const details = el("dl", "receipt-history-meta");
      for (const [label, value] of [
        ["Matriculation number", matric],
        ["Date recorded", votedAt ? votedAt.toLocaleString() : "Date unavailable"],
        ["Receipt reference", receiptCode]
      ]) {
        const row = el("div", ""); row.append(el("dt", "", label), el("dd", "", value)); details.append(row);
      }
      item.append(details);
      list.append(item);
    });
    root.append(list);
  } catch (error) {
    root.replaceChildren();
    message.textContent = error.message || "Unable to load your voting records.";
    message.className = "message error";
  }
})();
