# 習い (LearnJapanese): Tags Plan

> **For agents:** A standalone initiative. `docs/PLAN.md` still holds the content format, architecture and conventions. Refer to phases as **Tags Phase N**. Tick A/C items here as you finish them. Each phase gets its own branch and PR against `master`.
>
> **Builds on `docs/PLAN-dashboard.md`** (per-unit mastery stats and the per-answer log), which is merged.
>
> **Comes before `docs/PLAN-test-understanding.md`.** The agreed order is Tags Phase 1 → Tags Phase 2 → Test Phase 1 onwards. Test Phase 2 ranks distractors by this plan's type tags. Test Phases 1 and 3 reuse Tags Phase 2's `scope` column, `customDeckFrom`, `pickUnits` and Custom session routes, so build those as general helpers, not tag-only ones.

## Context

Every study session today is one hand-authored deck: 10–30 words on one theme, such as Places, Verbs II or Food. That's a good way to learn new words, but there's no way to study across decks by kind of word, like "all verbs", "every time word" or "u-verbs only".

This plan **keeps the decks as they are** and adds **tags** alongside them. Tags only matter in one place, a new **Custom study** page. There you pick tags, and the app **builds a deck-sized session for you** from the matching words. A tag can match 50+ words (there are about 110 verbs), but a Custom session is still about 20, picked with the words that need work first.

**Not in this plan:**
- Changes to existing decks, deck pages or deck scores. Decks stay the unit you learn new words in.
- Tags on kanji, grammar or particles decks.
- Saved Custom decks, and mastery per tag on the dashboard (see Later).

## Design

### Where tags live: deck defaults plus per-word additions
- `Deck.tags?: Tag[]` gives defaults that every item in the deck inherits. `Item.tags?: Tag[]` adds more.
- A word's tags are `deck.tags ∪ item.tags`. A word *has* the tags its deck implies, but they're written once, on the deck. For example, all four `n5-verbs-*` decks declare `["verb"]`, and none of their items repeat it.
- Item-level tags cover what the deck doesn't:
  - verb class on each verb (`u-verb`, `ru-verb`, `irregular-verb`)
  - a type when the deck mixes kinds of word (the verbs in `n5-clothing`, the adverbs in `n5-time-words`)
  - a theme that reaches outside the obvious deck, e.g. 駅 in `n5-places` gets `transport`, and 食べる in `n5-verbs-1` gets `food`
- Repeating a deck tag on an item is a validation error, so there's only one place each tag is written.
- A deck only declares a tag that's true of **every** item in it. Tags can't be removed per item, so a deck that mixes nouns and verbs puts its type tags on the items.

### Tag list: word type plus themes, fixed in code
`TAGS` lives in `src/types.ts` next to `DECK_GROUPS`: a record from tag id to `{ facet, label, labelJa }`, where `facet` is `"type"` or `"theme"`. Its key order is the display order. `VERB_CLASSES` and `UNTAGGED_GROUPS` sit next to it.

The list, as built in Tags Phase 1:

| Facet | Tags |
|---|---|
| type | noun, number, counter, verb, u-verb, ru-verb, irregular-verb, i-adj, na-adj, adverb, conjunction, question-word, expression |
| theme | time, place, people, food, nature, body ("Body & health"), home, school ("School & study"), transport ("Getting around"), shopping ("Shopping & money") |

A word can have more than one type (何枚 is a `counter` and a `question-word`; 元気 is a `noun` and a `na-adj`).

**Rules, enforced by `src/content.test.ts`:**
- **Every theme spans ≥ 2 decks.** A theme that matches one deck is just a copy of that deck. For example, "animals" and "clothing" aren't tags, because those decks already are that set. Type tags are exempt: every word needs one, and some kinds of word live in one deck (all 11 conjunctions are in `n5-connectors`).
- **Every tag has ≥ 8 distinct words**, so a Custom deck made from it alone can build 4-choice questions.
- **Every word has at least one type tag**, so new content can't slip in untagged.
- **Every verb has exactly one verb class**, matching its `note` when the note names one.
- **Kanji, grammar and particles decks aren't tagged** (`UNTAGGED_GROUPS`). Their items are single characters, grammar forms and cloze questions, not words. A kanji item like 行 ("to go") would also sit awkwardly next to 行く in a verbs session.

### Building a Custom deck (`src/study/tags.ts`)
Pure functions with a colocated `tags.test.ts`:

- `tagsOf(deck, item): Tag[]`: the deck's tags plus the item's, in `TAGS` order. *(Added in Tags Phase 1, which the content checks use.)*
- `matchingUnits(decks, level, selected)`: the words that match the selected tags.
  - Tags in the **same facet widen** the set: `verb` + `adverb` means verbs *or* adverbs.
  - Tags in **different facets narrow** it: `verb` + `time` means time-related verbs.
  - Some words collide across decks: the same plain `ja` with different meanings (そば is "close by" in `n5-positions` and "buckwheat noodles" in `n5-food-2`), or the same meaning in different words (万 and 一万 are both "ten thousand"). Each deck is free of these internally (a content check), but a Custom deck isn't. So `pickUnits` skips a candidate whose plain `ja` or `en` matches one already picked. Otherwise a meaning or recall question could have two right answers.
- `pickUnits(candidates, stats, rng, { size = 20, order = "needs-work" })`: caps a candidate list. The default `"needs-work"` order is:
  1. weak (`isWeak`)
  2. learning (least recently seen first)
  3. new (curriculum order)
  4. known (least recently seen first)

  Ties are broken by `rng`, so "New set" gives a different pick. `customDeckFrom` drops colliding units too (keeping the first), so a list passed in directly, such as a word test's misses from several decks, is safe as well. The order is a parameter because Test Phase 3's `wordSet` reuses this with an oldest-tested order.
- `customDeckFrom(decks, unitIds, title): Deck`: an ordinary `Deck` (`id: "custom"`, `group` taken from the units) holding exactly those units. Items go in `items`; cloze questions go in `questions`. `buildQuestions` and `availableModes` in `src/study/modes.ts` then work unchanged, and distractors come from the chosen words. Every choice in a verbs-only session is a verb, which makes answers harder to guess by word type. Tag selections never include cloze questions, but Test Phase 1's "Practise the ones you missed" can, and then cloze is offered when there are enough of them.
- `buildCustomDeck(decks, stats, selected, rng, size = 20)` is just `customDeckFrom(decks, pickUnits(matchingUnits(...), ...), title)`, with a title such as "Verbs · Time".

### Recording
- A Custom session posts with **`scope: "custom"`** and an empty `deckId`.
- Per-word stats update exactly as they do for a deck session, since `item_stats` is keyed by item. So the dashboard coverage, deck mastery bars and weak list all reflect Custom study with no extra work.
- It is **not a deck score**. It's skipped by `saveScore` and by the server's best-score query, the same way `retry` runs are.
- This plan adds the `scope` field and column. The test-understanding plan adds `scope: "words"` (word tests across decks) and `mode: "test"` on top of them.
- Anything that groups sessions by deck (dashboard activity per level, and later Struggling decks) maps each **answer's** unit to its deck instead of trusting `attempt.deckId`. The test plan relies on the same mapping.

## Tags Phase 1: Tag the content

- `src/types.ts`: add `TAGS`, `Tag`, `TAG_FACETS`, `VERB_CLASSES`, `UNTAGGED_GROUPS`, and `tags?` on `Deck` and `Item`.
- `src/study/tags.ts`: `tagsOf`, with a test.
- Tag the 35 taggable decks: deck defaults first, then item-level additions.
  - Base verb class on the existing `note` values ("u-verb" ×70, "ru-verb" ×23, "irregular" ×16).
  - Leave `note` as it is: it also holds free-form hints ("sound change: さんぼん") and is shown in sessions.
- Checks added to `src/content.test.ts`:
  - every tag is in `TAGS`
  - no tags on kanji, grammar or particles decks, at deck or item level
  - no item repeats a tag its deck already declares, or lists one twice
  - every tag has ≥ 8 distinct words, and every theme spans ≥ 2 decks
  - a verb has exactly one of `u-verb`, `ru-verb` and `irregular-verb`, and a non-verb has none
  - an item whose `note` is a verb class ("u-verb", "ru-verb", or "irregular" on a verb; months-dates also uses "irregular" for readings) has the matching tag
  - every item in a taggable deck has at least one *type* tag, so new content can't slip in untagged. A deck-level type tag covers this in one line.
- The server needs nothing: `server/deck.go` stores the raw deck JSON and ignores fields it doesn't parse.

**A/C**
- [x] The content checks above are in `content.test.ts` and pass. *(Also checked that they fail: an unknown tag, a repeated deck tag and a missing type tag each fail the deck's check.)*
- [x] The PR description has a table of each tag with its word count and the decks it draws from.
- [x] `npm test` and `npm run build` pass. *(`go test ./...` and `go vet ./...` too, though the server is unchanged.)*

## Tags Phase 2: Custom study page

- `src/study/tags.ts` + `tags.test.ts`, as described in Design: `matchingUnits`, `pickUnits`, `customDeckFrom`, `buildCustomDeck` (`tagsOf` is already there).
- **Routes** (`src/router.ts`):
  - `/study` → `CustomView.vue`, with a "Custom" link in the header (`src/App.vue`) next to "Progress"
  - `/study/:mode` and `/study/:mode/result` reuse `SessionView` and `ResultView` through a `custom` route prop, rather than copying them
  - The built deck is kept in memory in `src/session.ts` (a `customDeck` ref, like `lastResult`). A refresh or a hand-typed session URL finds no deck, and the router guard sends you back to `/study`.
  - Any screen can start a Custom session by setting `customDeck` and pushing `/study/:mode`. Test Phase 1's "Practise the ones you missed" does exactly that.
- **The page, top to bottom:**
  1. tag chips grouped by facet (Word type, Theme)
  2. a live count: "58 words match · this deck takes 20"
  3. the picked words, with furigana, gloss and a mastery dot (the `--known` / `--learning` / `--new` tokens)
  4. a "New set" button that picks again with a fresh seed
  5. mode buttons from `availableModes(customDeck)`
  - a level switch only when N4 has decks (the dashboard's rule)
  - an empty state when nothing matches, e.g. "No words are both *verb* and *food*"
- **Result screen:** "Retry missed" works through `retryQueue`. The back links go to `/study`.
- **Recording, frontend:**
  - `NewAttempt` and `AttemptRecord` gain `scope?: "deck" | "custom"` (missing means `deck`)
  - `staticApi` skips `saveScore` for custom sessions
  - `importAttempts` in `src/progress.ts` accepts custom attempts instead of skipping them as "unknown deck"
  - backups stay `version: 1`. `scope` is optional.
  - `DashboardView` filters attempts by `levelDeckIds.has(attempt.deckId)`, which would drop custom sessions from activity and streaks. Filter those by their answers' decks instead. Check every other use of `attempt.deckId` the same way.
- **Recording, server** (`server/api.go`, migration in `server/db.go`):
  - add `attempts.scope TEXT NOT NULL DEFAULT 'deck'` through the existing add-column migration
  - `validate()`: `deck` requires an existing deck (as now). `custom` requires an empty `deckId` and at least one item. Any other scope is rejected.
  - the best-score query for `/api/progress` ignores custom sessions
  - export and import carry `scope`

**A/C**
- [ ] `tags.test.ts` covers:
  - OR within a facet and AND across facets
  - skipping collisions across decks: the same `ja` (そば) or the same `en` (万 / 一万)
  - the pick order (weak → learning → new → known), a caller-supplied order, and the size cap
  - `customDeckFrom` with a mix of items and cloze questions from different decks
  - a different seed gives a different pick when there's a choice
  - a matching set smaller than the cap gives all of it
- [ ] A component test mounts `CustomView` with a stubbed API: selecting chips updates the count and the word list, and a mode button starts a session.
- [ ] `router.test.ts`: `/study` renders, and `/study/meaning` with no built deck redirects to `/study`.
- [ ] Static mode: a custom session updates item stats and the attempt log, but no deck score.
- [ ] Go:
  - a custom attempt is stored and updates `item_stats`
  - it doesn't appear in `/api/progress` deck scores
  - it survives export → import
  - a `deck` attempt with an empty or unknown deck is still rejected
  - the migration runs twice safely on an existing database
- [ ] The dashboard's activity and streak count custom sessions.
- [ ] `npm test`, `npm run build`, `go test ./...` and `go vet ./...` pass.
- [ ] Manual: build "verb + u-verb", finish the session, and see those words' mastery change on the dashboard. At 375px wide, in light and dark, nothing overflows.

## Later (not planned yet)
- **Mastery per tag** on the dashboard, with a "Practise these" link to `/study?tags=…`.
- **Weak-words review:** the one home for this idea, which `docs/PLAN.md`'s backlog and the dashboard plan's Later point to. It's `customDeckFrom(pickUnits(weak units))`, e.g. a "Weak words" option on the Custom page. The test version is the **Weak** word test in Test Phase 3.
- A **mastery filter** on the Custom page (new / learning / weak only).
- **Saved Custom decks**, if re-running the same selection turns out to be common.

## Verification (end-to-end)
1. `npm test`, `npm run build`, `go vet ./...` and `go test ./...` pass at the repo root.
2. Static mode (`npm run dev`): build a Custom deck, finish it, and check the dashboard and the words' deck pages show the new mastery. No deck score changes.
3. HTTP mode (`go run ./server` + `VITE_API_URL=/api npm run dev`): the same session is recorded with `scope = 'custom'`, and a backup exported then imported into an empty database reproduces it.
