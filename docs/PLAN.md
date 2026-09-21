# 習い (LearnJapanese): Project Plan

> **For agents:** Copy this file into the repo as `docs/PLAN.md` first (Phase 0). Treat it as the source of truth. Phases run roughly in order. Phase 4 (backend) can run in parallel with Phases 2–3. When you finish an A/C item, tick it in `docs/PLAN.md`.

## Context

This is a side project: a small web app that teaches JLPT **N5 and N4** Japanese. The user opens the site (no auth for now), picks a **small, single-topic deck** (10–30 items, e.g. "N5 · Food & drink"), and studies it in one of several **study modes**. The first modes are multiple-choice: meaning, reverse, reading and cloze.

**Priority: finish N5 before starting N4.** The goal for v1 is that someone who clears every N5 deck is genuinely N5-ready, which means covering the whole syllabus (roughly 700–800 vocabulary words, about 100 kanji, and roughly 80 grammar points), not a sampler. N4 content is Phase 6 and doesn't start until the N5 coverage checklist is complete. The data model, modes and UI are level-agnostic from day one, so adding N4 later is pure content work.

The repo already has a working **Vue 3 + Vite + TS** prototype (`src/`). It has:
- 6 broad categories (`src/data/*.ts`) of hand-authored multiple-choice `Question`s, each with hand-written distractors
- `QuizSession.vue` (the multiple-choice runner, with keyboard 1–4 and Enter), `CardSession.vue` (flashcards) and `RubyText.vue` (furigana with Kana/Hints toggles)
- `progress.ts` (localStorage helpers plus `shuffle`, `correctChoice`, `filledPrompt`) and `settings.ts`
- a view state machine in `App.vue`
- no tests, no backend, and no git repo

**Direction:** Evolve the prototype. Replace the broad categories with many small topic decks. Items get authored once, and study modes generate their questions from them, with distractors drawn from the same deck. Flashcards are out of scope for now and get deleted (they'll be redesigned later). A **Go + SQLite** backend serves the content and stores progress. Rules stay light, but add tests wherever they're cheap.

## Architecture

```
LearnJapanese/
  content/decks/*.json    # SOURCE OF TRUTH for study content (read by web + Go)
  src/                    # Vue frontend (stays at repo root; no need to move it)
  server/                 # Go backend (module: learnjapanese/server)
  docs/PLAN.md            # this file
  CLAUDE.md               # short: commands, layout, "read docs/PLAN.md"
```

- **Content** lives as JSON so both the frontend (via Vite JSON import) and Go (via `go:embed`, seeded into SQLite) can read it without drift.
- **Frontend** pulls data through one `src/api.ts` module. It starts out backed by the static JSON and switches to HTTP in Phase 5, so components never see the difference.
- **Backend** is deliberately dumb. It stores deck JSON (furigana markup included) as-is, serves it, and records attempts. All rendering and question generation stays in TS.

### Content format (`content/decks/<level>-<slug>.json`)

```json
{
  "id": "n5-food",
  "level": "N5",
  "group": "vocab",            // vocab | kanji | grammar | particles | verbs | numbers | phrases
  "title": "Food & drink",
  "titleJa": "食べ物と飲み物",
  "order": 40,                 // sort order within level
  "items": [
    { "id": "n5-food-1", "ja": "{水|みず}", "en": "water" },
    { "id": "n5-food-2", "ja": "{食|た}べる", "en": "to eat", "note": "ru-verb" }
  ],
  "questions": [               // optional, hand-authored cloze (grammar/particles/verbs decks)
    { "id": "n5-part-q1", "prompt": "{毎日|まいにち|every day}ごはん___{食|た}べます。",
      "en": "I eat rice every day.", "answer": "を", "distractors": ["に", "で", "が"] }
  ]
}
```

**Furigana markup:** `{base|reading}` or `{base|reading|gloss}` or `{base||gloss}`. Anything outside braces is plain text, and `___` marks the cloze blank. `parseRuby(str): RubySegment[]` turns this into the existing `RubySegment` shape, so `RubyText.vue` is reused as-is. The kana used by reading mode comes from the reading parts plus the plain kana.

### Study modes (pure functions, `src/study/modes.ts`)

Each mode is `(deck, rng) => Question[]` and outputs the existing `Question`/`Choice` types from `src/types.ts`, so `QuizSession.vue` keeps working with minimal changes.

| Mode | Prompt → Choices | Applies to |
|---|---|---|
| `meaning` | JA (with furigana) → 4 EN | every item |
| `reverse` | EN → 4 JA | every item |
| `reading` | JA with furigana hidden → 4 kana | items containing kanji |
| `cloze` | sentence with blank → 4 JA | `deck.questions` |

Distractors are 3 other items from the same deck, chosen with the seedable `rng` so tests are deterministic. A mode is only offered for a deck if it can produce at least 4 questions.

## Phases & Acceptance Criteria

### Phase 0: Housekeeping & safety net
- `git init` with a first commit of the current prototype. Copy this plan to `docs/PLAN.md` and add a short `CLAUDE.md`.
- Add **Vitest** + **@vue/test-utils** + **jsdom** and the scripts `npm test` / `npm run test:watch`.
- Write characterization tests for the pure helpers in `src/progress.ts` (`shuffle`, `correctChoice`, `filledPrompt`, `questionsFor`) before changing anything.

**A/C**
- [x] `npm test` runs green with at least 1 test per helper listed above.
- [x] `npm run build` still passes (`vue-tsc -b && vite build`).
- [x] `docs/PLAN.md` and `CLAUDE.md` exist, and the repo has an initial commit.

### Phase 1: Content model & deck migration
- Add `Deck`, `Item` and `DeckQuestion` types to `src/types.ts`. Keep `RubySegment`, `Question` and `Choice`, and remove `Category` once nothing uses it.
- Add `src/study/ruby.ts` with `parseRuby` (and `toKana`, which joins readings and plain kana).
- Add `src/content.ts`, which loads `content/decks/*.json` via `import.meta.glob(..., { eager: true })`, sorts by level and then `order`, and exports `decks` and `getDeck(id)`.
- Migrate the existing `src/data/*.ts` content into topic decks. Hand-authored cloze questions from particles, verbs and grammar go into `questions`. Anything not migrated yet is parked in `content/parked-n4.md`. **`src/data/` itself is deleted in Phase 3**, not here: `App.vue` still imports it, so removing it earlier would break the build and leave the app unusable between phases.
- Write a **starter set of about 10 N5 decks** (enough to build and test Phases 2–3 against): Greetings & set phrases · Numbers 1–100 · Family · Food & drink · Colors & basic い-adjectives · Places in town · Common verbs I · Question words · Basic particles は/が/を/に/で (cloze) · Kanji: numbers & days. The rest of N5 is authored in Phase 3.5, and **no N4 content is written yet.**
- **Content validation test** (`src/content.test.ts`), which is the main guard as the content grows.

**A/C**
- [x] `parseRuby` tests cover plain text, reading, reading+gloss, gloss only, blanks, mixed strings, and malformed input (either throws or passes the text through, but pick one and test it).
- [x] The validation test checks **every** deck and fails with a readable message naming the deck/item when:
  - the item count is not 10–30
  - an id is duplicated (item and question ids are globally unique, and deck ids are unique)
  - `level` ∉ {N5, N4}, or `group` is unknown
  - a `ja` string fails to parse, or a reading contains non-kana characters
  - a cloze prompt doesn't have exactly one `___`, or doesn't have exactly 3 distractors distinct from the answer
- [x] There are at least 10 N5 decks. All old prototype content is migrated into N5 decks or parked in `content/parked-n4.md`. (`src/data/` is deleted in Phase 3, see above.)

### Phase 2: Study-mode engine
- Add `src/study/rng.ts` (a small seedable PRNG such as mulberry32, plus `shuffle(arr, rng)`). Update `progress.shuffle` to use it, or replace it outright.
- Add `src/study/modes.ts` with `buildQuestions(deck, mode, rng): Question[]` and `availableModes(deck): Mode[]`.

**A/C**
- [x] Each mode produces 4 unique choices with exactly one correct answer, and the correct answer is never also a distractor, including when two items share the same `en`. Dedupe by displayed text.
- [x] `reading` skips kana-only items, and `cloze` only uses `deck.questions`.
- [x] The same seed gives the same output (snapshot or deep-equal test), and different seeds give different orders.
- [x] `availableModes` leaves out any mode that yields fewer than 4 questions.
- [x] A property-style test runs every mode over **every real deck** without throwing.

### Phase 3: Frontend UI
- Add **vue-router** (hash history, so static hosting works) with these routes:
  - `/` shows the home page: decks grouped by level, then by group, each with its item count and best score
  - `/deck/:id` shows the deck page: title, an item list preview with furigana, and one button per available mode
  - `/deck/:id/:mode` runs the session (`QuizSession.vue`, generalized to take `Question[]` and a `deckId`/`mode`)
  - `/deck/:id/:mode/result` shows the score and missed items, with "Retry missed" and "Back to deck" actions
- Replace the view state machine in `App.vue` with `<RouterView>` and keep the header with the Kana/Hints toggles. Reuse `RubyText.vue` and `style.css`.
- **Delete** `CardSession.vue` and the card-mark helpers in `progress.ts` (the flashcard revamp is in the backlog).
- Progress (localStorage for now) is keyed by `deckId:mode` and stores `{best, last, at}` plus per-item `{seen, correct}`, which feeds "retry missed" now and weak-item review later.
- In reading mode, force furigana off for the prompt, whatever the Kana toggle says.

**A/C**
- [x] A component test mounts `QuizSession` with fixed questions, simulates picking choices with keys 1–4 and advancing with Enter, and asserts the emitted score and missed list.
- [x] A component test checks that the home page renders every deck from `content.ts`, grouped by level.
- [x] A progress test covers save/load round-trips and survives corrupt JSON in localStorage.
- [x] Covered by `src/router.test.ts` (home → deck → session → result, refresh on a deep link, bad deck/mode redirects). A human still owes the app a real click-through in a browser.
- [x] Nothing still imports `CardSession`, and `npm run build` passes.

### Phase 3.5: Complete N5 coverage (the main content push)

This is the phase that makes the app actually useful, and it's mostly authoring. Work deck by deck, committing each one. The validation test from Phase 1 is the guard rail. Add `content/coverage-n5.md`, a checklist of the syllabus areas below, and tick items as decks land.

- **Vocabulary (~700–800 words, roughly 30–35 decks of 20–25).** Greetings & set phrases · Numbers 1–100 · Big numbers, money & prices · Counters I (つ/人/個/枚) · Counters II (本/匹/台/回/歳) · Days of the week · Months & dates · Telling time · Time words (今日/明日/毎朝/来週…) · Family (mine vs. others') · People & occupations · Body · Clothing · Food I & Food II · Drinks & restaurant words · Home & rooms · Furniture & household objects · School & stationery · Places in town · Nature & weather · Animals · Transport · Directions & positions (上/下/中/となり…) · Colors · Adjectives い I & II · Adjectives な · Verbs I (daily routine) · Verbs II (movement) · Verbs III (communication & study) · Verbs IV (transactions & misc) · Adverbs & frequency (とても/あまり/よく/もう/まだ) · Question words · Conjunctions & connectors · Classroom & travel phrases
- **Kanji (about 100, 5–6 decks of ~20).** Numbers & counters (一〜十, 百, 千, 万, 円, 時, 分, 半) · Days, time & calendar (日, 月, 火, 水, 木, 金, 土, 年, 今, 先, 毎, 週, 曜) · People & family (人, 男, 女, 子, 父, 母, 友, 名, 私) · Nature & places (山, 川, 田, 天, 気, 空, 雨, 国, 学, 校, 駅, 店, 社, 会) · Verbs & adjectives (行, 来, 見, 聞, 言, 食, 飲, 読, 書, 話, 買, 出, 入, 大, 小, 高, 安, 新, 古, 長, 白) · Body & directions (目, 耳, 口, 手, 足, 上, 下, 中, 外, 右, 左, 前, 後, 東, 西, 南, 北)
- **Grammar (about 80 points, 8–10 cloze decks of 10–15).** Particles は/が/を · Particles に/で/へ · Particles と/や/も/の/から/まで · Copula & noun sentences (です/じゃない/でした) · Verb forms (ます/ません/ました/ませんでした/ましょう/ませんか) · て-form uses (てください/ています/てもいいです/てはいけません) · Adjective conjugation (い and な, present/past/negative) · Existence & position (あります/います + location) · Comparison & preference (より/のほうが/いちばん/が好き) · Common N5 patterns (たい/ことができる/前に/後で/ながら/から/ので/が/でも/もう/まだ)

**A/C**
- [x] `content/coverage-n5.md` lists every area above, and each line is either ticked with its deck id or explicitly marked as skipped with a reason.
- [x] Vocabulary decks total at least 700 distinct items, the kanji decks cover at least 100 kanji, and the grammar decks cover at least 75 distinct grammar points. A test asserts these totals against the N5 decks, so shrinking content fails the build.
- [x] Every deck holds 10–30 items and passes the Phase 1 validation test, and no item id appears in two decks.
- [x] Every N5 deck offers at least the `meaning` and `reverse` modes, and kanji decks also offer `reading`.
- [ ] **Still owed:** a human spot-check of three random decks for wrong readings or glosses. The tests check structure, not correctness of the Japanese. See the soft spots listed in `content/coverage-n5.md`.
- [x] The N5 section of the home page groups these decks readably (vocab, kanji, grammar), since 40+ decks need structure. Revisit Phase 3's home layout if it doesn't hold up.

### Phase 4: Go + SQLite backend (can run in parallel with Phases 2–3.5)
- Set up `server/` with Go ≥1.22, using the standard `net/http` pattern routing (no framework) and **`modernc.org/sqlite`**. It's pure Go, so it needs no CGO and builds cleanly on Windows.
- `content/` is embedded via a small Go package at the repo root, or copied with `go generate`. Pick whichever is simpler, since `go:embed` can't reach `../`. **Built as:** one module `learnjapanese` at the repo root (not `learnjapanese/server`), with `embed.go` at the root owning the embedded `content/decks/*.json` and `server/` as `package main` importing it. `go run ./server`, `go test ./...` and `go vet ./...` all run from the repo root. On startup the server upserts decks into SQLite, and running it twice is safe.
- Schema:
  - `decks(id PK, level, grp, title, title_ja, ord, json)`
  - `attempts(id PK, client_id, deck_id, mode, correct, total, created_at)`
  - `item_stats(client_id, item_id, seen, correct, updated_at, PK(client_id,item_id))`
- Endpoints (JSON; `client_id` is an anonymous UUID the frontend generates, not auth):
  - `GET  /api/health`
  - `GET  /api/decks` returns summaries without items, optionally filtered with `?level=N5`
  - `GET  /api/decks/{id}` returns the full deck JSON
  - `POST /api/attempts` takes `{clientId, deckId, mode, correct, total, items:[{itemId, correct}]}`, validates it, inserts the attempt and upserts `item_stats`
  - `GET  /api/progress?clientId=` returns `{decks: {"deckId:mode": {best,last,at}}, items: {itemId:{seen,correct}}}`
- Config comes from env vars: `PORT` (default 8080) and `DB_PATH` (default `./data/app.db`; `:memory:` in tests). Allow CORS for the Vite dev origin.

**A/C**
- [x] `go test ./...` passes. It uses `httptest` + an in-memory DB and covers every endpoint's happy path, 404 for an unknown deck, and 400 for a bad attempt payload (missing fields, `correct > total`, unknown deck).
- [x] Seeding is idempotent: the test seeds twice and counts rows.
- [x] `go run ./server` (or `cd server && go run .`) serves `/api/decks` with all decks from `content/`.
- [x] `go vet ./...` is clean.

### Phase 5: Connect frontend ↔ backend
- `src/api.ts` gets two implementations of the same interface, `listDecks`, `getDeck`, `postAttempt` and `getProgress`: `staticApi` (JSON + localStorage) and `httpApi`. `VITE_API_URL` chooses between them. If it's unset, the app uses static mode, so the frontend still works on its own.
- Add a Vite dev proxy from `/api` to `localhost:8080`, and generate and persist the anonymous `clientId` in localStorage.
- In HTTP mode, localStorage stays as an offline fallback: failed posts are queued and retried later. Keep it simple, and it's fine to drop this if it gets hairy.
- Two contract details the frontend treats as optional, so it works either way: a deck summary may carry `itemCount` (the home page shows "N items" only when it does), and a score entry may carry `total` (the deck page falls back to the generated question count). If the server sends both, the HTTP and static modes look identical.

**A/C**
- [x] Unit tests cover `httpApi` with a mocked `fetch` (correct URLs and payloads, and errors surface without crashing the UI). See `src/api.test.ts`.
- [ ] Manual check with the backend running: complete a session, refresh, and the best score still shows; it also appears via `GET /api/progress`.
- [x] With `VITE_API_URL` unset, the app behaves exactly as it did at the end of Phase 3 (the whole suite runs in static mode).
- [x] A root-level `README.md` lists the dev commands for both halves.

### Phase 6: N4 content (only after Phase 3.5's checklist is complete)
Same shape as Phase 3.5, with `level: "N4"` and `content/coverage-n4.md`. N4 is roughly 1,500 more words, about 200 more kanji and about 100 more grammar points, so expect it to be bigger than all of N5. Suggested starting decks: Work & school · Health & illness · Travel · Shopping & services · Feelings & personality · Transitive/intransitive pairs · Giving & receiving (あげる/くれる/もらう) · て-form patterns II · Conditionals たら/ば/と/なら · Potential, passive & causative · Volitional & plain-form patterns · Keigo basics · N4 kanji sets. No code changes should be needed. If any are, that's a bug in the level-agnostic design.

### Backlog (not planned in detail)
- Redesigned flashcards with spaced repetition (SM-2/FSRS), using `item_stats`
- A typed-answer mode (kana input with romaji→kana conversion), and a listening mode (Web Speech API TTS)
- A "weak items" cross-deck review built from `item_stats`, plus hiragana/katakana chart decks
- Auth (turning `client_id` into accounts), and deployment (a single Go binary serving the built `dist/`)
- CI (GitHub Actions running `npm test`, `npm run build` and `go test ./...`)

## Conventions for agents
- Keep the existing style: `<script setup lang="ts">`, double quotes, small pure helpers, and no state library (reactive modules are enough).
- Pure logic goes in `src/study/*` with a colocated `*.test.ts`. Components stay thin.
- Content changes only need the validation test to pass, with no code changes. If it fails, fix the content, not the test.
- Don't add dependencies beyond the ones named here without a reason noted in the PR/commit.

## Verification (end-to-end)
1. `npm test` and `npm run build` pass at repo root.
2. `cd server && go vet ./... && go test ./...` pass.
3. Run `go run .` in `server/` and `npm run dev` with `VITE_API_URL=/api`. In the browser, open an N5 deck, finish a meaning quiz and a cloze quiz, refresh, and check that the scores persist and show in `curl localhost:8080/api/progress?clientId=<id from localStorage>`.
4. Stop the server, unset `VITE_API_URL`, and check that the app still works in static mode.
5. Coverage: `content/coverage-n5.md` has every line ticked or explicitly skipped, and the coverage-total test passes.
