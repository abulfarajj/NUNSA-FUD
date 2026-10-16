/*
 * BALLOT SECRECY
 *
 * A vote is stored in TWO unrelated places so that nobody reading the database
 * can see who voted for whom:
 *
 *   votes/{electionId}_{matric}  = the TURNOUT record: who voted (matric, authUid,
 *                                  receipt code, time). It contains NO selections.
 *                                  It is also what stops a second vote.
 *   ballots/{random id}          = the BALLOT: electionId + selections only.
 *                                  No matric, no uid, no receipt, no timestamp,
 *                                  and a random document ID (not in vote order).
 *
 * Both are written in the same transaction (cast-vote.js).
 *
 * LEGACY: votes cast before this change still hold `selections` inside the
 * votes document. Counting reads both places so no vote is ever lost, and
 * scripts/separate-ballots.js moves legacy selections into ballots.
 */

/**
 * Every ballot of an election as an array of selections arrays
 * (e.g. [[{position, candidateId}, ...], ...]). Order is NOT meaningful.
 */
async function loadAllSelections(db, electionId) {
    const [ballotsSnap, votesSnap] = await Promise.all([
        db.collection("ballots").where("electionId", "==", electionId).get(),
        db.collection("votes").where("electionId", "==", electionId).get()
    ]);

    const ballots = [];
    ballotsSnap.forEach(doc => {
        const selections = doc.data().selections;
        ballots.push(Array.isArray(selections) ? selections : []);
    });

    // Legacy votes that still carry their selections.
    votesSnap.forEach(doc => {
        const selections = doc.data().selections;
        if (Array.isArray(selections) && selections.length) {
            ballots.push(selections);
        }
    });

    return {
        ballots,
        turnout: votesSnap.size,          // one per voter who voted
        legacyCount: ballots.length - ballotsSnap.size
    };
}

module.exports = { loadAllSelections };
