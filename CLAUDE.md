# Ekta Independence Day Games 2026 — Live Tracker

Single-file HTML app (`index.html`) backed by Firestore, for a two-day
society sports tournament (Ekta Society, Aug 15–16, 2026). Public read-only schedule
+ search; admin (signed in) can start matches live, mark winners, edit placeholder
names, and import/export the whole dataset as JSON.

## Firebase project
- Project ID: `ekta-indoor-games-80208`
- Config is already embedded in `index.html` (top of the module script).
- Firestore security rules are in `firestore.rules` — public read, auth-required write.
  Paste into Firebase Console → Firestore → Rules.
- Auth: Email/Password provider. Admin user: `ankit.konchady@et.com` / `ekta123`
  (created manually in Firebase Console → Authentication → Users).
- Collections: `events`, `matches`, `pendingPlayers`, `playerPayments`. No Cloud
  Functions — all logic (bracket auto-advance, winner resolution) happens client-side
  by resolving `{type:"placeholder", ref:"M3"}` slots against sibling matches in the
  same event.
- **Multi-admin write pattern (3-4 admins expected to edit concurrently, all
  sharing the one login above — no per-admin accounts):** every match/payment
  write is `setDoc(ref, {...changedFieldsOnly}, {merge:true})`, fire-and-forget
  with a `.catch()` → error toast, never `updateDoc` + a stale-object `setDoc`
  fallback, and never `await`ed before closing a modal. Firestore write
  promises only resolve on server ack and hang (don't reject) while offline,
  so gating UI on `await` would leave modals stuck open when a phone briefly
  loses signal — see `confirmWinner`, `setMatchStatus`, `resetMatch`, the
  `#edit-save` handler, `setPlayerPayment`. `db` is created via
  `initializeFirestore(fbApp, {localCache: persistentLocalCache({tabManager:
  persistentSingleTabManager()})})`, not plain `getFirestore`, so writes queue
  in IndexedDB and survive a dropped connection or reload. Last-write-wins is
  the accepted conflict policy (no transactions/locking) — the existing
  5-second-hold-before-sinking-to-the-bottom behavior for just-completed
  matches is the intended safety net for catching and reverting a mistake.
  Don't reintroduce per-admin accounts, transactions, or "someone else just
  edited this" conflict warnings without asking — all three were explicitly
  decided against. The `#offline-banner` (shown to everyone, not just admins)
  toggles on the browser's native `online`/`offline` events.

## Data model (see SEED_DATA constant embedded in the HTML file)
- `events`: `{id, name, sport, category, gender, day, format, equipment, status}`.
  `status` is `"ready"` (has real matches) or `"pending"` (roster only, no bracket yet).
  Every event is currently `"ready"` — nothing is pending.
- `matches`: `{matchId, eventId, round, code, matchNumber, time, venue, day, playerA,
  playerB, status, winnerSlot, winnerName, winnerAge, loserName, overrideA, overrideB}`.
  `matchNumber` is an ascending integer, unique across the whole schedule, shown in the
  UI as **"Match N"** instead of the raw `code` (e.g. `U36-GA-2` displays as "Match 10").
  `playerA`/`playerB` are one of:
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
  swapped for `-`), `{name, paid: boolean, updatedAt}`. Written only from the admin
  "Players Master" screen; a player with no doc is treated as `paid: false` (UNPAID
  is the default, not an explicit state). Keyed by the exact display name string used
  in `playerA`/`playerB` `fixed`/`resolved` slots — doubles pairs are one combined
  name (e.g. `"Tanmay Sharma & Sankalp"`), so payment is tracked per pair, not per
  individual, consistent with how search already treats names.

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
  done. Any group/pool matches that didn't fit on Aug 15 wrap up by late morning,
  since they also have to clear the Aug 16 midday break. Only Squash still spills a
  meaningful chunk of its own group stage into Aug 16 morning now.
- **No single tournament-wide gate on semis/finals.** Each event/band becomes
  schedulable the moment its own prerequisites (own group/pool stage, or own prior
  knockout round) are met and a table/board is free — a proper dependency-based
  reflow (see below), not a fixed "everyone waits for everyone" cutoff. Every TT
  band's group/pool stage now clears entirely on Aug 15, same as TT Women's,
  Chess, Carrom Men's, Carrom Women's, and Pool — only Squash's Above 25 Bracket
  still clears its own group stage on Aug 16 and runs semis/finals later that day.
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
  per-player interval model once the bug was found: TT Women's Singles now finishes
  by **Aug 15, 12:00 PM**, TT Men's Singles (all 5 bands, including the Above 46
  knockout — its own group stage now clears entirely on Aug 15, only the Under 46
  Final spills to 8:00–8:15 AM Aug 16) by **Aug 16, 8:15 AM**, and TT Doubles by
  **Aug 16, 10:15 AM** — all three collapsed from running well into Aug 16
  afternoon down to essentially wrapping by the next morning.
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
- **Tournament now finishes Aug 16, 4:14 PM** (Squash is now the last event to
  finish — the only sport not yet reflowed with the corrected model; every
  reflowed event, including TT after its second pass, now wraps up well before
  that).
- **Reflow script caveats (if reflowing Squash, the one sport left unreflowed):**
  (1) the player-conflict model must track each player's *full list* of busy
  intervals for the day, not a single "last known match end" cursor — collapsing
  a player's day to one cursor makes the scheduler think they're busy continuously
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
  during the Pool reflow before being caught and fixed.
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
- Dark theme default (`#0B0E14` bg), light theme toggle, Teko/Inter/IBM Plex Mono fonts,
  saffron/green flag-bar accent on the logo only (no literal tricolor elsewhere).
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
  `pendingPlayers`, excluding anything still `tbd`/`manual`). Tapping a name shows that
  player's full schedule + results (same match-card rendering as search results) plus a
  tappable PAID/UNPAID badge that opens a small popup to set `playerPayments`.
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
- **5-second revert window:** when a match flips to `status:"completed"` *during the
  current session* (tracked in `state.completedAt`, keyed by matchId — matches already
  completed before load skip the wait), it stays in its normal chronological spot for 5s
  so admin can undo without hunting for it, then sinks to the bottom of that event's match
  list (`compareForEventPile` in `renderEventsList`). This only applies to the home page's
  per-event list — search results and Players Master still sort matches purely
  chronologically.
- **No "Mark Result"/"Edit Result"/"Reset" buttons** (removed by user request — these are
  three of the match-admin buttons that were deliberately removed and shouldn't come back).
  Marking/changing/undoing a result is a tap gesture on the player themselves: tapping a
  non-TBD player marks them the winner (`confirmWinner`); tapping the *current* winner again
  clears the result back to `"upcoming"` (`resetMatch`) — both instant, no confirmation.
  Tapping the *other* player while one is already marked opens the **"Switch Winner?"**
  confirm popup (`#switch-winner-modal`, `openSwitchWinnerModal`) rather than switching
  instantly — Cancel leaves it untouched, "Switch" calls `confirmWinner` with the new slot.
  This works identically whether the match is live, upcoming, or already completed — `canTap`
  in `renderMatchRow`'s `playerHtml()` is `state.isAdmin && !resolved.tbd`, deliberately not
  gated on `isDone`. The buttons left under a match are "▶ Start Match" (renamed from
  "Start Live" by user request — same `data-action="live"` mechanism, unchanged), "⏸ Unset
  Live", and "🗑 Delete" (below).
- **"✎ edit" shows on every player slot**, not just unresolved/TBD ones (widened by user
  request — same `openEditModal`/`overrideA`/`overrideB` mechanism as before, just no longer
  gated on `resolved.tbd`). Lets admin correct a typo in any name, fixed or resolved,
  post-hoc. Editing a slot never touches the match's own stored `winnerName`/`loserName`
  fields (only `resolveSlot` output, via `override`, changes) — display is always consistent
  since every render path reads names through `resolveSlot`, not those raw fields.
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
- **"🗑 Delete" button** on every match (`deleteMatchWithConfirm`) — admin-only, gated behind
  a custom in-app confirm modal (`#delete-match-modal`, styled like every other modal —
  **not** a native `confirm()`, that was deliberately replaced by user request), then
  `deleteDoc`. No undo inside the app; the modal text says to re-run "Load Data" to restore
  it from SEED_DATA if deleted by mistake (acceptable since that button upserts by ID and
  doesn't touch unrelated docs — unlike the Override flow, which wipes and rewrites
  everything and *does* still use a native `confirm()` — that one wasn't asked to change).
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
