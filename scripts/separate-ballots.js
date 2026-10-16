/*
 * ONE-OFF MIGRATION: make votes cast BEFORE the ballot-secrecy change anonymous.
 *
 * Old votes stored the voter's matric number AND their choices in one document
 * (votes/{electionId}_{matric}.selections). This script moves each choice list
 * into its own anonymous ballots/{random id} document and removes `selections`
 * from the votes document, so the link between voter and choice is gone.
 *
 * Only needed if an election already has votes cast with the old version
 * (test elections do not matter: just delete them).
 *
 * USAGE (from the project folder, with the same variables Netlify uses):
 *   FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="..." \
 *     node scripts/separate-ballots.js            # dry run: only counts
 *   ... node scripts/separate-ballots.js --apply  # does it
 *
 * Safe to run twice (it skips votes that no longer hold selections). The live
 * tally counters are not touched, so results stay identical.
 * Votes are processed in random order so the new ballots do not line up with
 * the order of the voter list.
 */
const admin = require("firebase-admin");

async function run(db, { apply, log = console.log } = {}) {
    const snap = await db.collection("votes").get();
    const legacy = snap.docs.filter(doc => {
        const selections = doc.data().selections;
        return Array.isArray(selections) && selections.length > 0;
    });

    log(`${snap.size} vote record(s) found, ${legacy.length} still hold their choices.`);
    if (!legacy.length) return { migrated: 0 };
    if (!apply) {
        log("Dry run: nothing changed. Re-run with --apply to separate them.");
        return { migrated: 0 };
    }

    // Random order (Fisher-Yates)
    for (let i = legacy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [legacy[i], legacy[j]] = [legacy[j], legacy[i]];
    }

    let migrated = 0;
    for (let i = 0; i < legacy.length; i += 200) {
        const batch = db.batch();
        legacy.slice(i, i + 200).forEach(doc => {
            const data = doc.data();
            // ballot + removal of the link happen in the same atomic batch
            batch.create(db.collection("ballots").doc(), {
                electionId: data.electionId,
                selections: data.selections
            });
            batch.update(doc.ref, { selections: admin.firestore.FieldValue.delete() });
        });
        await batch.commit();
        migrated += Math.min(200, legacy.length - i);
        log(`Separated ${migrated} of ${legacy.length}...`);
    }
    return { migrated };
}

module.exports = { run };

if (require.main === module) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
        })
    });
    run(admin.firestore(), { apply: process.argv.includes("--apply") })
        .then(() => process.exit(0))
        .catch(error => { console.error("Migration failed:", error.message); process.exit(1); });
}
