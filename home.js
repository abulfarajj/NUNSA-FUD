import { auth, db, waitUser, noticesApi, ago, el } from "./nunsa-client.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const ui = { election: $("home-election"), stats: $("home-stats"), timeline: $("home-timeline"), candidates: $("home-candidates"), announcements: $("home-announcements"), status: $("home-status") };
const toMs = value => value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() : 0;
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "To be announced";
const matricKey = value => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

async function getJson(path) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
  if (!response.ok || data.success !== true) throw new Error(data.message || "Unable to load this section.");
  return data;
}

function section(title, eyebrow, href, linkLabel = "See all →") {
  const box = el("section", "home-section");
  const head = el("div", "section-heading");
  const left = el("div", "");
  left.append(el("p", "eyebrow", eyebrow), el("h2", "", title));
  head.append(left);
  if (href) { const link = el("a", "section-link", linkLabel); link.href = href; head.append(link); }
  box.append(head);
  return box;
}

function makeStats(positions, candidates, stage) {
  const wrap = el("section", "home-stats");
  for (const [value, label] of [[positions, "Positions"], [candidates, "Candidates"], [stage, "Current stage"]]) {
    const item = el("div", "home-stat");
    item.append(el("strong", "", String(value)), el("span", "", label));
    wrap.append(item);
  }
  return wrap;
}

function makeTimeline(stageIndex, labels) {
  const wrap = el("section", "home-section");
  const heading = el("div", "section-heading");
  heading.append(el("p", "eyebrow", "ELECTION TIMELINE"));
  wrap.append(heading);
  const panel = el("div", "timeline-wrap");
  const track = el("div", "timeline-track");
  ["Applications", "Screening", "Voting", "Results"].forEach((name, i) => {
    const step = el("div", "timeline-step" + (i < stageIndex ? " done" : "") + (i === stageIndex ? " current" : ""));
    step.append(el("span", "timeline-dot"), el("strong", "", name), el("small", "", labels?.[i] || ""));
    track.append(step);
  });
  panel.append(track); wrap.append(panel); return wrap;
}

function renderElection(election, overview, stage, actionHref, actionText) {
  ui.election.replaceChildren();
  const hero = el("section", "election-hero");
  const statusText = ["APPLICATIONS OPEN", "SCREENING IN PROGRESS", "VOTING OPEN", "RESULTS AVAILABLE"][stage] || "ELECTION UPDATE";
  hero.append(el("p", "eyebrow", statusText));
  hero.append(el("h2", "", election?.title || "NUNSA-FUD Elections"));
  const subtitle = [
    "Applications are open. Review the available positions.",
    "Applications are being reviewed by the electoral committee.",
    "Your vote matters. Cast it before the deadline.",
    "The election has ended. View the published outcome."
  ][stage] || "Election information will appear here when available.";
  hero.append(el("p", "election-subtitle", subtitle));
  const end = toMs(election?.endAt), start = toMs(election?.startAt);
  if (stage === 2 && end > Date.now()) {
    const progress = el("div", "election-progress");
    const bar = document.createElement("span");
    bar.style.width = `${Math.max(0, Math.min(100, ((Date.now() - start) / Math.max(1, end - start)) * 100))}%`;
    progress.append(bar); hero.append(progress);
    const row = el("div", "election-time-row");
    row.append(el("span", "", `Opened ${dateLabel(start)}`));
    const close = el("span", "", "Calculating closing time…"); row.append(close); hero.append(row);
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.floor((end - Date.now()) / 1000));
      const days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24;
      const minutes = Math.floor(seconds / 60) % 60;
      close.textContent = seconds ? `Closes in ${days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`}` : "Voting has closed";
      if (!seconds) clearInterval(timer);
    }, 1000);
  } else if (stage === 1 && start > Date.now()) {
    const row = el("div", "election-time-row");
    row.append(el("span", "", `Opens ${new Date(start).toLocaleString()}`));
    const countdown = el("span", "", "Calculating opening time…");
    row.append(countdown); hero.append(row);
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.floor((start - Date.now()) / 1000));
      const days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24;
      const minutes = Math.floor(seconds / 60) % 60, secs = seconds % 60;
      countdown.textContent = seconds ? `Opens in ${days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${secs}s`}` : "Voting is opening";
      if (!seconds) clearInterval(timer);
    }, 1000);
  } else if (stage === 3 && end) {
    hero.append(el("p", "election-subtitle", `Voting closed ${new Date(end).toLocaleString()}.`));
  }
  if (actionHref) { const action = el("a", "hero-action", actionText); action.href = actionHref; hero.append(action); }
  ui.election.append(hero);
  const positions = overview?.totalPositions ?? 0;
  const candidates = overview?.totalCandidates ?? 0;
  ui.stats.replaceChildren(makeStats(positions, candidates, ["Applications", "Screening", "Voting", "Results"][stage] || "Pending"));
}

async function loadPublishedElections() {
  const snap = await getDocs(query(collection(db, "elections"), where("status", "in", ["published", "ended"])));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), startMs: toMs(d.data().startAt), endMs: toMs(d.data().endAt) }));
}
async function loadFormStatus() {
  try { return await getJson("/.netlify/functions/get-form-offers"); }
  catch (error) { console.warn("Application status unavailable:", error.message); return { offers: [], applications: [] }; }
}
async function loadOverview(electionId) {
  try { return await getJson(`/.netlify/functions/get-election-overview?electionId=${encodeURIComponent(electionId)}`); }
  catch (error) { console.warn("Election overview unavailable:", error.message); return null; }
}

async function renderCandidates(election, overview) {
  if (!election || !overview?.candidates?.length) { ui.candidates.replaceChildren(); return; }
  const wrap = section("Meet the candidates", "ON THE BALLOT", `candidate-directory.html?electionId=${encodeURIComponent(election.id)}`);
  const strip = el("div", "candidate-strip");
  overview.candidates.slice(0, 8).forEach(candidate => {
    const link = el("a", "candidate-mini");
    link.href = `candidate.html?electionId=${encodeURIComponent(election.id)}&id=${encodeURIComponent(candidate.id)}`;
    const img = el("img"); img.src = candidate.profilePicture || "assets/default-profile.jpg"; img.alt = "";
    img.onerror = () => { img.src = "assets/default-profile.jpg"; };
    link.append(img, el("strong", "", candidate.name), el("small", "", candidate.position), el("span", "candidate-mandate-link", "Read mandate →"));
    strip.append(link);
  });
  wrap.append(strip); ui.candidates.replaceChildren(wrap);
}

async function renderAnnouncements() {
  try {
    const data = await noticesApi();
    const wrap = section("Announcements", "NOTICE BOARD", "announcements.html", "All announcements →");
    const feed = el("div", "notice-feed");
    if (!data.success || !data.announcements?.length) {
      feed.append(el("p", "empty-note", "No announcements have been published yet."));
    } else {
      data.announcements.slice(0, 3).forEach(item => {
        const row = el("a", "notice-row"); row.href = `/a/${encodeURIComponent(item.id)}`;
        row.append(el("span", "notice-marker"));
        const copy = el("div", "");
        copy.append(el("strong", "", item.title));
        if (item.body) copy.append(el("p", "", item.body.length > 125 ? item.body.slice(0, 125) + "…" : item.body));
        const author = [item.authorName, item.authorPosition].filter(Boolean).join(" · ");
        copy.append(el("small", "", `${author || "NUNSA-FUD"} · ${ago(item.createdAt)}`));
        row.append(copy); feed.append(row);
      });
    }
    wrap.append(feed); ui.announcements.replaceChildren(wrap); return data;
  } catch (error) {
    console.warn("Announcements unavailable:", error.message); ui.announcements.replaceChildren(); return null;
  }
}

async function renderStatus(election, forms, me) {
  const wrap = section("My status", "YOUR ELECTION ACTIVITY", null);
  const grid = el("div", "status-grid");
  const matric = sessionStorage.getItem("studentMatricNumber") || "";
  let hasVoted = false, eligible = false;
  if (election && matric && ["published", "ended"].includes(election.status)) {
    const voterId = `${election.id}_${matricKey(matric)}`;
    try {
      const [vote, voter] = await Promise.all([getDoc(doc(db, "votes", voterId)), getDoc(doc(db, "voters", voterId))]);
      hasVoted = vote.exists(); eligible = voter.exists() && voter.data().status === "active";
    } catch (error) { console.warn("Personal vote status unavailable:", error.code || error.message); }
  }
  const votePanel = el("div", "status-panel" + (hasVoted ? " applied" : eligible ? " pending" : ""));
  votePanel.append(el("span", "status-label", hasVoted ? "VOTED" : eligible ? "NOT VOTED" : "VOTING STATUS"));
  votePanel.append(el("strong", "", hasVoted ? "Your vote is recorded" : eligible ? "Your vote" : "No active ballot"));
  votePanel.append(el("p", "", hasVoted ? "Your ballot has been submitted." : eligible ? "You are eligible to vote. Open the election before it closes." : "Your eligibility will appear when an election is open."));
  grid.append(votePanel);

  const application = (forms.applications || []).slice().sort((a, b) => Number(b.status === "applied") - Number(a.status === "applied"))[0];
  const appPanel = el("div", "status-panel" + (application ? " applied" : ""));
  appPanel.append(el("span", "status-label", application ? application.status.toUpperCase() : "APPLICATIONS"));
  appPanel.append(el("strong", "", application ? application.position : "Your application"));
  appPanel.append(el("p", "", application ? `${application.electionTitle || "Election"} · ${application.status === "applied" ? "Under screening" : application.status}` : (forms.offers || []).length ? "Applications are open. Apply for an available position." : "No submitted applications."));
  grid.append(appPanel);

  if (me?.offices?.length) {
    const officePanel = el("div", "status-panel office-status");
    officePanel.append(el("span", "status-label", "ELECTED POSITION"));
    officePanel.append(el("strong", "", me.offices.map(o => o.position).join(", ")));
    officePanel.append(el("p", "", "Your representative publishing access is active.")); grid.append(officePanel);
  }
  wrap.append(grid); ui.status.replaceChildren(wrap);
}

async function init() {
  const user = await waitUser(); if (!user) return;
  const [elections, forms, me] = await Promise.all([
    loadPublishedElections().catch(error => { console.warn("Election list unavailable:", error); return []; }),
    loadFormStatus(),
    noticesApi(null, "?me=1").catch(() => null)
  ]);
  const now = Date.now();
  const live = elections.filter(e => e.status === "published" && e.startMs <= now && now < e.endMs).sort((a, b) => a.endMs - b.endMs)[0];
  const upcoming = elections.filter(e => e.status === "published" && e.startMs > now).sort((a, b) => a.startMs - b.startMs)[0];
  const ended = elections.filter(e => e.status === "ended" || (e.status === "published" && e.endMs && e.endMs <= now)).sort((a, b) => b.endMs - a.endMs)[0];
  const applicationOffer = (forms.offers || [])[0];
  let election = live || upcoming || ended || null;
  let stage = live ? 2 : upcoming ? 1 : ended ? 3 : -1;
  let overview = election ? await loadOverview(election.id) : null;
  if (applicationOffer && (!election || (!live && !upcoming && stage === 3))) {
    election = { id: applicationOffer.electionId, title: applicationOffer.title, status: "draft" };
    stage = 0; overview = { totalPositions: applicationOffer.positions.length, totalCandidates: 0, candidates: [] };
  }
  if (election) {
    const actionHref = stage === 0 ? "student-applications.html" : stage === 3 ? `results.html?id=${encodeURIComponent(election.id)}` : `voter-portal.html`;
    const actionText = stage === 0 ? "APPLY FOR A POSITION" : stage === 3 ? "VIEW RESULTS" : stage === 2 ? "VOTE NOW" : "VIEW ELECTION";
    renderElection(election, overview, stage, actionHref, actionText);
    const labels = stage === 0 ? ["Open", "Next", "Upcoming", "Upcoming"] : stage === 1 ? ["Completed", "Completed", dateLabel(election.startAt), dateLabel(election.endAt)] : stage === 2 ? ["Completed", "Completed", `${dateLabel(election.startAt)} – ${dateLabel(election.endAt)}`, "Upcoming"] : ["Completed", "Completed", "Completed", dateLabel(election.endAt)];
    ui.timeline.replaceChildren(makeTimeline(stage, labels));
    await renderCandidates(election, overview);
  } else {
    ui.election.replaceChildren(el("section", "empty-election", "There is no active election or open application period right now."));
    ui.stats.replaceChildren(); ui.timeline.replaceChildren(); ui.candidates.replaceChildren();
  }
  await renderAnnouncements();
  await renderStatus(election, forms, me);
}

init().catch(error => {
  console.error("Student homepage error:", error);
  if (ui.election) ui.election.replaceChildren(el("p", "inline-message", "Some election information could not be loaded. Refresh to try again."));
});
