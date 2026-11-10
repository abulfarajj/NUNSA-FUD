/*
 * Dashboard hero/carousel state selector.
 * Keeps the student dashboard presentation aligned with the election lifecycle:
 * application/screening and voting use an election card; finalized results keep
 * the card visible for at least 24 hours; then current office holders may appear.
 */
export const RESULTS_WINDOW_MS = 24 * 60 * 60 * 1000;

function validTime(value) {
  if (value == null || value === "") return 0;
  const ms = typeof value === "number" ? value : value?.toMillis ? value.toMillis() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function selectDashboardView({
  now = Date.now(),
  elections = [],
  lifecycleElections = [],
  currentOffices = []
} = {}) {
  const live = elections
    .filter(e => e.status === "published" && validTime(e.startAt) <= now && now < validTime(e.endAt))
    .sort((a, b) => validTime(a.endAt) - validTime(b.endAt))[0];
  if (live) return { mode: "election", election: live, stage: 3, reason: "voting_open" };

  const upcoming = elections
    .filter(e => e.status === "published" && validTime(e.startAt) > now)
    .sort((a, b) => validTime(a.startAt) - validTime(b.startAt))[0];
  if (upcoming) return { mode: "election", election: upcoming, stage: 2, reason: "voting_published" };

  const ended = elections
    .filter(e => {
      const endAt = validTime(e.endAt);
      const finalizedAt = e.finalized === true ? validTime(e.finalizedAt) : 0;
      const hasEndedEvidence = endAt > 0 || finalizedAt > 0;
      return hasEndedEvidence && (
        e.status === "ended" ||
        (e.status === "published" && endAt > 0 && endAt <= now) ||
        (e.finalized === true && finalizedAt > 0 && finalizedAt <= now)
      );
    })
    .sort((a, b) => (validTime(b.endAt) || validTime(b.finalizedAt)) - (validTime(a.endAt) || validTime(a.finalizedAt)))[0];
  if (ended) {
    // Office recognition changes immediately when finalization succeeds, but
    // the dashboard keeps the results card for 24 hours from finalizedAt.
    // Never start this window at voting end: finalization may happen later.
    const finalizedAt = validTime(ended.finalizedAt);
    const hasFinalizedTimestamp = ended.finalized === true && finalizedAt > 0;
    const ageSinceFinalization = hasFinalizedTimestamp ? now - finalizedAt : -1;
    const keepResults = !hasFinalizedTimestamp || ageSinceFinalization < RESULTS_WINDOW_MS;
    if (keepResults) {
      const reason = !hasFinalizedTimestamp
        ? "awaiting_finalization"
        : "results_grace_period";
      return { mode: "election", election: ended, stage: 4, reason };
    }
  }

  const draft = lifecycleElections
    .filter(e => ["applications_open", "screening"].includes(e.phase))
    .sort((a, b) => validTime(b.createdAt) - validTime(a.createdAt))[0];
  if (draft) {
    return {
      mode: "election",
      election: { id: draft.electionId, title: draft.title, status: "draft", createdAt: draft.createdAt },
      stage: draft.phase === "applications_open" ? 0 : 1,
      reason: draft.phase
    };
  }

  if (Array.isArray(currentOffices) && currentOffices.length) {
    return { mode: "office_carousel", offices: currentOffices };
  }
  return { mode: "empty" };
}
