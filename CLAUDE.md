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
- Collections: `events`, `matches`, `pendingPlayers`. No Cloud Functions — all logic
  (bracket auto-advance, winner resolution) happens client-side by resolving
  `{type:"placeholder", ref:"M3"}` slots against sibling matches in the same event.

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
  - `{type:"manual", name:"1st Group A"}` — needs admin to fill in via the
    "✎ edit" control once known (group/pool-standings-based slots aren't auto-computed)
- `pendingPlayers`: `{eventId: [{name, age}, ...]}` — rosters for events not yet bracketed.
  Currently empty (`{}`) — every event has already been fully bracketed into matches.

## Status of each event
All 9 events are `"ready"` with full brackets built (308 matches total).

| Event | Players/Pairs | Structure | Day |
|---|---|---|---|
| TT — Women's Singles | 8 | 2 groups (A: 31–38, B: 40–58) → round robin → semis → final | Aug 15 |
| TT — Doubles | 8 pairs | Knockout, random draw | Aug 15–16 |
| TT — Men's Singles | 36 | 5 age bands (Under 15 / Under 32 / Under 36 / Under 46 / Senior): groups → semis → final | Aug 15–16 |
| Carrom — Men's Singles | 23 | 3 age bands (Under 15 / Under 46 / Above 46): groups → semis → final | Aug 15–16 |
| Carrom — Women's Singles | 5 | Round robin → final | Aug 15 |
| Carrom — Doubles (Mixed) | 15 pairs | Knockout, 1 bye | Aug 15–16 |
| Pool | 28 | 3 age bands (Under 26 / 26–39 / 40+): groups → semis → final | Aug 15–16 |
| Chess | 22 | 4 age bands (Under 11 / 12–20 / 21–40 / 41+): pool → final (41+ also gets semis) | Aug 15 |
| Squash | 16 | U15 knockout + 15–25 Bracket (pool → final) + Above 25 Bracket (2 pools → semis → final) | Aug 15 |

Group-winner/runner-up slots (e.g. `1st Group A`, `Pool 2nd`, `Round Robin 3rd`) are
`manual` type across every age-banded event — admin fills them in via "✎ edit" once
group/pool standings are tallied; they are not auto-computed from match results.

## UI conventions already built (keep consistent with these if adding features)
- Dark theme default (`#0B0E14` bg), light theme toggle, Teko/Inter/IBM Plex Mono fonts,
  saffron/green flag-bar accent on the logo only (no literal tricolor elsewhere).
- No "day filter" chips (removed by user request) — only sport filter chips remain.
- No "ADMIN MODE" banner (removed by user request) — admin controls are just small
  icon/pill buttons in the header (🔒/🔓 login toggle, "Load Data" seed button,
  "⇅" import/export button), all hidden unless signed in.
- No "Up Next" widget on home (removed by user request).
- 2-second toast banner on any match transitioning to `status:"completed"`, format:
  "🏆 **Winner** defeated Loser — Event, Round".
- Every match card shows **"Match N"** (from `matchNumber`) instead of the raw `code`.
- Progress bar counts only matches belonging to `status:"ready"` events (i.e. all of them now).

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
- Don't reintroduce the day-filter chip row, the "Up Next" widget, or the
  "ADMIN MODE" banner — all were deliberately removed.
- Don't change the Firebase config or admin credentials without being asked.
