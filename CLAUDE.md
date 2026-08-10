# Ekta Independence Day Games 2026 — Live Tracker

Single-file HTML app (`Ekta_Games_Tracker.html`) backed by Firestore, for a two-day
society sports tournament (Ekta Society, Aug 15–16, 2026). Public read-only schedule
+ search; admin (signed in) can start matches live, mark winners, edit placeholder
names, and import/export the whole dataset as JSON.

## Firebase project
- Project ID: `ekta-indoor-games-80208`
- Config is already embedded in `Ekta_Games_Tracker.html` (top of the module script).
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
- `matches`: `{matchId, eventId, round, code, time, venue, day, playerA, playerB,
  status, winnerSlot, winnerName, winnerAge, loserName, overrideA, overrideB}`.
  `playerA`/`playerB` are one of:
  - `{type:"fixed", name, age}` — known player/pair
  - `{type:"placeholder", ref:"M3"}` — resolves to winner of match `eventId_M3`
  - `{type:"manual", name:"GA Pool Winner"}` — needs admin to fill in via the
    "✎ edit" control once known (pool-standings-based slots aren't auto-computed)
- `pendingPlayers`: `{eventId: [{name, age}, ...]}` — rosters for events not yet bracketed.

## Status of each event
| Event | Status | Notes |
|---|---|---|
| TT Women's Singles | ready | 8 players, 2 groups (A: 31–38, B: 40–58) → round robin → semis → final |
| TT Doubles | ready | 11 pairs, progressive pair-down bracket, Aug 16 |
| TT Men's Singles | **pending** | 36 players. Ages listed below. Grouping NOT finalized — leaning toward 4 groups of 9 (10–20 / 25–36 / 38–45 / 51–70) but user hasn't confirmed. **Ask before building.** |
| Carrom Men's Singles | **pending** | 23 players. Grouping NOT finalized. |
| Carrom Women's Singles | **pending** | 5 players, huge age spread (8–68). Format NOT finalized (round robin vs seeded knockout). |
| Carrom Doubles | ready | 17 pairs (1 possible name ambiguity: Vinod Agrawal/Shalu Agarwal both partnered with a "Vrinda Agrawal" — never confirmed as 2 people or 1). Aug 16. |
| Pool | ready | 28 players, progressive pair-down, Aug 15. |
| Chess | ready but stale | Currently loaded from an **older, messier 26-player sheet** (had since-removed junk entries like "Amaira Chandak (5)", duplicate Harkishin malkan, and "Kiaan sonik" — Kiaan was walked-over/removed). A **clean 22-player roster** was re-verified from the Chess column directly (listed below) but the bracket has NOT been rebuilt from it yet — user put Chess "on hold" pending an age-grouping decision, same as TT Men's/Carrom. |
| Squash | ready | U15 (7 players, knockout) + Above-15 (9 players, 2 pools → crossover semis → final). Some pool-standings slots (`GA Pool Winner` etc.) are `manual` type — admin must fill in after tallying round-robin results. |

## Open decisions (ask the user, don't assume)
1. **TT Men's Singles (36 players)** — final grouping. Last suggestion on the table:
   4 groups of 9 (10–20 / 25–36 / 38–45 / 51–70). User has not confirmed.
2. **Carrom Men's Singles (23 players)** — grouping not decided (3 vs 4 groups discussed earlier).
3. **Carrom Women's Singles (5 players)** — format not decided (round robin all-play-all vs seeded knockout). Age spread 8–68 makes grouping impractical.
4. **Chess** — rebuild bracket from the clean 22-player list, or keep the old 26-player one? User hasn't said.

## Player rosters for pending events

**TT Men's Singles (36):** Shaurya Tripathi 10, Parth yadav 10, Aadit Joshi 12, Viaan Neema 12,
Yash agarwal 13, Hridh jhala 13, Yuvraj jain 16, Aaditya Kumar 17, Hryday Goyal 20,
Pranit Shriyan 25, Rahul Garg 25, Jashit Bajaj 28, Ravi Modi 29, Tapabrata Dutta 31,
Prakshal Shah 32, Amar Parulekar 32, Tej 32, Dr Rahul Modi 36, Ankur Mahante 38,
Sudip Parui 38, Tanmay Sharma 39, Anuj Shah 39, Nikunj Jhala 40, Piyush Makharia 43,
Vinit Padia 44, Nilesh Bagaria 44, Amit Ranka 45, Mukul Joshi 51, Adil Khan 51,
Vinod Agrawal 55, Ajit nair 59, Ghansyam nawani 60, Sanjay Kumar 61, Sushil Dashpute 62,
HARSHAPRABHAT SHETTY 62, Kishore Kumar 70.

**Carrom Men's Singles (23):** Shaurya Tripathi 10, Aarav Pilankar 11, Yash agarwal 13,
Rahul Garg 25, Ravi Modi 29, Abhishek Dugar 34, Dr Rahul Modi 36, Ankur Mahante 38,
Anuj Shah 39, Mayank Aggarwal 40, Nikunj Jhala 40, Amar Jain 42, Vinit Padia 44,
Nilesh Bagaria 44, Amit Ranka 45, Vinay Sawant 49, Mukul Joshi 51, Adil Khan 51,
Mr. Hiral Khadepau 52, Vinod Agrawal 55, Prasad Akshintala 56, Sanjay Kumar 61, Gopal Krishna 65.

**Carrom Women's Singles (5):** Kaira 8, Rashmi Pilankar 42, Shraddha malgadnkar 47,
Poornima Shriyan 59, Mohini Sharma 68.

**Chess — clean 22-player list (verified from Chess column directly):** Rushabh 8,
Neev Chauhan 8, Kartik Relan 9, Parth yadav 10, Jimit Relan 11, Aadit Joshi 12,
Maitreya Manvik 14, Aaditya Kumar 17, Hryday Goyal 20, Rahul Garg 25, Tej 32,
Swati Tripathi 38 (F), Amit Nawandhar 39, Tejas doshi 40, Nikunj Jhala 40,
Piyush Makharia 43, Adil Khan 51, Sachin Malgadnkar 52, Prasad Akshintala 56,
Ajit nair 59, Sanjay Kumar 61, Harkishin malkan 76.

## UI conventions already built (keep consistent with these if adding features)
- Dark theme default (`#0B0E14` bg), light theme toggle, Teko/Inter/IBM Plex Mono fonts,
  saffron/green flag-bar accent on the logo only (no literal tricolor elsewhere).
- No "day filter" chips (removed by user request) — only sport filter chips remain.
- No "ADMIN MODE" banner (removed by user request) — admin controls are just small
  icon/pill buttons in the header (🔒/🔓 login toggle, "Load Data" seed button,
  "⇅" import/export button), all hidden unless signed in.
- 2-second toast banner on any match transitioning to `status:"completed"`, format:
  "🏆 **Winner** defeated Loser — Event, Round".
- "Up Next" horizontal-scroll widget on home, showing next 8 upcoming matches.
- Progress bar counts only matches belonging to `status:"ready"` events.

## Source data files (in this folder, if carried over)
- `Ekta_Independence_Registration.xlsx` — original 141-row registration form export.
- `Ekta_Indoor_Events.xlsx` — cleaner per-sport column sheet (`Singles` tab), this is
  the **source of truth** used for the player counts/ages above.
- `Ekta_Schedule_With_Matchups.xlsx` — master schedule workbook (10 tabs), was the
  data source before the web app existed; the web app's SEED_DATA was parsed from
  this file's Doubles/Pool/Chess/Squash sheets plus the TT Women's sheet.

## What NOT to do without asking
- Don't invent a grouping for TT Men's / Carrom Men's / Carrom Women's Singles or
  rebuild the Chess bracket — these are explicitly undecided, ask the user first.
- Don't reintroduce the day-filter chip row or the "ADMIN MODE" banner — both were
  deliberately removed.
- Don't change the Firebase config or admin credentials without being asked.
