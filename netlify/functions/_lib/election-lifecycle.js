/*
 * Shared lifecycle vocabulary for applications, elections and results.
 * The stored election status is a publication state (draft/published, with
 * ended retained for older records). Time and a finalized results document
 * determine the public lifecycle phase; no interface invents its own result.
 */
function toDate(value) {
    if (!value) return null;
    const date = value && typeof value.toDate === "function"
        ? value.toDate()
        : value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toMillis(value) {
    const date = toDate(value);
    return date ? date.getTime() : 0;
}

function isFinalizedResults(result) {
    // The finalizer persists a server-generated finalizedAt timestamp. A bare
    // result document or a boolean flag alone is not enough to prove that the
    // transaction completed successfully.
    return Boolean(result && Array.isArray(result.positions) && toMillis(result.finalizedAt) > 0);
}

function getElectionPhase(election, options = {}) {
    const now = options.now == null ? Date.now() : Number(options.now);
    const finalized = options.finalized === true;
    const hasApplications = options.hasApplications === true;
    if (!election) return "unavailable";
    if (finalized) return "results_finalized";
    if (election.archivedAt || election.status === "archived") return "archived";

    if (election.status === "draft") {
        if (election.formsOpen === true) return "applications_open";
        return hasApplications ? "screening" : "draft";
    }

    if (election.status !== "published" && election.status !== "ended") return "unknown";

    const startAt = toMillis(election.startAt);
    const endAt = toMillis(election.endAt);
    if (!startAt || !endAt || endAt <= startAt) return "invalid_schedule";
    if (election.status === "ended" || now >= endAt) return "voting_ended";
    if (now < startAt) return "voting_published";
    return "voting_open";
}

function applicationOutcome(application, election, result, options = {}) {
    if (!application) return { code: "unknown", label: "Status unavailable", message: "Application record is unavailable." };
    if (application.status === "disqualified") {
        const reason = String(application.disqualifiedReason || "").trim();
        return {
            code: "disqualified",
            label: "Disqualified",
            message: reason ? `You were disqualified during screening. Reason: ${reason}` : "You were disqualified during screening."
        };
    }
    if (!election) {
        return { code: "election_unavailable", label: "Election unavailable", message: "The election record is missing. Your application has been preserved for review." };
    }

    const hasFinalResults = isFinalizedResults(result);
    const phase = getElectionPhase(election, {
        now: options.now,
        finalized: hasFinalResults,
        hasApplications: true
    });

    if (phase === "results_finalized") {
        const wantedPosition = String(application.position || "").trim().replace(/\s+/g, " ").toLowerCase();
        const position = result.positions.find(item =>
            String(item.position || "").trim().replace(/\s+/g, " ").toLowerCase() === wantedPosition
        );
        if (!position) {
            return { code: "not_elected", label: "Not elected", message: "The finalized result does not list your position." };
        }
        const candidates = Array.isArray(position.candidates) ? position.candidates : [];
        const candidate = candidates.find(item => String(item.id) === String(application.candidateId));
        if (!candidate) {
            return { code: "not_elected", label: "Not elected", message: "You were not included in the finalized candidate results." };
        }
        const votes = candidates.map(item => Math.max(0, Number(item.votes) || 0));
        const topVotes = Math.max(0, ...votes);
        if (topVotes === 0) {
            return { code: "no_votes", label: "No valid votes", message: "No valid votes were recorded for this position. No office holder was elected." };
        }
        const leaders = candidates.filter(item => (Number(item.votes) || 0) === topVotes);
        if (leaders.length > 1) {
            return { code: "tie", label: "Tie — unresolved", message: "The finalized result is tied. No office holder has been selected for this position." };
        }
        if (String(leaders[0].id) === String(candidate.id)) {
            return { code: "elected", label: "Elected", message: "You were elected in the finalized results." };
        }
        return { code: "not_elected", label: "Not elected", message: "Another candidate received more valid votes." };
    }

    if (phase === "draft" || phase === "applications_open") {
        return { code: "applied", label: "Submitted", message: "Your application has been received." };
    }
    if (phase === "screening") {
        return { code: "screening", label: "Under screening", message: "Your application is awaiting the electoral committee's screening decision." };
    }
    if (["voting_published", "voting_open", "voting_ended"].includes(phase) && options.candidateEligible === false) {
        return { code: "not_on_ballot", label: "Not on the ballot", message: "Your application was not included as an eligible candidate for this election." };
    }
    if (phase === "voting_published") {
        return { code: "candidate", label: "On the ballot", message: "You have been approved for the ballot. Voting has not started yet." };
    }
    if (phase === "voting_open") {
        return { code: "candidate", label: "Candidate — voting open", message: "You are on the ballot while voting is open." };
    }
    if (phase === "voting_ended") {
        return { code: "awaiting_results", label: "Awaiting results", message: "Voting has ended. Your outcome will be shown after results are finalized." };
    }
    if (phase === "archived") {
        return { code: "archived", label: "Historical election", message: "This election is archived. Its application record has been retained." };
    }
    return { code: "unknown", label: "Status unavailable", message: "The election status could not be determined." };
}

function positionOutcome(position) {
    const candidates = Array.isArray(position && position.candidates) ? position.candidates : [];
    const topVotes = Math.max(0, ...candidates.map(candidate => Math.max(0, Number(candidate.votes) || 0)));
    if (!candidates.length) return { status: "no_candidates", winnerId: null };
    if (topVotes <= 0) return { status: "no_votes", winnerId: null };
    const leaders = candidates.filter(candidate => (Number(candidate.votes) || 0) === topVotes);
    if (leaders.length !== 1) return { status: "tie", winnerId: null };
    return { status: "winner", winnerId: String(leaders[0].id) };
}

module.exports = { toDate, toMillis, isFinalizedResults, getElectionPhase, applicationOutcome, positionOutcome };
