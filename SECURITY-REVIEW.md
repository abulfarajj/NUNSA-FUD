# NUNSA-FUD Voting: Security and Cost Review

Reviewed: every Netlify function, the Firestore rules, and how the pages call them.
Tested: the new vote / login / results logic against an in-memory Firestore stand-in (15 checks, all passed). NOT yet tested against your real Firestore, so run one test election first (steps at the bottom).

## 1. What was wrong, and what changed

### Critical
| # | Problem | Fix |
|---|---------|-----|
| 1 | **Unlimited PIN guesses.** A 4-digit PIN has 10,000 possibilities; `student-login.js` and `cast-vote.js` allowed unlimited tries. | New shared helper `netlify/functions/_lib/guard.js`. 5 wrong PINs on one account = 15 min lock (login and voting share one counter). 100 wrong PINs from one IP = 15 min lock. Worst case is now about 480 guesses per account per day. |
| 2 | **Any signed-in student could change ANY student's profile picture** and read any student's record (which includes their e-mail). `students` rule only checked "signed in". | `firestore.rules`: a student can read/update only the record whose matric equals the `matricNumber` claim in their token, and only to a Cloudinary URL from your cloud. |
| 3 | **Any signed-in student could read any `voters` and `studentAccess` record** (who is eligible, doc IDs). | `voters`: own record only. `studentAccess`: admins only (no student page uses it). |
| 4 | **Results function read every vote on every call**, and pages refreshed every 10 s. | See section 2. |

### High
| # | Problem | Fix |
|---|---------|-----|
| 5 | E-mail code attempts (5 max) were counted AFTER comparing, so parallel requests could beat the limit. Same in PIN-reset. | `verify-email-code.js`, `verify-pin-reset-code.js`, `reset-student-pin.js` now reserve the attempt atomically before comparing. |
| 6 | "Send code" endpoints had no throttle (e-mail bombing; each resend reset the attempts to 0). | 1 code per minute per student, 5 per hour per student, 30 per hour per IP (`send-verification-code.js`, `send-pin-reset-code.js`). |
| 7 | Admins could edit candidates (name, position, status) after voting started. | Rules: candidate create/update/delete only while the election is `draft`. Matches what the pages already enforce. |
| 8 | Login revealed whether a matric exists / is inactive (different messages). | `student-login.js` answers every failure with the same "Invalid registration number or PIN." |

### Medium / low
- Raw error objects and Resend response bodies (can contain e-mail addresses) were logged. All `console.error` calls now go through `logError`, which logs only the error code and a short message.
- `manage-admin.js`: the primary (founder) Super Admin can no longer be deactivated by anyone.
- `finalize-election-results.js`: two admins finalizing at the same moment no longer produces a 500.
- `cast-vote.js`: expired login sessions now return 401 (was 500); `studentAccess` is read by document ID instead of a query.
- `netlify.toml`: added `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` headers.

## 2. Live results: how the new version works

**Before:** each refresh = election + results + candidates + EVERY vote document.
**After:**
1. `cast-vote.js` writes the vote AND adds it to 5 small counter documents (`electionTallies/{electionId}/shards/0-4`) in the SAME transaction. They commit together or not at all.
2. `get-election-results.js` reads the 5 counters plus a count of the votes collection, from one consistent snapshot. If the two totals differ for any reason, it falls back to a full recount, so the numbers shown are always the real numbers.
3. Answers are cached in memory for 10 s per server instance.
4. `results.js` refreshes every 30 s (was 10 s), pauses when the tab is hidden, and refreshes immediately when the tab becomes visible.
5. `finalize-election-results.js` still does a full, authoritative recount once, when the election ends.

Elections that already have votes before this deploy have no counters yet. They keep working through the full-recount fallback (same cost as before, never wrong).

### Estimated usage (assumptions: 600 voters, 12 candidates, 200 students watching live results for 2 hours)
| | Before | After |
|-|-|-|
| Results requests | about 144,000 (10 s) | about 48,000 (30 s) |
| Firestore reads for results | about 45 million | roughly 70 thousand or less |
| Reads to cast 600 votes | about 12 thousand | about 12 thousand |
| Writes to cast 600 votes | 600 | about 1,200 |

Free Firestore quota is 50,000 reads and 20,000 writes per day, so the old design would have exhausted it within minutes of a busy result page. The new design stays near it even in the busy case. These are estimates, not measurements. Note that each refresh is also a Netlify function call (48,000 in the example); check your Netlify plan's function limits.

### Indexes
No new index is needed. `get-election-candidates.js` already uses candidates (`electionId`, `status`, `createdAt`), which you have. The count query uses an automatic single-field index.

## 3. Round 2: items from section 3 that are now fixed

| # | Item | Status |
|---|------|--------|
| 1 | Account takeover at signup | NOT FIXED (accepted risk). No per-student secret or e-mail is available, so signup is back to: the student types their own e-mail and verifies it. Anyone who knows an unregistered matric number can register it first. Recovery: a Super Admin searches the matric on the Students page and taps **Reset registration** (`reset-student-registration.js`). It deletes the account, login user and leftover codes, keeps the student list entry, clears cooldowns/lockouts, and writes an `auditLogs` entry. It is refused while that student has a vote in an election that has not finished (ballots are anonymous and cannot be removed). |
| 2 | Votes not anonymous | FIXED. `votes/{election}_{matric}` is now a turnout record only (no selections). Choices are in `ballots/{random id}` with no voter data. Old-format votes are still counted; `scripts/separate-ballots.js` converts them (dry run by default, `--apply` to do it). Residual risk: someone holding the service-account key could still correlate by write time. |
| 4 | Lockout abuse | REDUCED. 5 wrong PINs lock only that account from that IP (15 min). 15 failures/hour from all IPs lock the account for 30 min (about 240 guesses/day maximum). Locking someone out now needs at least 3 IPs. Tune `RULES` in `_lib/guard.js`. |
| 5 | Invitation expiry | FIXED (7 days). Older invitations expire 7 days after `createdAt`. An expired pending invitation no longer blocks re-inviting. `accept-invitation.js` needed no change (it shows the server message). Admin password minimum (6) was NOT changed. |
| 6 | Voter changes without audit log | FIXED. Voters are added/imported/removed only through `netlify/functions/manage-voters.js`, which writes `auditLogs` in the same batch (who, what, matrics, election phase, time). Rules block direct browser writes; only Super Admins can read `auditLogs`. Console access to the Firebase project bypasses any log. |
| 7 | 4-digit e-mail codes | FIXED. E-mail codes (signup and PIN reset) are 6 digits. PINs stay 4 digits. |

Not changed: #3 (live tally visible to students) and the admin password minimum.

## 4. Credentials and environment variables
- No private key, Resend key or `.env` file exists anywhere in the project files.
- The Firebase `apiKey` in the page scripts is a public identifier by design. In Google Cloud Console, then APIs & Services, then Credentials, restrict that key to your domains (`nunsafud.name.ng`, your `netlify.app` domain).
- Cloudinary: the upload preset `nunsa_profile_pictures` is unsigned, so anyone can upload to it. In Cloudinary, limit the preset to images only, a small max file size, and a fixed folder.
- Netlify secrets-scan warning: the likely cause is that `FIREBASE_PROJECT_ID`'s value (`nunsa-voting-app`) also appears in your public page scripts. That is not a leak. Keep `SECRETS_SCAN_OMIT_KEYS` for that key only. This is my best explanation; confirm it against the exact key name Netlify prints in the warning.

## 5. Where the critical checks are documented
Header comments at the top of `cast-vote.js` (9 numbered checks), `student-login.js`, `get-election-results.js`, `_lib/guard.js`, and comments inside `firestore.rules`.

## 6. Deploy and test (round 2 additions)
- Deploy functions AND publish the new `firestore.rules` together (the voters page now needs `manage-voters`).
- Optional: `npm test` runs 24 checks against an in-memory Firestore stand-in (not real Firebase).
- If any real votes were cast before this version, run `node scripts/separate-ballots.js --apply` once.
- Netlify scan warning: set `SECRETS_SCAN_OMIT_KEYS=FIREBASE_PROJECT_ID` only.

## 6b. Original deploy and test
1. Unzip, then deploy the whole `NUNSA-VOTING` folder to Netlify (the new `netlify/functions/_lib` folder must be included).
2. Firebase Console, Firestore Database, Rules: paste `firestore.rules`, then Publish.
3. Create a TEST election (add 2 test students as voters, start time in the past), and check: login works, student dashboard loads, picture upload works, vote works, second vote is refused, results show the right numbers, 5 wrong PINs lock the account.
4. Delete the test election's data before the real one.
5. Optional: after the election, delete the `rateLimits` collection (small, harmless).


## 8. Candidate applications - new feature (free; no payments)

Flow: an admin lists the positions students may apply for in a DRAFT election (Admin > Candidate Applications) and opens applications -> students apply from their dashboard (one application per student per election) and appear as candidates straight away -> admins screen applicants in real life and disqualify anyone who does not qualify -> when the election is published, only candidates who are not disqualified are on the ballot.

Setup: nothing new. Publish the updated `firestore.rules` and deploy the zip. (There is no payment provider, no extra environment variable and no webhook.)

Things to know:
- The system does NOT check who is eligible for which position (no level data, and matric numbers cannot be used because of repeat students). Announce the rules on a flyer; admins disqualify anyone who does not qualify. Since applying is free, expect some ineligible applicants.
- Applications are accepted only while the election is a draft and applications are open. The check runs inside the database transaction, so nobody can apply after publishing.
- Disqualify/reinstate only works while the election is a draft. Each decision is written to `auditLogs`.
- Delete election (Super Admin, Elections page): refused if anyone has voted; removes candidates, applications, positions and the voter list.
- Removing an applicant by hand on the Candidates page does not update the application; use Disqualify on the Candidate Applications page instead.
