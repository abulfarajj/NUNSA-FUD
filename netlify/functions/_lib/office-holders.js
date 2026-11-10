/*
 * Authoritative current office-holder calculation.
 *
 * Only a persisted, finalized results/{electionId} document can appoint an
 * office holder. A live tally, an application, or an election's published /
 * ended flag is never enough. For each position, the newest finalized election
 * that explicitly included that position supersedes the earlier holder.
 *
 * If termEndsAt is blank, the winner remains in office until a later finalized
 * election supersedes that position. If it is set, the office expires at that
 * exact instant even when no replacement election has been finalized.
 */
const { positionOutcome, toMillis, isFinalizedResults } = require("./election-lifecycle");
const { matricDocumentId } = require("./forms");

function positionKey(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function getCurrentOfficeHolders(db, options = {}) {
    const now = options.now == null ? Date.now() : Number(options.now);
    const [electionsSnap, resultsSnap] = await Promise.all([
        db.collection("elections").get(),
        db.collection("results").get()
    ]);

    const elections = new Map(electionsSnap.docs.map(doc => [doc.id, doc.data()]));
    const latestByPosition = new Map();

    for (const resultDoc of resultsSnap.docs) {
        const electionId = resultDoc.id;
        const storedElection = elections.get(electionId);
        const result = resultDoc.data();
        if (storedElection && storedElection.status === "draft") continue;
        if (!isFinalizedResults(result)) continue;

        // Results preserve the election's chronology and optional tenure as a
        // recovery fallback if an election document was manually removed.
        // Older finalized records without those fields fall back to their own
        // finalization timestamp and remain incumbents until a newer result.
        const election = storedElection || {
            status: "published",
            title: result.title || "Historical election",
            createdAt: result.createdAt,
            startAt: result.startAt,
            termEndsAt: result.termEndsAt
        };

        // Only the finalizer's persisted timestamp proves completion.
        const finalizedAt = toMillis(result.finalizedAt);
        if (finalizedAt > now) continue;

        for (const position of result.positions) {
            const key = positionKey(position && position.position);
            if (!key) continue;
            const current = latestByPosition.get(key);
            const createdAt = toMillis(election.createdAt);
            const startAt = toMillis(election.startAt);
            const priority = createdAt || startAt || finalizedAt;
            if (!current || priority > current.priority ||
                (priority === current.priority && createdAt > current.createdAt) ||
                (priority === current.priority && createdAt === current.createdAt && startAt > current.startAt) ||
                (priority === current.priority && createdAt === current.createdAt && startAt === current.startAt && finalizedAt > current.finalizedAt) ||
                (priority === current.priority && createdAt === current.createdAt && startAt === current.startAt && finalizedAt === current.finalizedAt && electionId > current.electionId)) {
                latestByPosition.set(key, {
                    electionId,
                    election,
                    result,
                    position,
                    finalizedAt,
                    createdAt,
                    startAt,
                    priority
                });
            }
        }
    }

    const offices = [];
    for (const entry of latestByPosition.values()) {
        const termEndsAt = toMillis(entry.election.termEndsAt || entry.result.termEndsAt);
        if (termEndsAt && now >= termEndsAt) continue;

        const outcome = positionOutcome(entry.position);
        if (outcome.status !== "winner" || !outcome.winnerId) continue;

        const candidateSnap = await db.collection("candidates").doc(String(outcome.winnerId)).get();
        if (!candidateSnap.exists) continue;
        const candidate = candidateSnap.data();
        if (candidate.status !== "active" || candidate.electionId !== entry.electionId ||
            positionKey(candidate.position) !== positionKey(entry.position.position)) continue;

        const matricNumber = String(candidate.matricNumber || "").trim();
        if (!matricNumber) continue;
        const studentDocumentId = matricDocumentId(matricNumber);
        const studentSnap = await db.collection("students").doc(studentDocumentId).get();
        if (!studentSnap.exists) continue;
        const student = studentSnap.data();
        if (student.status && student.status !== "active") continue;
        const academicLevel = String(student.academicLevel || student.level || student.currentLevel || "").trim();

        offices.push({
            position: String(entry.position.position),
            electionId: entry.electionId,
            electionTitle: String(entry.election.title || entry.result.title || ""),
            candidateId: String(outcome.winnerId),
            studentDocumentId,
            studentProfileId: studentDocumentId,
            matricNumber,
            name: String(student.name || candidate.name || ""),
            profilePicture: String(student.profilePicture || candidate.profilePicture || "assets/default-profile.jpg"),
            academicLevel: /^\d+$/.test(academicLevel) ? `${academicLevel} Level` : academicLevel,
            since: entry.finalizedAt,
            termEndsAt: termEndsAt || null
        });
    }

    return offices.sort((a, b) => b.since - a.since || a.position.localeCompare(b.position));
}

async function getOfficesForStudent(db, student, options = {}) {
    if (!student || !student.matricNumber) return [];
    const wanted = matricDocumentId(student.matricNumber);
    const holders = await getCurrentOfficeHolders(db, options);
    return holders
        .filter(office => office.studentDocumentId === wanted)
        .map(({ position, electionId, electionTitle, since, termEndsAt }) => ({
            position, electionId, electionTitle, since, termEndsAt
        }));
}

module.exports = { positionKey, getCurrentOfficeHolders, getOfficesForStudent };
