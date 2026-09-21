# 習い (LearnJapanese): Dashboard Plan

> **For agents:** A standalone initiative. `docs/PLAN.md` still holds the content format, architecture and conventions; this file holds the roadmap and acceptance criteria for the dashboard. Refer to phases as **Dashboard Phase N**. Tick A/C items here as you finish them. Each phase gets its own branch and PR against `master`.

## Context

The N5 content is done (50 decks, 1,035 items plus cloze questions), and the Go + SQLite backend records every finished session against an anonymous `clientId`. What's missing is the answer to **"how much have I learned, and how much is left?"**

Today the app only stores two things:
- `attempts`: one row per session (`deckId`, `mode`, `correct`, `total`, `created_at`)
- `item_stats`: lifetime `seen` / `correct` counts per item

Lifetime counts can't tell "learned" from "got lucky once", and they have no dates, so there is nothing to chart over time. This plan adds:
1. **Durable, detailed progress:** a per-answer log, a mastery state for every unit, and a database that survives turning the server off each night.
2. **A dashboard page:** coverage of the N5 syllabus, per-group and per-deck mastery, activity over time, and weak items.

**Not in this plan:**
- Accounts and login will be a separate initiative with its own plan (not written yet). The anonymous `clientId` is enough for one person on one browser.
- The **test understanding** mode (kana hidden, no hints, as hard to guess as possible) is `docs/PLAN-test-understanding.md`, which builds on this plan. Dashboard Phase 1 records whether each session had kana or hints on, and which mode each answer was given in, so tests recorded later can be scored against the full history.

## Design

### Learnable units
A **unit** is anything a session reports a result for: every deck `item` plus every cloze `question`. Session results already use `itemIdOf(question)`, which gives the question id for cloze. A deck's unit count is `items.length + (questions?.length ?? 0)`, and the N5 universe is every unit in every N5 deck.

### Mastery rule (`src/study/mastery.ts`)
Per unit, the stats are `seen`, `correct`, `streak` (consecutive correct answers, any mode), `firstAt`, `lastAt` and `knownAt` (the first time the streak reached the threshold; never cleared).

| State | Rule |
|---|---|
| `new` | `seen === 0` (no stats yet) |
| `known` | `streak >= KNOWN_STREAK` (3) |
| `learning` | everything else |
| *weak* (a flag, not a state) | `seen >= 3` and `correct / seen < 0.6` |

A wrong answer resets `streak` to 0, so a known unit drops back to `learning` until it's answered correctly 3 times in a row again. `knownAt` stays put, so "learned over time" only ever goes up.

The rule is deliberately a single constant and one pure function (`applyAnswer`). The test understanding plan adds a `mastered` tier on top of it and **recomputes every unit's stats from the answer log**. Nothing is lost, because the raw answers are kept.

### Answers are the source of truth
The server stores every individual answer, and `item_stats` becomes a cache derived from those answers.

```
attempts(id PK, uid TEXT UNIQUE, client_id, deck_id, mode, correct, total,
         kana INTEGER, hints INTEGER, created_at)
answers(attempt_id, item_id, mode, correct, PK(attempt_id, item_id, mode))
item_stats(client_id, item_id, seen, correct, streak, first_at, last_at, known_at,
           updated_at, PK(client_id, item_id))
```

- `uid` is a UUID the frontend generates per session. Posting the same session twice (a queue retry or a backup import) is then a no-op, not a double count.
- `kana` / `hints` are the **effective** settings for the session. Reading mode always counts as `kana: false`, since it hides furigana anyway.
- `rebuildItemStats(clientId)` replays that client's answers in time order through the mastery rule. Imports use it, and so will a future rule change. The normal per-session upsert applies the same rule incrementally.
- The TS and Go implementations of the rule share one fixture, **`testdata/mastery-cases.json`** (answer sequences with the expected stats after each answer), so they can't drift apart.

**Existing data:** rows in `attempts` from before this plan keep their dates, so activity history is complete from day one. They have no `answers` rows, so their per-item counts stay as they are: `item_stats` keeps its old `seen`/`correct` values with `streak: 0` and no dates, which shows as `learning`. A rebuild must keep these legacy counts rather than zeroing them. Store them as a baseline, or skip rebuilding items that have no answers; pick one and test it.

### Keeping progress when the server is off
Progress is already written to disk (`server/data/app.db`) and to the browser's localStorage, so stopping the server each night doesn't lose anything. Two things are fragile, though:

1. **The database location depends on where you start the server.** The default `DB_PATH` is relative (`data/app.db`), so `go run .` inside `server/` and `go run ./server` from the repo root write to **two different databases**. Progress would seem to vanish depending on which command you used.
2. **There is no backup.** Deleting `server/data/`, a `git clean -fdx`, or clearing the browser's site data would wipe your history.

Dashboard Phase 1 fixes both:
- **A stable default location.** The default `DB_PATH` becomes `<user config dir>/learnjapanese/app.db` (on Windows that's `%AppData%\learnjapanese\app.db`), so it doesn't depend on the working directory and is outside the repo. On first start, if that file doesn't exist but `server/data/app.db` or `./data/app.db` does, copy the existing one over and log where it went. `DB_PATH` still overrides the default, and tests still use `:memory:`. The startup log already prints the path.
- **Export and import.** A "Download backup" button produces a JSON file (sessions plus answers) in both static and HTTP mode, and "Restore backup" merges one back in, safe to repeat thanks to `uid`. The same format moves history between static mode (localStorage) and the server.

While the server is off:
- With `VITE_API_URL` set, the frontend already queues failed posts and retries them later. It now includes the `uid`, so retries are safe.
- The dashboard falls back to local data, like every other view.

### API changes (both `staticApi` and `httpApi`, same interface)
- `postAttempt` sends `uid`, `kana` and `hints` as well.
- `getProgress()`: each `items[id]` gains `streak`, `firstAt`, `lastAt` and `knownAt`. The new fields are additive, so existing callers keep working.
- **New:** `listAttempts(since?)` returns `{deckId, mode, correct, total, kana, hints, at}[]` (HTTP: `GET /api/attempts?clientId=&since=`, oldest first). TS buckets these into **local-time days**. The server doesn't know your timezone, so it never buckets.
- **New:** `exportProgress()` / `importProgress(backup)` (HTTP: `GET /api/export?clientId=` and `POST /api/import`). The backup is `{version: 1, exportedAt, attempts: [{uid, deckId, mode, correct, total, kana, hints, at, items: [{itemId, mode, correct}]}]}`. Each answer's `mode` equals the session's mode in practice sessions. It's stored separately because a test session (see the test understanding plan) answers one unit in several modes.
- Static mode keeps its own session log in localStorage (`lj.attempts`, including per-item results) and derives item stats the same way. It's capped at the most recent 1,000 sessions (about 1 MB) to stay well inside localStorage's quota. The server holds the full history, and the backup file is the escape hatch.

---

## Dashboard Phase 1: Durable progress & mastery data

**Built as:** these are the choices made where the design above left room.
- **Legacy counts:** they're kept as a baseline. The server has an `item_base` table (the same columns as `item_stats`), filled once from `item_stats` when the migration first runs. Static mode uses `lj.itemsBase`, which also absorbs sessions that fall out of the 1,000-session cap, so a rebuild never loses answers.
- **One rebuild path:** every recorded session and every import rebuilds the affected items from their baseline plus answers, oldest first. The incremental and rebuilt results therefore can't disagree, even for a session posted late from the offline queue.
- **Session identity:** `uid` is unique **per client**, not globally, so restoring a backup under a new `clientId` (after clearing browser data, say) copies the sessions rather than treating them as duplicates. Sessions from before this phase got a random uid during the migration.
- **Timestamps:** posts carry the client's `at`, so a session queued offline keeps the time it was studied. The server ignores implausible values (before 2020, or more than a day ahead) and uses its own clock instead.
- **Backups:** a backup also carries the `baseline`, so restoring into an empty database reproduces the same progress. Sessions for decks that no longer exist are skipped and counted.
- **Where the buttons are:** there's no dashboard yet, so the backup buttons sit at the foot of the home page. Dashboard Phase 2 moves them.

- Add `src/study/mastery.ts`: the extended `ItemStat`, `applyAnswer(stat, correct, at)`, `masteryOf(stat)`, `isWeak(stat)`, `rebuildStats(answers)` and `KNOWN_STREAK`.
- Frontend recording:
  - `SessionView` passes `uid`, `kana` and `hints` (effective values) with each attempt.
  - `progress.ts` appends to `lj.attempts` (capped) and updates item stats through `applyAnswer`. Legacy `{seen, correct}` entries load safely.
- Go schema:
  - an idempotent migration run on startup (check `PRAGMA table_info` and add missing columns/tables) for `attempts.uid/kana/hints`, the `answers` table and the new `item_stats` columns
  - a partial unique index on `attempts(uid)` where `uid IS NOT NULL`, so legacy rows are unaffected
- Go endpoints:
  - `POST /api/attempts` stores the answers and ignores a repeated `uid`
  - `GET /api/progress` returns the new item fields
  - new: `GET /api/attempts`, `GET /api/export` and `POST /api/import` (import inserts missing sessions by `uid`, then rebuilds that client's `item_stats`)
- Go config: the stable default `DB_PATH` with the one-time copy of a legacy `data/app.db`. Update the README's backend section and remove the "run from `server/`" ambiguity.
- `StudyApi` gains `listAttempts`, `exportProgress` and `importProgress` in both implementations, plus fallback wrappers in `api.ts` like the existing ones.
- Add `testdata/mastery-cases.json`, read by `mastery.test.ts` and a Go test.

**A/C**
- [x] `mastery.test.ts` covers new → learning → known, a wrong answer resetting the streak, `knownAt` surviving the reset, and the weak flag's boundaries (seen 2 vs. 3, 59% vs. 60%).
- [x] The TS and Go tests both pass against `testdata/mastery-cases.json`, and the same answers give identical stats via the incremental path and via a rebuild.
- [x] Legacy localStorage stats and corrupt JSON load without throwing, and the `lj.attempts` cap holds (a test writes cap + 10 sessions).
- [x] Go migration test: open a DB with today's schema and some rows, migrate twice, and check the rows and legacy `item_stats` counts survive.
- [x] Posting the same `uid` twice records one session and counts each answer once.
- [x] `GET /api/attempts` has a happy-path test, a `since` filter test and a 400 without `clientId`.
- [x] Export → import into an empty DB reproduces the same `/api/progress`, and importing the same file again changes nothing.
- [x] `DB_PATH` resolution is unit-tested: an explicit value wins, the default lands under the user config dir, and an existing legacy file is copied once and never overwrites an existing target.
- [x] Manual: study a session, stop the server, start it from the *other* directory (repo root vs. `server/`), and the progress is still there. *(Checked with the built server and curl, against a copy of the real `server/data/app.db`: started from the repo root, which copied the old database over, recorded a session, then restarted from `server/`. A click-through in the browser is still worth doing.)*
- [x] `npm test`, `npm run build`, `go test ./...` and `go vet ./...` pass.

## Dashboard Phase 2: Dashboard page

- Add `src/study/analytics.ts`, pure functions over `(decks, progress, attempts, now)`:
  - `coverage(level)`: known / learning / new counts over the level's universe
  - `byGroup(level)`: the same split per home-page section (vocab, kanji, grammar, and so on)
  - `byDeck(level)`: the split per deck, sortable by percent known
  - `activity(attempts, days)`: sessions, answers and accuracy per local day
  - `streaks(attempts, now)`: the current and longest run of consecutive study days
  - `learnedOverTime(progress)`: cumulative known units per day, from `knownAt`
  - `weakest(progress, n)`: the lowest-accuracy weak units, each with its deck
  - `nextUp(level)`: the deck with the most `learning` units, or else the first untouched deck
- Add a `/dashboard` route and `DashboardView.vue`, with a "Progress" link in the header. The sections, top to bottom:
  1. **Headline:** "412 of 1,035 N5 units known (40%)", a known / learning / new stacked bar, and the current study-day streak
  2. **By group:** one stacked bar per group
  3. **Activity:** answers per day over the last 12 weeks (a calendar heatmap) and an accuracy line
  4. **Learned over time:** a cumulative known-units line
  5. **Decks:** a compact grid, each deck with its mastery bar and a link to `/deck/:id`, which can be sorted by "least learned"
  6. **Needs work:** up to 10 weak units, showing furigana, gloss, accuracy and a link to their deck
  7. **Next up:** one call-to-action button
  8. **Backup:** the "Download backup" and "Restore backup" buttons from Dashboard Phase 1, with the date of the last download (stored locally) as a gentle nudge
- Charts are small hand-written SVG components (`src/components/charts/`), with no chart library. They use the palette in `style.css`, work at phone width, and work in light and dark.
- A level switch (N5 / N4) appears only when the other level has decks, so N4 needs no code changes.
- Empty state: with no progress, show "0 of 1,035" with everything new and a "Start with Greetings" button, not blank charts.
- The deck page gains a small mastery bar (known / learning / new) above the mode buttons.

**A/C**
- [ ] `analytics.test.ts` covers each function with fixed data, including:
  - day bucketing across midnight and across a DST change (run with a fixed `TZ`)
  - a streak broken by one missed day
  - a streak still alive when yesterday had a session but today has none yet
  - empty progress
- [ ] `coverage("N5").total` equals the item+question count of every N5 deck, asserted against `content.ts`, so new content updates it automatically.
- [ ] A component test mounts `DashboardView` with a stubbed API and checks the headline numbers, one row per group, and the empty state.
- [ ] The dashboard loads through the `api.ts` wrappers: it works in static and HTTP mode, and falls back to local data when the server is down.
- [ ] `router.test.ts` covers `/dashboard`.
- [ ] Manual: at 375px wide there's no horizontal scroll, and the charts are legible in light and dark.

## Later
- **Test understanding:** planned in `docs/PLAN-test-understanding.md`. It covers deck tests with no help on screen, harder choices, typed answers and a `mastered` tier above `known`. It needs Dashboard Phase 1 first.

Not written yet:
- **Weak-items review:** a cross-deck session built from `weakest()`.
- **Accounts:** login, and progress across devices. This would reuse the per-client answer log and the backup format to claim anonymous history.
- Spaced repetition, deployment and CI stay in `docs/PLAN.md`'s backlog.

## Verification (end-to-end)
1. `npm test`, `npm run build`, `go vet ./...` and `go test ./...` pass at the repo root.
2. HTTP mode (`go run ./server` + `VITE_API_URL=/api npm run dev`): finish two sessions, open `/dashboard`, and check that the numbers match what you studied.
3. Stop the server, start it again from `server/` with `go run .`, and check the dashboard shows the same numbers.
4. With the server stopped, the dashboard still renders from local data.
5. Download a backup, point `DB_PATH` at a fresh file, restore the backup, and the dashboard matches again.
