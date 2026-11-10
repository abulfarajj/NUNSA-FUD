import { auth, db, waitUser, noticesApi, ago, el } from "./nunsa-client.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { bindProfilePreview } from "./profile-preview.js";
import { selectDashboardView, RESULTS_WINDOW_MS } from "./dashboard-state.mjs";

const $ = id => document.getElementById(id);
const ui = { election: $("home-election"), stats: $("home-stats"), timeline: $("home-timeline"), candidates: $("home-candidates"), announcements: $("home-announcements"), status: $("home-status") };
bindProfilePreview(ui.candidates);
bindProfilePreview(ui.election);
const toMs = value => value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() : 0;
const dateLabel = value => { const t = toMs(value); return t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "To be announced"; };
/* After results are finalized, keep the View Results card for 24 hours before showing the office carousel. */

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
  const statusText = [
    "APPLICATIONS OPEN",
    "SCREENING IN PROGRESS",
    "VOTING PUBLISHED",
    "VOTING OPEN",
    "RESULTS AVAILABLE"
  ][stage] || "ELECTION UPDATE";
  hero.append(el("p", "eyebrow", statusText));
  hero.append(el("h2", "", election?.title || "NUNSA-FUD Elections"));
  const subtitle = [
    "Applications are open. Review the available positions.",
    "Applications are being reviewed by the electoral committee.",
    "The election has been published. Voting will begin at the scheduled time.",
    "Your vote matters. Cast it before the deadline.",
    "The election has ended. View the results and official outcome."
  ][stage] || "Election information will appear here when available.";
  hero.append(el("p", "election-subtitle", subtitle));
  const end = toMs(election?.endAt), start = toMs(election?.startAt);
  if (stage === 3 && end > Date.now()) {
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
  } else if (stage === 2 && start > Date.now()) {
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
  } else if (stage === 4 && end) {
    hero.append(el("p", "election-subtitle", `Voting closed ${new Date(end).toLocaleString()}.`));
    if (overview?.finalized !== true) hero.append(el("p", "hero-note", "These totals remain provisional until results are officially finalized."));
  }
  if (stage === 3 && voting?.known && voting.hasVoted) hero.append(el("p", "hero-note", "You have voted."));
  else if (stage === 3 && voting?.known && !voting.eligible) hero.append(el("p", "hero-note", "Not eligible to vote in this election"));
  else if (actionHref) { const action = el("a", "hero-action", actionText); action.href = actionHref; hero.append(action); }
  ui.election.append(hero);
  const positions = overview?.totalPositions ?? 0;
  const candidates = overview?.totalCandidates ?? 0;
  ui.stats.replaceChildren(makeStats(positions, candidates, ["Applications", "Screening", "Published", "Voting", "Results"][stage] || "Pending"));
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
  const byId = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));

  // Keep finalized archive entries visible even if an election metadata
  // document was manually removed. The archive endpoint derives these entries
  // from immutable finalized results; it never invents provisional elections.
  try {
    const history = await getJson("/.netlify/functions/get-election-history");
    for (const item of history.elections || []) {
      if (item.finalized === true) {
        const existing = byId.get(item.id);
        byId.set(item.id, existing
          ? { ...existing, finalized: true, finalizedAt: item.finalizedAt || existing.finalizedAt || null }
          : { ...item, status: "ended" });
      }
    }
  } catch (error) {
    console.warn("Historical election metadata unavailable:", error.message);
  }

  return [...byId.values()].map(e => ({
    ...e,
    startMs: toMs(e.startAt),
    endMs: toMs(e.endAt) || (e.finalized === true ? toMs(e.finalizedAt) : 0)
  }));
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
    const card = el("div", "candidate-mini");
    const infoHref = candidate.studentProfileId
      ? `student-profile-view.html?id=${encodeURIComponent(candidate.studentProfileId)}&electionId=${encodeURIComponent(election.id)}&candidateId=${encodeURIComponent(candidate.id)}`
      : `candidate.html?electionId=${encodeURIComponent(election.id)}&id=${encodeURIComponent(candidate.id)}`;
    const picture = el("button", "candidate-mini-picture");
    picture.type = "button";
    picture.dataset.profilePreview = "true";
    picture.dataset.profileName = candidate.name || "Student";
    picture.dataset.profilePicture = candidate.profilePicture || "assets/default-profile.jpg";
    picture.dataset.profileRole = candidate.position || "Candidate";
    picture.dataset.profileInfoHref = infoHref;
    picture.setAttribute("aria-label", `Preview ${candidate.name || "student"}'s profile picture`);
    const img = el("img"); img.src = candidate.profilePicture || "assets/default-profile.jpg"; img.alt = `Photo of ${candidate.name}`;
    img.onerror = () => { img.src = "assets/default-profile.jpg"; };
    picture.append(img);
    const name = el("a", "candidate-mini-name", candidate.name || "Student"); name.href = infoHref;
    const position = el("small", "", candidate.position || "Candidate");
    const profile = el("a", "candidate-mini-profile", "View profile →"); profile.href = infoHref;
    card.append(picture, name, position, profile);
    strip.append(card);
  });
  wrap.append(strip); ui.candidates.replaceChildren(wrap);
}

function renderOfficeCarousel(offices) {
  ui.election.replaceChildren();
  const wrap = el("section", "home-office-carousel");
  const heading = el("div", "office-carousel-heading");
  heading.append(el("p", "eyebrow", "NUNSA-FUD LEADERSHIP"));
  heading.append(el("h2", "", "Current office holders"));
  heading.append(el("p", "", "Meet the students currently serving in each office."));
  wrap.append(heading);
  const track = el("div", "office-holder-track");
  offices.forEach(office => {
    const card = el("article", "office-holder-card");
    const profileHref = office.studentProfileId
      ? `student-profile-view.html?id=${encodeURIComponent(office.studentProfileId)}`
      : "#";
    const picture = el("button", "office-holder-picture");
    picture.type = "button";
    picture.dataset.profilePreview = "true";
    picture.dataset.profileName = office.name || "Student";
    picture.dataset.profilePicture = office.profilePicture || "assets/default-profile.jpg";
    picture.dataset.profileRole = `Current ${office.position}`;
    picture.dataset.profileInfoHref = profileHref;
    picture.setAttribute("aria-label", `Preview ${office.name || "office holder"}'s profile picture`);
    const img = el("img"); img.src = office.profilePicture || "assets/default-profile.jpg"; img.alt = `${office.name || "Office holder"} profile picture`;
    img.onerror = () => { img.src = "assets/default-profile.jpg"; };
    picture.append(img);
    const position = el("p", "office-holder-position", office.position);
    const name = el("a", "office-holder-name", office.name || "NUNSA-FUD Student"); name.href = profileHref;
    const view = el("a", "office-holder-view-profile", "View profile →"); view.href = profileHref;
    card.append(picture, position, name, view);
    track.append(card);
  });
  wrap.append(track);
  ui.election.append(wrap);
  ui.stats.replaceChildren();
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
    Number(b.electionId === election?.id) - Number(a.electionId === election?.id) || Number(b.finalized) - Number(a.finalized));
  const application = apps[0];
  const appPanel = el("div", "status-panel" + (application ? " applied" : ""));
  appPanel.append(el("span", "status-label", !application ? "APPLICATIONS" : (application.statusLabel || application.status || "Status unavailable").toUpperCase()));
  appPanel.append(el("strong", "", application ? application.position : "Your application"));
  const appLine = !application
    ? ((forms.offers || []).length ? "Applications are open. Apply for an available position." : "No application period is open right now.")
    : (application.statusMessage || application.statusLabel || "Your application status is being checked.");
  appPanel.append(el("p", "", application ? `${application.electionTitle || "Election"} · ${appLine}` : appLine));
  grid.append(appPanel);

  if (me?.offices?.length) {
    const officePanel = el("div", "status-panel office-status");
    officePanel.append(el("span", "status-label", "CURRENT OFFICE"));
    officePanel.append(el("strong", "", me.offices.map(o => o.position).join(", ")));
    officePanel.append(el("p", "", "Your representative publishing access is active until the published tenure end date or a new election's results are finalized.")); grid.append(officePanel);
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
  const hasLiveOrUpcoming = elections.some(e =>
    (e.status === "published" && e.startMs <= now && now < e.endMs) ||
    (e.status === "published" && e.startMs > now)
  );
  const latestEnded = hasLiveOrUpcoming ? null : elections
    .filter(e => (e.status === "ended" || (e.status === "published" && e.endMs && e.endMs <= now)) && e.endMs)
    .sort((a, b) => b.endMs - a.endMs)[0];
  let endedOverview = latestEnded ? await loadOverview(latestEnded.id) : null;
  // A finalized results record can outlive a manually deleted elections
  // document. In that case get-election-overview correctly returns 404, while
  // the authenticated archive still supplies the immutable finalization time.
  if (!endedOverview && latestEnded?.finalized === true) {
    endedOverview = {
      finalized: true,
      finalizedAt: toMs(latestEnded.finalizedAt),
      totalCandidates: 0,
      totalPositions: 0
    };
  }
  const electionsForView = latestEnded
    ? elections.map(e => e.id === latestEnded.id ? {
        ...e,
        finalized: endedOverview?.finalized === true,
        finalizedAt: endedOverview?.finalizedAt || e.finalizedAt || null
      } : e)
    : elections;

  const view = selectDashboardView({
    now,
    elections: electionsForView,
    lifecycleElections: forms.lifecycleElections || [],
    currentOffices: me?.currentOffices || []
  });

  if (view.mode === "election") {
    const election = view.election;
    const stage = view.stage;
    let overview = stage === 4 ? endedOverview : null;
    if (stage >= 2 && stage !== 4) overview = await loadOverview(election.id);
    const actionHref = stage === 0 || stage === 1
      ? "student-applications.html"
      : stage === 4
        ? `results.html?id=${encodeURIComponent(election.id)}`
        : "voter-portal.html";
    const actionText = stage === 0 ? "APPLY FOR A POSITION"
      : stage === 1 ? "VIEW APPLICATION STATUS"
        : stage === 4 ? "VIEW RESULTS"
          : stage === 3 ? "VOTE NOW" : "VIEW ELECTION";
    const voting = stage === 3 ? await loadVotingState(election) : { known: false };
    renderElection(election, overview, stage, actionHref, actionText, voting);
    const timelineStage = stage === 0 ? 0 : stage === 1 ? 1 : (stage === 2 || stage === 3) ? 2 : 3;
    const labels = stage === 0 ? ["Open", "Next", "Upcoming", "Upcoming"]
      : stage === 1 ? ["Completed", "In progress", "Upcoming", "Upcoming"]
        : stage === 2 ? ["Completed", "Completed", dateLabel(election.startAt), dateLabel(election.endAt)]
          : stage === 3 ? ["Completed", "Completed", `${dateLabel(election.startAt)} – ${dateLabel(election.endAt)}`, "Upcoming"]
            : ["Completed", "Completed", "Completed", dateLabel(election.endAt)];
    ui.timeline.replaceChildren(makeTimeline(timelineStage, labels));
    if (stage === 2 || stage === 3) await renderCandidates(election, overview);
    else ui.candidates.replaceChildren();
  } else if (view.mode === "office_carousel") {
    renderOfficeCarousel(view.offices);
    ui.timeline.replaceChildren();
    ui.candidates.replaceChildren();
  } else {
    const emptyHero = el("section", "election-hero election-empty");
    emptyHero.append(el("h2", "", "No active elections"));
    emptyHero.append(el("p", "election-subtitle", "There are no active elections or recognised office holders right now. Check back here for the next update."));
    ui.election.replaceChildren(emptyHero);
    ui.stats.replaceChildren();
    ui.timeline.replaceChildren();
    ui.candidates.replaceChildren();
  }
  await renderAnnouncements();
  await renderStatus(view.mode === "election" ? view.election : null, forms, me);
}

init().catch(error => {
  console.error("Student homepage error:", error);
  if (ui.election) ui.election.replaceChildren(el("p", "inline-message", "Some election information could not be loaded. Refresh to try again."));
});
