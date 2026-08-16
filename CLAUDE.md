# Ekta Independence Day Games 2026 — Live Tracker

Single-file HTML app (`index.html`) backed by Firestore, for a two-day
society sports tournament (Ekta Society, Aug 15–16, 2026). Public read-only schedule
+ search; admin (signed in) can start matches live, mark winners, edit placeholder
names, and import/export the whole dataset as JSON.

## Firebase project
- Project ID: `ekta-indoor-games-80208`
- Config is already embedded in `index.html` (top of the module script).
- Firestore security rules are in `firestore.rules` — public read, auth-required write,
  **except `playerPhones`, which is auth-required for both read and write** (phone
  numbers are more sensitive than the rest of this app's data — see `playerPhones`
  below). Paste into Firebase Console → Firestore → Rules — rules changes don't
  auto-deploy from this repo, that paste step has to be redone by hand every time
  this file changes.
- Auth: Email/Password provider. Admin user: `ankit.konchady@et.com` / `ekta123`
  (created manually in Firebase Console → Authentication → Users).
- Collections: `events`, `matches`, `pendingPlayers`, `playerPayments`, `playerPhones`.
  No Cloud Functions — all logic (bracket auto-advance, winner resolution) happens
  client-side by resolving `{type:"placeholder", ref:"M3"}` slots against sibling
  matches in the same event.
- **Multi-admin write pattern (3-4 admins expected to edit concurrently, all
  sharing the one login above — no per-admin accounts):** every match/payment
  write is `setDoc(ref, {...changedFieldsOnly}, {merge:true})`, fire-and-forget
  with a `.catch()` → error toast, never `updateDoc` + a stale-object `setDoc`
  fallback, and never `await`ed before closing a modal. Firestore write
  promises only resolve on server ack and hang (don't reject) while offline,
  so gating UI on `await` would leave modals stuck open when a phone briefly
  loses signal — see `confirmWinner`, `setMatchStatus`, `resetMatch`, the
  `#edit-save` handler, `setPlayerPhone`. `db` is created via
  `initializeFirestore(fbApp, {localCache: persistentLocalCache({tabManager:
  persistentSingleTabManager()})})`, not plain `getFirestore`, so writes queue
  in IndexedDB and survive a dropped connection or reload. Last-write-wins is
  the accepted conflict policy (no transactions/locking) — the `#confirm-winner-modal`
  Yes/No prompt shown before `confirmWinner` ever writes (see "Confirm Winner
  modal" below) is the intended safety net for catching a mistake, replacing
  the older 5-second-hold-before-sinking-to-the-bottom behavior (removed by
  user request — a completed match now sinks to the bottom of its event's
  list immediately, no revert window). Don't reintroduce per-admin accounts,
  transactions, "someone else just edited this" conflict warnings, or the old
  5-second hold without asking — all four were explicitly decided against.
  The `#offline-banner` (shown to everyone, not just admins) toggles on the
  browser's native `online`/`offline` events.
- **Backgrounded-tab read staleness fix:** mobile browsers can suspend a
  tab's WebSocket while the phone is locked or the tab isn't focused, so a
  Firestore `onSnapshot` update that lands while a viewer's phone is
  backgrounded may not render until something reconnects the listener —
  reported as "the other person's phone only picked up the *next*
  Start Match after I toggled a match off and back on," which happened to
  coincide with them checking their phone again. Fixed with `refreshOnVisible()`
  (a one-shot `getDocs()` re-fetch of `events`/`matches`/`playerPayments`,
  wired to both `visibilitychange` and `pageshow`) that force-syncs `state`
  whenever a tab comes back to the foreground, independent of whatever state
  the realtime listener's connection is in. It updates `state.knownStatuses`
  silently (no completed-match toast for a transition that happened while
  backgrounded) since that toast is for catching a *live* transition, not
  catching up after the fact.

## Automated Firestore backups
- **`.github/workflows/firestore-backup.yml`** runs `scripts/backup-firestore.mjs`
  on a schedule (every 4 hours, cron `0 */4 * * *`, plus manual
  `workflow_dispatch`) and commits the result to `data-backups/backup-<ISO
  timestamp>.json` if anything changed. This is deliberately broader than the
  admin's own **⇅ Import/Export** screen's *export* side, which only round-trips
  `events`/`matches`/`pendingPlayers` as `.xlsx` — the scheduled backup also
  captures `playerPayments`, which the in-app `.xlsx` export doesn't touch at all.
  The workflow prunes to the most recent 30 snapshots (~5 days at the default
  cadence) so the repo doesn't grow unbounded.
- **Setup required (one-time, can't be done from this session):** create a
  Firebase/GCP service account with **read-only** Firestore access
  (`roles/datastore.viewer` is enough — this key lives in GitHub Actions, so
  keep its permissions minimal), download its JSON key, and add the full JSON
  as a GitHub Actions secret named `FIREBASE_BACKUP_SERVICE_ACCOUNT_KEY` on
  this repo (Settings → Secrets and variables → Actions). Without that
  secret the workflow will fail every run with an auth error.
- **Restoring, in-app (the normal path):** the **⇅ Import/Export** modal has a
  second section, **"Restore From Backup Snapshot"**, below the existing
  `.xlsx` import — "🕐 Browse Snapshots…" lists `data-backups/` via GitHub's
  public, unauthenticated, CORS-enabled Contents API (`BACKUP_REPO`/
  `BACKUP_BRANCH` consts near `firebaseConfig`; no token needed since the repo
  is public), auto-loads the most recent one, and shows a picker (`<select>`)
  for older ones. Picking a snapshot fetches its raw JSON, and "Override With
  Snapshot" does the same delete-all-then-rewrite as the `.xlsx` override —
  except it also wipes and rewrites `playerPayments`, since a snapshot (unlike
  an `.xlsx` file) actually carries that collection. `pendingImportData`/
  `pendingImportSource`/the override button/its confirm-and-write handler are
  now shared between both the `.xlsx` and snapshot paths (see `io-override-btn`
  click handler) — the `playerPayments` collection is only touched when
  `pendingImportData.playerPayments` is present, so `.xlsx` imports still never
  touch payment records, exactly as before. Choosing a file clears any pending
  snapshot selection and vice versa (only one source can be "loaded and ready
  to override with" at a time).
- **Restoring, from the command line (disaster recovery / no browser):**
  `scripts/restore-firestore.mjs <backup-file.json> --confirm`, run locally by
  an admin (never from CI). Same wipe-and-rewrite semantics across all 4
  collections. Needs a service account key with *write* access
  (`roles/datastore.user` or broader) via `FIREBASE_SERVICE_ACCOUNT_KEY` or
  `GOOGLE_APPLICATION_CREDENTIALS` — deliberately kept separate from (and
  more privileged than) the read-only key used by the scheduled backup, and
  deliberately never automated/scheduled since restoring is a destructive,
  human-in-the-loop decision. Running without `--confirm` prints a dry-run
  summary and writes nothing.
- `scripts/` has its own `package.json` (`firebase-admin`) — `npm install`
  inside `scripts/` before running either script locally. Not part of the
  deployed app; `index.html` doesn't depend on anything in `scripts/`.

## Data model (see SEED_DATA constant embedded in the HTML file)
- `events`: `{id, name, sport, category, gender, day, format, equipment, status}`.
  `status` is `"ready"` (has real matches) or `"pending"` (roster only, no bracket yet).
  Every event is currently `"ready"` — nothing is pending.
- `matches`: `{matchId, eventId, round, code, matchNumber, time, venue, day, playerA,
  playerB, status, winnerSlot, winnerName, winnerAge, loserName, overrideA, overrideB,
  completedAt}`. `completedAt` is a `serverTimestamp()` stamped by `confirmWinner` and
  cleared by `resetMatch` — sort-order-only (see "finished pile" ordering below), not a
  revert window.
  `matchNumber` is an ascending integer **scoped per event** (1..N within each event's
  own matches, reassigned in chronological order whenever that event is reflowed) —
  **not** a single global sequence across the whole 297-match schedule. Shown in the
  UI as **"Match N"** instead of the raw `code` (e.g. `U36-GA-2` displays as "Match 10").
  Because it's per-event, `matchNumber` is only a valid sort key when comparing two
  matches from the *same* event — comparing it across different events (a player's
  cross-sport schedule, a multi-event search result) is meaningless and was a real bug
  (`compareMatches` in `index.html`) until fixed to sort by actual day/time first,
  falling back to `matchNumber` only within the same event. `playerA`/`playerB` are
  one of:
  - `{type:"fixed", name, age}` — known player/pair
  - `{type:"placeholder", ref:"M3"}` — resolves to winner of match `eventId_M3`
  - `{type:"manual", name:"1st Group A"}` — a group/pool-standings slot. Auto-resolves
    once its source round-robin round is fully complete (see "Group/pool standings
    auto-resolution" below); only falls back to needing the "✎ edit" control if the
    standing is genuinely unresolvable (a 3+-way win-count tie) or the round isn't
    finished yet.
- `pendingPlayers`: `{eventId: [{name, age}, ...]}` — rosters for events not yet bracketed.
  Currently empty (`{}`) — every event has already been fully bracketed into matches.
- `playerPayments`: one doc per unique player/pair name (doc ID = name, with any `/`
  swapped for `-`), `{name, paid: boolean, updatedAt}`. **No longer surfaced in the UI**
  (the PAID/UNPAID badge in Players Master was removed by user request and replaced
  with phone numbers, see `playerPhones` below) — the collection, its `onSnapshot`
  listener (`state.playerPayments`), and the rename-migration logic are all still
  live (kept for the automated Firestore backup and in case it's wanted back), just
  nothing renders or writes `paid` from the app anymore. Was keyed by the exact
  display name string used in `playerA`/`playerB` `fixed`/`resolved` slots — doubles
  pairs were one combined name (e.g. `"Tanmay Sharma & Sankalp"`).
- `playerPhones`: one doc per unique player/pair name (same doc-ID convention as
  `playerPayments` — exact display name, `/` swapped for `-`), `{name, phone,
  updatedAt}`. Shown (and editable, with a copy-to-clipboard button) on each
  player's Players Master detail card, where the old PAID/UNPAID badge used to be;
  the player-list rows show a compact phone preview instead of a payment badge.
  **Deliberately more locked-down than every other collection**: `firestore.rules`
  restricts `playerPhones` to authenticated-only `read` *and* `write` (every other
  collection is public-read), since phone numbers are meaningfully more sensitive
  PII than schedule/results — this app's Firestore is otherwise fully public-read
  by design, so anyone with the project ID can already query matches/events/payments
  directly (no auth needed), which phone numbers deliberately opt out of. Because of
  this, `state.playerPhones` is only ever populated while signed in — `startPhoneListener()`/
  `stopPhoneListener()` start and tear down its `onSnapshot` listener from inside
  `onAuthStateChanged` (a signed-out client would otherwise get a permission-denied
  error attempting to read it), and `refreshOnVisible()`'s one-shot re-fetch only
  includes `playerPhones` when `state.isAdmin`. **Firestore rules changes don't
  auto-deploy** — same as the original public-read rule, this has to be manually
  re-pasted into Firebase Console → Firestore → Rules to take effect; the app-side
  code assumes that's been done. Pre-seeded from ~130 real phone numbers already
  present (but previously unused) in `Ekta Indoor Events.xlsx`'s "Phone number"
  column, matched against the tournament's actual player names; doubles pairs got
  both partners' numbers joined with " / " where both were resolvable.

## Status of each event
All 9 events are `"ready"` with full brackets built (297 matches total).

| Event (display `name`) | Players/Pairs | Structure | Day |
|---|---|---|---|
| TT - Women's | 8 | 2 groups (A: 31–38, B: 40–58) → round robin → semis → final | Aug 15–16 |
| TT - Doubles | 8 pairs | Knockout, random draw | Aug 16 (entire event) |
| TT - Men's | 36 | 4 age bands (Under 15 / Under 26 / Under 36 / Under 46): groups → semis → final; Above 46 (9 players) is a single-elimination knockout (Sanjay Kumar gets a bye straight to the Quarterfinal) | Aug 15–16 |
| Carrom - Men's | 23 | 3 age bands (Under 15 / Under 46 / Above 46): groups → semis → final | Aug 15–16 |
| Carrom - Women's | 5 | Round robin → final | Aug 15–16 |
| Carrom - Doubles | 15 pairs (mixed) | Knockout, 1 bye | Aug 16 (entire event) |
| Pool | 28 | 3 age bands (Under 26 / 26–39 / 40+): groups → semis → final | Aug 15–16 |
| Chess | 22 | 4 age bands (Under 11 / 12–20 / 21–40 / 41+): pool → final (41+ also gets semis) | Aug 15–16 |
| Squash | 16 | U15 knockout + 15–25 Bracket (pool → final) + Above 25 Bracket (2 pools → semis → final) | Aug 15–16 |

Display names use a plain hyphen (`TT - Women's`), not the em dash / "Singles"
suffix / "(Mixed)" suffix used previously — renamed by user request. The
`category`/`gender` fields (`"Singles"`/`"Doubles"`, `"Men"`/`"Women"`/`"Mixed"`)
are unchanged, only the `name` field was shortened.

Group-winner/runner-up slots (e.g. `1st Group A`, `Pool 2nd`, `Round Robin 3rd`) are
`manual` type across every age-banded event — admin fills them in via "✎ edit" once
group/pool standings are tallied; they are not auto-computed from match results.

## Scheduling rules baked into the current SEED_DATA times
- **Aug 15 day shape:** 8:00–9:30 AM (events) → 9:30–10:30 AM (**Flag Hoisting
  ceremony, no matches**) → 10:30 AM–12:00 PM (events resume) → 12:00–3:00 PM
  (**break**) → 3:00–10:00 PM (events continue). This is the group/pool ("Americano")
  stage for all 7 non-doubles events.
- **Aug 16 day shape:** 8:00 AM start → 12:00–3:00 PM (**break**) → continues until
  done. Every event's own group/pool stage now clears by Aug 15 evening — Aug 16
  is only the TT Men's/Doubles finals (11:00–11:45 AM) and the 3 Squash finals
  (3:00–3:54 PM), both deliberately held to fixed times rather than a real
  group-stage spillover.
- **No single tournament-wide gate on semis/finals.** Each event/band becomes
  schedulable the moment its own prerequisites (own group/pool stage, or own prior
  knockout round) are met and a table/board is free — a proper dependency-based
  reflow (see below), not a fixed "everyone waits for everyone" cutoff. Every
  band's group/pool stage across every event now clears entirely on Aug 15.
- **Both entire Doubles events (TT Doubles, Carrom Doubles) do NOT wait for other
  events' group stages** — they only need their own players free, starting no earlier
  than 9:00 AM Aug 16.
- **TT was fully reflowed** with true per-band/per-bracket dependency scheduling
  (see "TT Men's Singles' Above 46 band is a knockout" below for why), and **Chess
  was independently reflowed the same way** after analysis showed its 2 boards were
  sitting idle for large stretches of open time even though no player conflict
  required it — a flaw in the original static schedule generator, not a real
  constraint. Both reflows use a greedy list-scheduler: repeatedly place whichever
  "ready" match (all its dependencies already placed) has the earliest achievable
  start across the event's boards/tables, checking every other player's *actual*
  free gaps that day (not just whether they're "done for the day") for conflicts.
  Chess's entire pool stage, semifinals, and final now complete by **Aug 16, 8:20
  AM** (only the 41-and-above Final spills past the Aug 15 10 PM cutoff) — down
  from 5:00 PM previously, since the old generator left its boards idle during
  open hours instead of finding players' real gaps between their other-sport
  matches.
- **TT Men's Singles' Above 46 band is a knockout, not a gated group stage** — since it
  no longer needs a full group/pool stage to finish before its bracket can start, it
  (and the rest of TT — TT Women's, TT Men's other 4 bands, TT Doubles) was fully
  reflowed with true per-band/per-bracket dependency scheduling. **Above 46 is
  explicitly prioritized to lead off the very first TT slot of the day** (Match 1,
  Table 2, Aug 15 8:00 AM) whenever it ties with another band for the earliest
  achievable start and doing so causes no player/venue conflict — none of its
  9 players have any other-event commitment before Aug 15 evening, so this was free to
  do.
- **TT's first reflow pass (finishing Aug 16, 4:30 PM) still had the single-cursor
  bug described below** — it predated the fix discovered during Chess's reflow, so
  it was silently carrying the same inflated idle time. Re-run with the corrected
  per-player interval model once the bug was found: TT Men's Singles' groups/
  semis and TT Doubles' quarters/semis all clear well inside Aug 15 / early
  Aug 16 morning, collapsed from running well into Aug 16 afternoon.
- **TT Women's Singles is deliberately held back** (by user request): its
  group stage doesn't start until **Aug 15, 10:30 AM** (not 8:00 AM), and its
  semifinal + final are further held to **3:00–3:30 PM** rather than running
  right after the group stage finishes late morning — a `TT_WOMEN_START` /
  `TT_WOMEN_SF_FINAL_FLOOR` pair on top of the normal dependency floor,
  same pattern as `FINALS_FLOOR`. This deliberately frees up both TT tables
  all morning for TT Men's Singles and reclaims capacity elsewhere in TT.
- **All 6 TT Men's/Doubles finals are deliberately held to Aug 16, 11:00 AM
  onward** (by user request), rather than being scheduled as soon as each
  semifinal happens to finish — a `FINALS_FLOOR` on top of the normal
  dependency floor for any `tt_men` match whose round ends in `" - Final"` or
  the `tt_doubles` `"Final"` match. They land together, **Aug 16, 11:00–11:45
  AM**, as one finals session (Above 46 and Under 36 finals at 11:00, Under 15/
  Under 26 at 11:15, Under 46 and TT Doubles at 11:30–11:45) instead of
  trickling out individually. This only delays those 6 matches — everything
  else in TT keeps its earliest achievable time.
- **Carrom (Men's/Women's/Doubles together, since their 3 boards are shared) and
  Pool were also reflowed** the same way, after the same idle-board analysis that
  caught Chess. Carrom Men's Singles now finishes entirely on **Aug 15, 5:45 PM**
  (was Aug 16, 4:05 PM) and Pool entirely on **Aug 15, 10:00 PM** (was Aug 16,
  11:50 AM) — both previously spilled into Aug 16 morning for no real reason.
  Carrom Women's Singles shifted slightly later, **Aug 15, 11:30 AM** (was 11:00
  AM), as a deliberate tie-break trade-off to let it keep finishing the same day
  while Carrom Men's reclaimed the freed board time — ties in the greedy
  list-scheduler are explicitly broken in Carrom Women's favor for this reason,
  same pattern as Above 46 leading off TT.
- **Squash was reflowed too** (all 9 events have now been through the corrected
  dependency-based scheduler — none left on the original static generator), with
  its 3 finals (Under 15, 15-25 Bracket, Above 25 Bracket) **deliberately held to
  Aug 16, 3:00 PM onward** (by user request), the same `FINALS_FLOOR` pattern
  used for TT's finals. Since Squash has only 1 court, the 3 finals run
  strictly back-to-back: **3:00, 3:18, 3:36 PM** (18 min each). Every group/pool
  match and semifinal clears by Aug 15 evening — only the 3 finals sit on Aug 16.
- **Tournament now finishes Aug 16, 3:54 PM** (Squash's Above 25 Bracket Final,
  the last of its 3 finals, is now the tournament's final match — every other
  event finishes well before that).
- **Reflow script caveats (if any event needs reflowing again):** (1) the
  player-conflict model must track each player's *full list* of busy intervals
  for the day, not a single "last known match end" cursor — collapsing a
  player's day to one cursor makes the scheduler think they're busy continuously
  from their first match to their very last one, hiding every real gap in between.
  This bug produced a badly-inflated Chess schedule (finishing 9:20 PM instead of
  8:20 AM) before being caught and fixed, and was later found to have silently
  affected TT's first reflow pass too (see above) — always confirm which model a
  reflow script is using before trusting its output, especially if reusing an
  older script as a template. (2) Even with per-player intervals, the streak/break
  check must look **both directions** from a candidate slot, not just backward —
  a new match can end up sandwiched with zero gap between two *already-fixed*
  matches from other events, silently forming a 60+ minute streak that a
  backward-only check can't see. This second bug slipped through Chess, Carrom,
  and TT's second pass (didn't happen to trigger) but broke one player's schedule
  during the Pool reflow before being caught and fixed. (3) A `FINALS_FLOOR`
  (or any other fixed-time hold) only needs to override `base_floor` for the
  matches it targets — the dependency-driven floor from `deps_of` still applies
  on top via `max()`, so a final can never be scheduled before its own
  semifinal even if the floor time has already passed.
- **10-minute break rule:** whenever the schedule would otherwise put the same player
  back-to-back with zero gap in the same event, or in an unbroken run across different
  events reaching 60+ minutes of continuous play, a 10-minute gap is inserted before
  that match. This only applies to matches with a known (`type:"fixed"`) player on
  both/either side — later-round `placeholder`/`manual` slots can't be checked since
  the actual player isn't known yet.
- If any of these rules change (break length/timing, day-15 cutoff, or whether
  semis/finals must wait for every event's groups vs. just their own), the whole
  schedule needs to be regenerated — don't hand-edit individual match times, as
  they're interdependent across events via shared players and shared venues.
- **Live app note:** the deployed app reads from Firestore, not directly from this
  repo's `index.html`. After changing SEED_DATA here, the admin must re-sync
  Firestore (⇅ import/export → Import → Override) for the live app to reflect it —
  the plain "Load Data" seed button only sets/overwrites by ID, it doesn't delete
  stale docs from a previous schedule version.

## UI conventions already built (keep consistent with these if adding features)
- **Modern/futuristic glass-and-glow visual language** (user request): dark theme default
  (`#05070C` bg with two faint fixed radial-gradient glow blobs behind the top corners via
  `body::before`), light theme toggle, Teko/Inter/IBM Plex Mono fonts, saffron/green
  flag-bar accent on the logo only (no literal tricolor elsewhere). Surfaces that sit above
  the base background (header, event cards, modals, menu dropdown, search dropdown, toasts)
  use the `--glass`/`--glass-strong`/`--glass-border` tokens (translucent + `backdrop-filter:
  blur(...)`) instead of flat opaque colors. Interactive/semantic accents (active chip,
  `.btn.primary`/`.btn.danger`, winner player card, live match row, Start Match/Delete/Edit
  mini-buttons, standings button) use the `--glow-saffron`/`--glow-win`/`--glow-live`/
  `--glow-info` box-shadow tokens and small gradient fills rather than flat single colors.
  `--radius`/`--radius-sm`/`--radius-lg` replace one-off `border-radius` pixel values on
  cards/inputs/buttons (small fixed-pixel radii on true pills/circles, e.g. `.live-badge`,
  `.icon-btn`, are left as-is). Every interactive element gets a `transition` using the
  shared `--ease` curve, plus a hover lift (`translateY(-1px)`) and/or `:active { transform:
  scale(0.96–0.98) }` press feedback — apply the same pattern to new buttons/cards rather
  than leaving them static. This was a pure CSS pass — no class names, DOM structure, or JS
  behavior changed, so don't assume a visual tweak here implies a behavior change too.
- **Per-event, per-group division-pill colors** (user request, generalizing what was
  previously a squash-only feature): every match card's round/division pill and left-border
  accent is colored, not just squash's. `matchDivisionHue(match)` picks a hue from a fixed
  15-entry `DIVISION_HUES` palette — large enough that no event's distinct (age-band, group)
  divisions can ever collide on the same hue (`tt_men` peaks at 12) — via
  `eventDivisionOrder(eventId)` (same youngest-band-first, Group-A-before-B ordering as the
  Standings feature, reusing `ageBandSortKey`) for the within-event index, plus a per-event
  starting offset (`EVENT_COLOR_ORDER`, stride 2 — coprime with 15, so all 9 events land on
  distinct starting hues) so two different events read as visually distinct even side by side
  in a mixed list (search results, Players Master schedule). `matchGroupIdentity(match)`
  extends `matchCategoryPrefix` with the specific group letter *only* while a match is still
  in its own group/pool stage — once a bracket reaches Semifinal/Final the groups have
  merged, so those rounds fall back to just the age-band, mirroring squash's pre-existing
  GA-/GB-/A25- behavior (group-stage matches get their own color, semis/final get a third,
  separate one for the same age band). `divisionColorStyle(hue)` is theme-aware (dark: bright
  pastel-on-dark; light: darker/more saturated for contrast on white) and applied via inline
  `style` on `.division-pill` and the match's left border, not fixed CSS classes, since the
  number of divisions varies per event and can't be enumerated ahead of time — this replaced
  the old hardcoded `.match-kids`/`.match-group-a`/`.match-group-b`/`.match-mens` classes
  entirely. Squash keeps its own short pill *labels* ("Kids", "15-25", etc. via
  `squashDivisionLabel`, unchanged) since match.code parses more reliably than its round text
  for that event; every other event's pill just shows the round text
  (`formatRoundLabel(m.round)`).
- **Semifinal/final match cards get a distinct full outline** (user request), on top of
  (not replacing) the per-division left-border accent above: `isSemifinalRound(round)`
  (new, mirrors the existing `isFinalRound`) and `isFinalRound(round)` add `.is-semifinal`/
  `.is-final` to the `.match` div in `renderMatchRow`, giving it a saffron `inset` box-shadow
  outline (final's is more opaque than semifinal's, so a final still reads as more
  prominent) — combined with `.is-live`'s own inset box-shadow via an explicit
  `.match.is-live.is-final`/`.match.is-live.is-semifinal` rule, since box-shadow isn't
  additive across separate selectors and a live semifinal/final needs both effects at once.
  Applies everywhere `renderMatchRow` is used (home list, search results, Players Master,
  event results summary uses its own separate rendering so is unaffected).
- No "day filter" chips (removed by user request) — only sport filter chips remain.
- No "ADMIN MODE" banner (removed by user request) — admin controls live inside the
  **☰ hamburger menu** (top-right), not as standalone header icons. The header itself
  only ever shows the 🔍 search icon and the ☰ menu.
- No "Up Next" widget on home (removed by user request).
- The hamburger menu always has Dark/Light Mode and Admin Login/Sign Out. Once signed
  in as admin, three more items appear: "👥 Players Master", "📥 Load Data", and
  "⇅ Import / Export" — all hidden for signed-out visitors. Each item hides the menu
  and opens its existing modal/view; don't reintroduce these as separate header icons.
  "👥 Players Master" opens a full-screen roster view (`#players-master-view`) with a
  search box over every unique player/pair name (built from resolved match slots +
  `pendingPlayers`, excluding anything still `tbd`/`manual`). The list rows show a
  compact phone-number preview (or "No phone" in italics) next to each name. Tapping
  a name shows that player's full schedule + results (same match-card rendering as
  search results) plus their phone number as a chip with copy (📋) and edit (✎)
  buttons — or a "+ Add phone" button if none is on file yet — which opens a small
  popup to set `playerPhones`. (This chip replaced a tappable PAID/UNPAID badge that
  used to live in the same spot — see `playerPayments` vs `playerPhones` above.)
  **"✎ Edit Name" renames a player everywhere** (user request) — since a name isn't stored
  once in a central player record but denormalized into every `fixed` `playerA`/`playerB`
  slot the player appears in (each match carries its own `{name, age}` copy), a rename has
  to walk every match and patch all of it in one go: any `fixed` slot with that exact name,
  any `overrideA`/`overrideB` matching it, and any `winnerName`/`loserName` matching it
  (so a downstream `placeholder` match, e.g. a Final referencing a semifinal this player
  won, keeps showing the corrected name — same reasoning as the stale-override fix above).
  `computeMatchRenamePatches`/`computePendingPlayerRenames` compute what would change (also
  used to preview the affected match count before the admin confirms);
  `renamePlayerEverywhere` commits it via `writeBatch` (chunked at 450 ops, same pattern as
  the Import/Export override flow), fire-and-forget like every other match write. The
  `playerPayments`/`playerPhones` docs are keyed by name (doc ID), so renaming creates a
  new doc under the new ID and deletes the old one rather than patching a field for
  either; a player with no existing record in one (or both) has nothing to carry over
  there. A **"Rename Player?"** confirm
  (`#pm-rename-confirm-modal`) shows the affected match count before committing — same
  safety-net pattern as the match-level edit confirms — and warns (without blocking) if the
  new name already belongs to a different existing player, since that would merge their
  schedules together. Age is preserved (only the name field changes). Verified against real
  SEED_DATA: a player entered in both TT Men's and Carrom Men's (13 matches total across
  the two events) renames correctly in every one, with age intact.
- 2-second toast banner on any match transitioning to `status:"completed"`, format:
  "🏆 **Winner** defeated Loser — Event, Round".
- Every match card shows **"Match N"** (from `matchNumber`) instead of the raw `code`.
- Progress bar counts only matches belonging to `status:"ready"` events (i.e. all of them now).
- **No scrolling/animated "LIVE" ticker banner** (removed by user request). Instead, any
  event with one or more `status:"live"` matches shows a static orange `.event-live-row`
  listing those matchups directly under the event name — visible even when the card is
  collapsed, no animation. (The small pulsing "🔴 LIVE" badge on the individual match row
  inside the expanded card is unrelated and still animates — that one wasn't asked to change.)
- Each expanded event shows its own mini progress bar (`.event-progress-row`, same
  `X / Y matches played` style as the header one) as the first line of its body, scoped
  to just that event's matches.
- **No revert window** (removed by user request, along with `state.completedAt`/
  `isHeldCompleted`) — a match that resolves to `status:"completed"` (see
  `isMatchResolvedComplete`) sinks to the bottom of its event's match list
  (`compareForEventPile` in `renderEventsList`) immediately on the very next
  render, no delay. The safety net for a mis-tap is now front-loaded into the
  **Confirm Winner modal** below rather than a grace period after the fact.
  This sink-to-bottom behavior only applies to the home page's per-event list
  — search results and Players Master still sort matches purely
  chronologically. **Within that sunk-to-the-bottom "finished" pile, the
  most recently-marked result sits at the top** (right under the still-active
  matches), not sorted by scheduled day/time like everything else —
  `confirmWinner` stamps a `completedAt: serverTimestamp()` on the match doc
  (cleared back to `null` by `resetMatch`) purely to drive this ordering, and
  `compareForEventPile` sorts the finished group by it descending. This is a
  new, distinct field from the old removed `state.completedAt`/
  `isHeldCompleted` client-side hold-timer mentioned above — it's a persisted
  Firestore field used only for sort order, not a revert window. A match
  completed before this field existed (or mid-flight on a fire-and-forget
  write whose `serverTimestamp()` hasn't resolved yet) has no `completedAt`
  and sorts as older than anything that does, falling back to chronological
  order in that case.
- **No "Mark Result"/"Edit Result"/"Reset" buttons** (removed by user request — these are
  three of the match-admin buttons that were deliberately removed and shouldn't come back).
  Marking/changing/undoing a result is a tap gesture on the player themselves: tapping a
  non-TBD player on a match that isn't yet completed opens the **"Confirm Winner?"**
  Yes/No popup (`#confirm-winner-modal`, `openConfirmWinnerModal`, added by user request to
  replace the old instant-completion-plus-5-second-hold behavior) — "No"/✕ leaves the match
  untouched, "Yes" calls `confirmWinner` with that slot. Tapping the *current* winner again
  opens a **"Reset Result?"** confirm popup (`#reset-match-modal`, `openResetMatchModal`,
  added by user request — this used to clear the result back to `"upcoming"` (`resetMatch`)
  instantly with no confirmation, but that was changed since a mis-tap on the winner had no
  safety net) — Cancel/✕ leaves the match untouched, "Reset" calls `resetMatch`. Tapping the
  *other* player while one is already marked opens the separate **"Switch Winner?"** confirm
  popup (`#switch-winner-modal`,
  `openSwitchWinnerModal`) rather than switching instantly — Cancel leaves it untouched,
  "Switch" calls `confirmWinner` with the new slot.
  This works identically whether the match is live, upcoming, or already completed — `canTap`
  in `renderMatchRow`'s `playerHtml()` is `state.isAdmin && !resolved.tbd`, deliberately not
  gated on `isDone`. The buttons left under a match are "▶ Start Match" (renamed from
  "Start Live" by user request — same `data-action="live"` mechanism, unchanged), "⏸ Unset
  Live", and "🗑 Delete" (below).
- **"✎ edit" shows on every player slot**, not just unresolved/TBD ones (widened by user
  request — same `openEditModal`/`overrideA`/`overrideB` mechanism as before, just no longer
  gated on `resolved.tbd`). Lets admin correct a typo in any name, fixed or resolved,
  post-hoc. Tapping "✎ edit" opens a **"Edit Player Name?"** Go Ahead/Cancel confirm first
  (`#edit-confirm-modal`, `openEditConfirmModal`, added by user request — same
  safety-net pattern as Confirm Winner/Reset Result/Switch Winner) before the actual
  name-edit modal (`#edit-modal`) opens; Cancel/✕ leaves the match untouched, "Go Ahead"
  calls `openEditModal` with the same args it used to receive directly from the tap. If the
  slot being edited is the winner or loser of an already-completed match, `saveSlotOverride`
  (shared by the edit modal's Save button and the stale-override suggestion badge — see the
  "Group/pool standings auto-resolution" section below) also patches the match's own stored
  `winnerName`/`loserName` fields, since a downstream match's `placeholder` slot (e.g. a
  Final referencing this semifinal) reads those frozen fields directly rather than
  re-resolving this match's slots live.
- **Edit modal suggests existing players** instead of a blank free-text field (by user
  request) — `#edit-name-dropdown` (reuses the `.search-dropdown`/`.search-option` styling
  from the header search) defaults to every already-known player scoped to the same event
  *and*, where the event has age bands, the same band as the match being edited
  (`eventCategoryPlayers()` + `matchCategoryPrefix()` — the same age-band-prefix logic the
  standings auto-resolution uses, e.g. tapping edit on an "Under 15" match only shows the 6
  Under 15 players, not all 36 tt_men players). Clicking into the field shows that scoped
  list; typing filters it live; clicking a suggestion fills the field. A **"Show all
  players →"** row (`#edit-name-show-more`, `.search-option-more`) at the bottom of the
  scoped list expands the pool to every player in the whole tournament
  (`allTournamentPlayers()`, still searchable) if the one being looked for isn't in the
  narrow scope, **without closing the dropdown** (by user request — see the `mousedown`
  note below); once expanded there's no way back to the narrow list within that modal open
  (reopening the modal resets it). Free text is still fully allowed too (e.g. for a
  walkover substitute not in the pool anywhere) — this is a suggestion aid, not a hard
  constraint.
  - **`#edit-name-dropdown { position: static }`** overrides `.search-dropdown`'s default
    `position: absolute` for this one instance only (ID beats class) — unlike the header
    search dropdown, which must float over the page content below it, this one lives right
    above the modal's Cancel/Save buttons with very little room, so it flows in-document
    and *pushes those buttons down* instead of floating over them (`.modal` got
    `max-height: calc(100vh - 40px); overflow-y: auto` to scroll as a whole if that ever
    makes it taller than the viewport). An absolute-overlay version was tried first and
    rejected: capping the dropdown's height to whatever gap happened to exist above the
    buttons sometimes left zero room and made it invisible, and z-index games between the
    dropdown and the buttons just moved which one lost clicks in the overlap zone — don't
    reintroduce that without solving the not-enough-room case first.
  - **`edit-name-dropdown`'s own `mousedown` handler calls `preventDefault()`** so clicking
    anything inside it (a suggestion, "Show more") never blurs `#edit-name-input` in the
    first place — the input's separate `blur` handler (150ms deferred) is what closes the
    dropdown on a genuine click-away, and without the `mousedown` guard that same handler
    was firing for in-dropdown clicks too, closing "Show more"'s expanded list right back
    up a moment after it opened.
- **Player/match search matches every query word independently, not the query as one
  substring** (`nameMatchesQuery`, used by the header search's results (`renderSearch`)
  and its autocomplete dropdown (`updateSearchSuggestions`), and Players Master's search
  (`renderPlayerListView`) — user-reported bug: a doubles pair's stored name is one
  player's name, then `" & "`, then the other's (e.g. `"Vinay Sawant & Amar Jain"`), so
  typing both names together in the order that felt natural (e.g. `"Amar Vinay"`) found
  nothing under a plain `.includes(query)` check even though both players genuinely are
  in that name — the words just weren't contiguous in query order. `nameMatchesQuery`
  splits the query on whitespace and requires every token to appear *somewhere* in the
  name, in any order, so `"vinay"`, `"amar"`, `"vinay amar"`, and `"amar vinay"` all find
  the same pair. A single-word query behaves exactly like the old plain substring search.
- **Known open risk: nested `backdrop-filter` on `.search-card`/`#search-dropdown`
  bled the sport filter chips through the player-search dropdown on iOS Safari**
  (reported with a screenshot) — `.search-card` sits inside `header.app-header`,
  and both had their own `backdrop-filter`; `#search-dropdown` (`position:
  absolute`, extending below `.search-card`'s own box) escapes the inner blur
  region, and Safari's compositor let content behind it bleed through instead of
  staying fully hidden. This was fixed once (removing `.search-card`'s own
  `backdrop-filter`), but the glass-morphism redesign below reintroduced —
  and expanded — nested `backdrop-filter` everywhere, including a *stronger*
  blur back on `.search-card` and `#search-dropdown` itself (now `background:
  var(--glass-strong)` instead of a fully solid color). `#search-dropdown` still
  has `isolation: isolate` as a defensive measure, but **whether the bleed-through
  actually recurs under the new glass design hasn't been re-verified on a real
  iOS device** — this sandbox can't load the app at all (gstatic.com, where the
  Firebase SDK is hosted, is blocked by network policy here) and the bug didn't
  reproduce in a plain Chromium screenshot test even before the redesign, so it's
  Safari-compositor-specific. If it resurfaces, the fix is the same: stop nesting
  `backdrop-filter` regions where an absolutely-positioned child needs to escape
  one of them, not just add more isolation/opacity.
- **"🗑 Delete" button** on every match (`deleteMatchWithConfirm`) — admin-only, gated behind
  a custom in-app confirm modal (`#delete-match-modal`, styled like every other modal —
  **not** a native `confirm()`, that was deliberately replaced by user request), then
  `deleteDoc`. No undo inside the app; the modal text says to re-run "Load Data" to restore
  it from SEED_DATA if deleted by mistake (acceptable since that button upserts by ID and
  doesn't touch unrelated docs — unlike the Override flow, which wipes and rewrites
  everything and *does* still use a native `confirm()` — that one wasn't asked to change).
- **"+ Add Match" button, scoped to `carrom_doubles`/`tt_doubles` only**
  (`ADD_MATCH_EVENT_IDS`, `openAddMatchModal`/`#add-match-modal`) — admin-only, rendered
  in the same `.standings-btn-row` slot as the 🏆 Standings button, right below it, inside
  each of those two events' expanded body. Deliberately restricted to just these two
  events (by user request): both are single, self-contained knockout brackets whose
  `placeholder` refs never get read by any *other* event, so a hand-added match can't
  desync some other bracket's dependency chain the way it could in the age-banded/
  group-stage events (where a manual slot's standings computation walks the event's own
  round-robin rounds and assumes the schedule matches what `SEED_DATA` originally laid
  out). Each player field (`setupAddMatchPicker`) shows a suggestion dropdown of every
  known tournament player (`addMatchPlayerPool` = `allTournamentPlayers()`, not scoped to
  just this event — see below) — clicking a suggestion fills in both the name and age
  fields — but free text is always allowed too, **same free-text-allowed pattern as the
  Edit Name modal's `#edit-name-dropdown`** (reuses its `.search-dropdown`/`.search-option`
  styling and mousedown/blur mechanics). This was deliberately changed from an earlier,
  stricter version that *required* picking from the event's own existing players and
  blocked Save otherwise — reverted by user request after a real case surfaced it: a
  known real-world pairing (e.g. two players who between them have never yet appeared
  together in any existing Carrom Doubles match in the live data) couldn't be entered at
  all under the strict version, since neither the pool-scoping nor the hard gate had any
  path to a name that isn't already attached to *this* event's matches. Only requirement
  now is both name fields non-empty and not identical to each other; age is optional
  free-typed input, pre-filled by a suggestion click but editable either way. Round, day,
  time, and venue are also free text. Saving writes a brand-new match doc directly via
  `setDoc` (fire-and-forget +
  `.catch()` → toast, same pattern as every other admin write — see the multi-admin
  write pattern above). `code`/`matchId` use `ADD<Date.now()>` rather than following the
  round-specific `M<n>`/`QF<n>`/`SF<n>`/`FINAL` convention the rest of the schedule uses,
  since that sidesteps needing to parse each event's existing code convention and stays
  collision-free even if two admins add a match at the same moment (no transactions).
  `matchNumber` has its own optional "Match #" field, pre-filled (but editable) with
  `nextMatchNumberForEvent(eventId)` — the *lowest* number not currently in use in that
  event, not just current-max-plus-one. This backfills a gap left by a deleted match
  (by user request: delete "Round 1 Match 4" out of a 10-match Round 1, and the next
  added match defaults to reclaiming 4, not becoming 11) before ever handing out a
  number past the max; with no gaps it naturally falls back to max+1 (matches
  1-10 present → next is 11). A live hint under the field (`renderAddMatchNumberHint`)
  explains the blank-field default and flags — before Save, not just on Save — if the
  admin types a number that collides with an existing match in the same event (two
  matches both reading "Match 4" would be ambiguous everywhere the app displays it);
  Save re-validates the same collision + positive-integer check regardless. Note
  `matchNumber` is per-event, not per-round (see its own convention note above) — "Round
  1 Match 4" only means the 4th match chronologically in that *event* happened to be a
  Round 1 match, so reclaiming slot 4 for a re-added Round 1 match is correct even
  though later rounds already occupy 11+.
  Unlike a `SEED_DATA` edit, this is a live Firestore write picked up immediately by the
  existing `matches` listener — it does **not** need a "Load Data"/Import-Override
  re-sync, and it also does not touch `SEED_DATA` itself (so re-running "Load Data" would
  not restore a match added this way, same as it wouldn't restore anything else that
  only ever existed in Firestore).
- **Homepage event ordering** (`eventProgressBucket()` + the sort step at the top of
  `renderEventsList`): events are grouped into 3 buckets — 0) has a live/completed match
  but isn't fully done (shown first), 1) nothing started yet (kept in the middle), 2) every
  match completed (sinks to the bottom, shown with a `<span class="status-badge
  finished">Finished</span>` badge, same visual treatment as the old unused "Ready" badge).
  Within each bucket, events keep their original relative order (stable sort by original
  index) — this reordering only ever *promotes* an event that just started or *demotes* one
  that just finished, it never reshuffles events that haven't changed bucket.
- **Per-event match counter on the homepage** (`.event-match-count`, a small pill showing
  `done/total`, e.g. "1/14") sits on the right side of every non-pending event's collapsed
  header, right before the status badge/chevron — visible without expanding the card.
  Separate from (but numerically consistent with) the fuller `.event-progress-row` bar
  shown inside the expanded body.
- **Finished-event results summary** (`eventResultsSummaryHtml()`, `.event-results-summary`):
  when a "Finished" event is expanded, the very first thing shown — above the progress bar
  and the full match list — is one `.result-card` per bracket/age-band final, each with the
  winner in bold with a big 🏆 and the runner-up with a small 🏆. A "final" match is
  identified by `isFinalRound(round)`: round `"Final"`, squash's `"U15-F"` kids-bracket
  code, or any round ending in `" - Final"` (age-band events). Most events have exactly one
  final (`finalBracketLabel()` returns `null`, no label shown); the 5 age-banded events
  (TT - Men's: 5 bands, Carrom - Men's: 3, Pool: 3, Chess: 4, Squash: 3 brackets) have
  several, each labeled with its band/bracket name (e.g. "Under 26", "15-25 Bracket").
  Verified against every match in SEED_DATA: 22 finals total across all 9 events, matching
  the documented bracket counts exactly — don't change the round-naming convention
  (`"<Band> - Final"` / plain `"Final"` / squash's `U15-F`) without updating both
  `isFinalRound`/`finalBracketLabel` and the schedule-generation source together.

## Group/pool standings auto-resolution
`manual`-type slots (e.g. `"Group A 1st"`, `"Pool 2nd"`) used to always require the admin
to tap "✎ edit" and type the name in by hand. They now **auto-resolve live** once their
source round-robin round is fully played — no write/persistence involved, it's pure
computation inside `resolveSlot` (in `index.html`), re-evaluated on every render, so it
updates immediately as results come in and reverts immediately if a group match gets
un-completed. The `override` mechanism still takes precedence over everything (checked
first in `resolveSlot`), so admin can always force a value manually if ever needed.

- **Stale-override safeguard (user-reported bug):** a `manual` slot is commonly overridden
  *while it's still ambiguous* (round not finished yet, or a 3+-way tie the auto-resolver
  can't break) — e.g. Carrom Women's had a real 2-way tie for 2nd that got manually filled
  in with a guess before the pool round was fully played. Once that round later finished
  cleanly, the override kept silently showing the old guess forever instead of the
  now-correctly-resolvable player, since overrides are never auto-revised (previous
  paragraph). `staleOverrideSuggestion(match, slotKey)` detects this specific case — an
  override on a `manual` slot whose live standings (via the new `resolveManualSlotAuto`,
  factored out of `resolveSlot`'s manual branch so both share one code path) now resolve
  cleanly to a *different* player — and `playerHtml` shows a small `⚠ Standings now say
  <name> — tap to use` badge (`.override-stale`) next to that player's "✎ edit" link,
  admin-only. Tapping it calls the same `saveSlotOverride` the edit modal's Save button
  uses (also factored out, so both paths keep `winnerName`/`loserName` in sync if the slot
  belongs to an already-completed match — see the edit-modal note below). This never writes
  anything on its own; the whole point is that overrides remain admin-controlled and
  intentional (a walkover substitute not in any standings is a legitimate permanent
  override this must never flag or touch) — it just surfaces the mismatch instead of
  leaving it silently wrong.

- **Why this needed real design work, not a generic parser:** the manual slot *name* text
  uses 4 different templates across events (`"1st of Group A"` for tt_women only, `"Group A
  1st"` for most others, `"Pool 1st"` for single-pool brackets, `"Round Robin 1st"` for
  chess's 7-player "41 and above" pool which needs a top-4 crossover instead of top-2), and
  the round-robin round's own name doesn't always follow the same convention either
  (tt_women's group-stage rounds are literally named `"Pool A"`/`"Pool B"` despite being a
  2-group bracket, not `"Group A"`/`"Group B"` like everyone else). Verified via a full
  parse of `SEED_DATA`: 31 matches have manual slots, 29 round-robin/pool rounds feed them,
  every round-robin is a complete round-robin (no byes) — see the functions below for the
  exact resolution logic.
- **`parseManualSlotName(name)`** — regexes for the 4 known templates, returns
  `{rank, group}` (`group` is `null` for a single pool with no A/B split).
- **`stripFinalSuffix(round)`** — strips `" - Semifinal"`/`" - Final"` (or matches bare
  `"Semifinal"`/`"Final"` for single-bracket events like tt_women/carrom_women) off the
  *consuming* match's own round to get its age-band prefix (`""` if there isn't one).
- **`findGroupStageRound(eventId, prefix, group)`** — tries the couple of naming variants
  that actually occur (`"<prefix> - Group <letter>"`, then falls back to `"Pool <letter>"`
  for tt_women's quirk) and returns whichever one actually exists as a round in that event.
- **`computeStandings(eventId, round)`** — ranks players in one round-robin round by win
  count. Returns `null` if the round isn't fully played yet. **Tie-break: 2-way ties are
  broken by head-to-head result** (always resolvable — round-robin guarantees a result
  exists between any two players). **A 3+-way win-count tie is left unresolved** (`null` at
  those specific ranks) rather than guessed — there's no score/games-won data anywhere in
  this app, only match winner, so a cyclic tie (A beat B, B beat C, C beat A, all 1-1) is
  genuinely undecidable from the data and correctly falls back to manual "✎ edit" entry for
  just that slot, same as before this feature existed.
- Verified two ways: a full simulated tournament (every fixed-vs-fixed match completed with
  a random-but-consistent winner) confirmed all 31 real manual slots resolve to the
  correct expected player, and isolated unit tests confirmed the tie-break logic (clean
  ranking, 2-way head-to-head tie, 3-way cycle fallback, incomplete-round fallback) — plus
  a full live end-to-end run completing an entire real 2-group bracket (TT Men's Senior:
  6 group matches → 2 semifinals) in the actual app, confirming both semifinals correctly
  auto-populated with the right crossover pairing, then un-completing them and confirming
  the semifinals correctly reverted back to unresolved/manual.
- Don't touch the round-naming convention (`"<Band> - Group A"`, `"<Band> - Pool"`, the
  tt_women `"Pool A"/"Pool B"` exception, or the 4 manual-name templates) without also
  updating these 4 functions — they're the only thing bridging that inconsistency.

## Source data files (in this folder, if carried over)
- `Ekta_Independence_Registration.xlsx` — original 141-row registration form export.
- `Ekta Indoor Events.xlsx` — cleaner per-sport column sheet (`Singles` tab), the
  **source of truth** used for player rosters/ages.
- `Ekta_Schedule_With_Matchups.xlsx` — master schedule workbook (10 tabs: Overview,
  TT Women's Singles, Table Tennis Singles Men, Table Tennis Doubles, Carrom Singles
  Men, Carrom Singles Women, Carrom Doubles, Pool, Chess, Squash). Kept in sync with
  `index.html`'s SEED_DATA — every sheet should mirror the current bracket structure.

## What NOT to do without asking
- Don't rebuild or re-group an event's bracket without asking — treat the current
  SEED_DATA structure (age bands, groups, pairings) as the finalized decision unless
  told otherwise.
- Don't reintroduce the day-filter chip row, the "Up Next" widget, the
  "ADMIN MODE" banner, the live ticker banner, or the "Mark Result"/"Edit
  Result"/"Reset" buttons — all were deliberately removed.
- Don't change the Firebase config or admin credentials without being asked.
- Don't reintroduce the PAID/UNPAID payment badge/button in Players Master —
  deliberately replaced with phone numbers (`playerPhones`). The underlying
  `playerPayments` data/listener/rename-migration were kept, just not
  rendered; don't wire it back into the UI without being asked.
- Don't relax `playerPhones`' auth-required read rule back to public —
  deliberately locked down (unlike every other collection) since phone
  numbers are more sensitive than schedule/results.
