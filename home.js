import { auth, db, waitUser, noticesApi, ago, el } from "./nunsa-client.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const ui = { election: $("home-election"), stats: $("home-stats"), timeline: $("home-timeline"), candidates: $("home-candidates"), announcements: $("home-announcements"), status: $("home-status") };
const toMs = value => value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() : 0;
const dateLabel = value => { const t = toMs(value); return t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "To be announced"; };
/* After an election ends the dashboard shows its result link for this long, then goes back to normal. */
const RESULTS_WINDOW_MS = 2 * 60 * 60 * 1000;
const matricKey = value => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

async function getJson(path) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
  if (!response.ok || data.success !== true) throw new Error(data.message || "Unable to load this section.");
  return data;
}

function section(title, href, linkLabel = "See all →") {
  const box = el("section", "home-section");
  const head = el("div", "section-heading");
  const left = el("div", "");
  left.append(el("h2", "", title));
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
  heading.append(el("h2", "", "Timeline"));
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

function renderElection(election, overview, stage, actionHref, actionText, voting) {
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
  if (stage === 2 && voting?.known && voting.hasVoted) hero.append(el("p", "hero-note", "You have voted."));
  else if (stage === 2 && voting?.known && !voting.eligible) hero.append(el("p", "hero-note", "Not eligible to vote in this election"));
  else if (actionHref) { const action = el("a", "hero-action", actionText); action.href = actionHref; hero.append(action); }
  ui.election.append(hero);
  const positions = overview?.totalPositions ?? 0;
  const candidates = overview?.totalCandidates ?? 0;
  ui.stats.replaceChildren(makeStats(positions, candidates, ["Applications", "Screening", "Voting", "Results"][stage] || "Pending"));
}

async function loadVotingState(election) {
  /* The matric number in the signed token survives new tabs and refreshes; sessionStorage does not. */
  const claim = String((await auth.currentUser.getIdTokenResult()).claims.matricNumber || "").trim().toUpperCase();
  if (!claim || !election || !["published", "ended"].includes(election.status)) return { known: false };
  const voterId = `${election.id}_${matricKey(claim)}`;

  /* The rules deny a read of a record that is missing or belongs to someone else, so "permission-denied" here means "no such record for you". */
  const exists = async (name) => {
    try {
      const snap = await getDoc(doc(db, name, voterId));
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      if (error.code === "permission-denied") return null;
      throw error;
    }
  };

  try {
    const [vote, voter] = await Promise.all([exists("votes"), exists("voters")]);
    return { known: true, hasVoted: Boolean(vote), eligible: Boolean(voter) && voter.status === "active" };
  } catch (error) {
    console.warn("Personal vote status unavailable:", error.code || error.message);
    return { known: false };
  }
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
  const wrap = section("Meet the candidates", `candidate-directory.html?electionId=${encodeURIComponent(election.id)}`);
  const strip = el("div", "candidate-strip");
  overview.candidates.slice(0, 8).forEach(candidate => {
    const link = el("a", "candidate-mini");
    link.href = `candidate.html?electionId=${encodeURIComponent(election.id)}&id=${encodeURIComponent(candidate.id)}`;
    const img = el("img"); img.src = candidate.profilePicture || "assets/default-profile.jpg"; img.alt = `Photo of ${candidate.name}`;
    img.onerror = () => { img.src = "assets/default-profile.jpg"; };
    link.append(img, el("strong", "", candidate.name), el("small", "", candidate.position), el("span", "candidate-mandate-link", "Read mandate →"));
    strip.append(link);
  });
  wrap.append(strip); ui.candidates.replaceChildren(wrap);
}

async function renderAnnouncements() {
  try {
    const data = await noticesApi();
    const wrap = section("Announcements", "announcements.html", "All announcements →");
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
  const wrap = section("My status", null);
  const grid = el("div", "status-grid");

  const apps = (forms.applications || []).slice().sort((a, b) =>
    Number(b.electionId === election?.id) - Number(a.electionId === election?.id) || Number(b.status === "applied") - Number(a.status === "applied"));
  const application = apps[0];
  const onBallot = application && application.status === "applied" && ["published", "ended"].includes(application.electionStatus);
  const appPanel = el("div", "status-panel" + (application ? " applied" : ""));
  appPanel.append(el("span", "status-label", !application ? "APPLICATIONS" : onBallot ? "CANDIDATE" : application.status.toUpperCase()));
  appPanel.append(el("strong", "", application ? application.position : "Your application"));
  const appLine = !application ? ((forms.offers || []).length ? "Applications are open. Apply for an available position." : "No application period is open right now.")
    : application.status === "disqualified" ? "Disqualified" : onBallot ? "On the ballot" : "Under screening";
  appPanel.append(el("p", "", application ? `${application.electionTitle || "Election"} · ${appLine}` : appLine));
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
  const ended = elections.filter(e => (e.status === "ended" || (e.status === "published" && e.endMs && e.endMs <= now)) && e.endMs && now - e.endMs < RESULTS_WINDOW_MS).sort((a, b) => b.endMs - a.endMs)[0];
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
    const voting = stage === 2 ? await loadVotingState(election) : { known: false };
    renderElection(election, overview, stage, actionHref, actionText, voting);
    const labels = stage === 0 ? ["Open", "Next", "Upcoming", "Upcoming"] : stage === 1 ? ["Completed", "Completed", dateLabel(election.startAt), dateLabel(election.endAt)] : stage === 2 ? ["Completed", "Completed", `${dateLabel(election.startAt)} – ${dateLabel(election.endAt)}`, "Upcoming"] : ["Completed", "Completed", "Completed", dateLabel(election.endAt)];
    ui.timeline.replaceChildren(makeTimeline(stage, labels));
    if (stage === 3) ui.candidates.replaceChildren(); else await renderCandidates(election, overview);
  } else {
    const emptyHero = el("section", "election-hero election-empty");
    emptyHero.append(el("h2", "", "No active elections"));
    emptyHero.append(el("p", "election-subtitle", "There are no active elections or open application periods right now. Check back here for the next update."));
    ui.election.replaceChildren(emptyHero);
    ui.stats.replaceChildren(); ui.timeline.replaceChildren(); ui.candidates.replaceChildren();
  }
  await renderAnnouncements();
  await renderStatus(election, forms, me);
}

init().catch(error => {
  console.error("Student homepage error:", error);
  if (ui.election) ui.election.replaceChildren(el("p", "inline-message", "Some election information could not be loaded. Refresh to try again."));
});
