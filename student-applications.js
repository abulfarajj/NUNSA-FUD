import { auth } from "./nunsa-client.js";
import { initStudentPage } from "./student-page.js";

const $ = id => document.getElementById(id);
const offersRoot = $("application-offers");
const applicationsRoot = $("applications-list");
const feedback = $("applications-feedback");
const dialog = $("mandate-dialog");
const form = $("mandate-form");
const mandateInput = $("candidate-mandate");
const count = $("mandate-count");
let selectedApplication = null;
let busy = false;

const statusText = {
  applied: "Submitted. Your application is awaiting screening by the electoral committee.",
  disqualified: "You were disqualified after screening.",
  approved: "Approved for the ballot."
};

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text != null) item.textContent = text;
  return item;
}

function say(text, error = false) {
  feedback.textContent = text || "";
  feedback.classList.toggle("error", error);
}

async function callApi(name, payload) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/.netlify/functions/${name}`, {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: payload ? JSON.stringify(payload) : undefined
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("The server returned an invalid response."); }
  if (!response.ok || data.success !== true) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

function openMandateDialog(offer, position) {
  selectedApplication = { offer, position };
  $("mandate-position-title").textContent = `Apply for ${position.position}`;
  mandateInput.value = "";
  count.textContent = "0 / 4000";
  say("");
  dialog.showModal();
  mandateInput.focus();
}

function renderApplications(applications) {
  applicationsRoot.replaceChildren();
  if (!applications.length) {
    applicationsRoot.append(node("p", "empty-note", "You have not submitted any applications yet."));
    return;
  }
  applications.forEach(application => {
    const card = node("article", "application-status-card");
    const copy = node("div", "application-status-copy");
    copy.append(node("span", "application-status-tag " + (application.status === "disqualified" ? "is-disqualified" : ""), application.status || "Submitted"));
    copy.append(node("h3", "", application.position || "Position"));
    copy.append(node("p", "", application.electionTitle || "Election"));
    copy.append(node("p", "", statusText[application.status] || String(application.status || "Status unavailable")));
    if (application.disqualifiedReason) copy.append(node("p", "application-reason", `Reason: ${application.disqualifiedReason}`));
    card.append(copy);
    applicationsRoot.append(card);
  });
}

function renderOffers(offers, applications) {
  offersRoot.replaceChildren();
  let visible = 0;
  offers.forEach(offer => {
    const existing = applications.find(item => item.electionId === offer.electionId);
    if (existing) return;
    const section = node("section", "application-election-card");
    section.append(node("p", "eyebrow", "APPLICATIONS OPEN"));
    section.append(node("h3", "", offer.title || "Election"));
    section.append(node("p", "application-election-note", "Select one position to contest in this election."));
    const positions = node("div", "application-position-list");
    (offer.positions || []).forEach(position => {
      const row = node("div", "application-position-row");
      const title = node("div", "application-position-copy");
      title.append(node("strong", "", position.position));
      title.append(node("small", "", "Open for applications"));
      const button = node("button", "vote-button", "Apply for this position");
      button.type = "button";
      button.addEventListener("click", () => openMandateDialog(offer, position));
      row.append(title, button);
      positions.append(row);
      visible++;
    });
    section.append(positions);
    offersRoot.append(section);
  });
  if (!visible) offersRoot.append(node("p", "empty-note", "There are no open applications right now. Positions will appear here when the electoral committee opens applications."));
}

async function refresh() {
  const data = await callApi("get-form-offers");
  const applications = data.applications || [];
  renderApplications(applications);
  renderOffers(data.offers || [], applications);
}

mandateInput.addEventListener("input", () => { count.textContent = `${mandateInput.value.length} / 4000`; });
$("cancel-mandate").addEventListener("click", () => dialog.close());
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !selectedApplication) return;
  const mandate = mandateInput.value.trim();
  if (mandate.length < 20) { say("Please write a mandate of at least 20 characters.", true); mandateInput.focus(); return; }
  const submit = $("submit-application");
  busy = true; submit.disabled = true; submit.textContent = "Submitting…";
  try {
    const { offer, position } = selectedApplication;
    const result = await callApi("apply-for-position", { electionId: offer.electionId, positionId: position.id, mandate });
    dialog.close();
    say(result.message || "Your application has been submitted.");
    await refresh();
  } catch (error) {
    say(error.message || "Unable to submit your application.", true);
  } finally {
    busy = false; submit.disabled = false; submit.textContent = "Submit application";
  }
});

try {
  const account = await initStudentPage();
  if (account) await refresh();
} catch (error) {
  console.error("Applications page error:", error);
  say(error.message || "Unable to load applications.", true);
  offersRoot.replaceChildren(node("p", "empty-note", "Please refresh the page to try again."));
}
