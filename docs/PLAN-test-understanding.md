# 習い (LearnJapanese): Test Understanding Plan

> **For agents:** A standalone initiative. `docs/PLAN.md` still holds the content format, architecture and conventions. Refer to phases as **Test Phase N**. Tick A/C items here as you finish them. Each phase gets its own branch and PR against `master`.
>
> **Depends on `docs/PLAN-dashboard.md`.** Test Phase 1 needs Dashboard Phase 1 (the per-answer log with `kana`/`hints` flags). Test Phase 3 needs Dashboard Phase 2 (the dashboard page). Don't start this plan before Dashboard Phase 1 is merged.
>
> **Comes after `docs/PLAN-tags.md`.** The agreed order is Tags Phase 1 → Tags Phase 2 → Test Phase 1 onwards. This plan reuses what the tags plan builds: the `scope` column on attempts, the "deck from these words" helper (`customDeckFrom`) and the Custom session routes (Test Phases 1 and 3), `pickUnits` for capped word sets (Test Phase 3), and type tags for ranking distractors (Test Phase 2).

## Context

The dashboard plan counts a unit as **known** after 3 correct answers in a row, in any mode, with any settings. That measures *practice*, not understanding. In practice sessions a lot of help is on screen:

| Help | Where it leaks the answer |
|---|---|
| Furigana (Kana toggle) | Meaning mode shows the reading, so a word you recognise by sound but can't read still scores |
| Hints (gloss tooltips) | `{base\|reading\|gloss}` segments give away meanings, and in cloze prompts they explain the sentence |
| English line under the prompt | Reading mode shows the meaning, and cloze shows the translation, so you can guess from context |
| 4 choices from one small deck | 25% by chance, and choices can often be ruled out by topic, length or shape |
| Immediate feedback | Seeing the answer to `水:meaning` gives away `水:reverse` later in a retry |

The goal of this plan is a **test** that's as hard to guess as possible, and a mastery tier that only counts answers given under test conditions: "I can actually do this without help", not "I've clicked through this deck three times".

The plan gets there in steps. First it removes the help on screen (Test Phase 1) and makes the choices harder to rule out (Test Phase 2). Then it replaces choosing with **typing** (Test Phases 4–5), so that in the end **tests have no multiple choice at all** and guessing isn't possible.

## Design

### Two kinds of test
- **Deck test:** every unit in one deck, started from a "Test" button on the deck page, next to the practice modes. It gives you a score for the deck as a whole. A 25-item vocab deck gives roughly 50–75 questions.
- **Word test:** a hand-picked set of words from any decks, capped at 20 words per test. You start one from the dashboard or a result screen with one of these sets:
  - **Ready:** known but not yet mastered (the next step up)
  - **Missed:** failed in your most recent test of each deck
  - **Weak:** flagged weak in practice
  - **This deck's misses:** from a deck test's result screen

  When a set has more than 20 words, the ones not tested for longest go first.

Both kinds have the same rules, count towards `mastered` in the same way, and feed the per-deck view below. A unit's result doesn't depend on which kind of test it came from.

### Seeing which decks you struggle with
The dashboard's deck grid already sorts by "least learned". This plan adds a **Struggling decks** list: decks ranked by the share of their tested units that failed their most recent test, alongside weak practice units. Each row shows the deck's test pass rate and offers **Practise** and **Test again** buttons, so you can pick the two or three worst decks and focus on them for a while. A deck only appears once at least 5 of its units have been tested, so one bad question doesn't put a deck on the list.

### What a test is like
- **Every applicable mode for every unit,** interleaved and shuffled:
  - items: `meaning` and `reverse`, plus `reading` if the item contains kanji
  - cloze questions: `cloze`
  
  A unit passes the test only if it passes **all** its questions.
- **No help on screen:** furigana off (with the level-appropriate script rule below), hints off, and no English line in reading or cloze prompts. The header toggles show as locked ("Test: no kana, no hints") and your saved settings are not changed.
- **No feedback until the end.** Answering moves straight to the next question. The result screen shows every unit as pass or fail, with the correct answers.
- **"I don't know"** is always available: key `0` for multiple choice, or an empty submit for typed answers. It's scored as wrong, but it stops forced guesses from inflating the score by chance.
- **Optional timer, just for fun.** A "Timer" switch on the test's start row, off by default and remembered locally. When it's on, a stopwatch shows the elapsed time during the test, and the result screen shows the total and the average per question. It doesn't affect scoring, isn't sent to the server, and nothing else uses it.
- **No retry-missed for tests.** A retry would test short-term memory of the answers you just saw. Instead the result screen offers "Practise the 7 you missed" (a practice session limited to those units: a Custom deck built with `customDeckFrom` from `docs/PLAN-tags.md`, so it works for word tests that span decks) and, later, a word test of them.

### Level-appropriate script
Turning furigana off shouldn't turn an N5 vocab question into a kanji test beyond the syllabus. The real JLPT writes words in kana when their kanji are above the level, and the test does the same.

- The **level's kanji set** comes from the content: every kanji in the `ja` of that level's (and lower levels') `kanji` decks. It isn't a hand-kept list, so adding N4 kanji decks automatically extends N4 tests.
- With furigana off, a segment whose base contains a kanji **outside** the set is shown as its reading (`{映画|えいが}` → えいが, if 映 isn't N5). A segment whose kanji are **all** in the set is shown as plain kanji.
- Pure function: `levelScript(segments, kanjiSet): RubySegment[]` in `src/study/script.ts`.
- **Reading questions** only use items where at least one kanji is in the set. Asking the reading of a word shown in kana would be pointless.

### Harder choices (Test Phase 2)
Tests keep **4 choices** (plus "I don't know"), the same as practice, but the 3 distractors are much harder to rule out:

- **Level-wide pools:** distractors come from every deck of the same level and group (all N5 vocab, all N5 kanji), not just this deck, so topic can't rule them out.
- **Similarity ranking:** candidates are scored and the closest ones picked, with the seeded `rng` breaking ties:
  - meaning (EN choices): the same *type* tags (`tagsOf` from `docs/PLAN-tags.md`, such as `verb` + `ru-verb` or `i-adj`), a similar word count, and the same deck first
  - reverse (JA choices): a shared kanji, a similar kana length, and the same type tags
  - Type tags, not `note`: `note` only names a part of speech on verbs and is free-form elsewhere, while Tags Phase 1 gives every taggable word at least one type tag. Grammar and particles items have no tags, so for them this criterion simply scores equal.
  - reading (kana choices): **minimal pairs**, generated by `kanaVariants(kana)`: add or drop a small っ, lengthen or shorten a long vowel (おばさん ↔ おばあさん), swap dakuten (か ↔ が), swap ょ ↔ よ, and swap similar-looking kana (ぬ ↔ め, シ ↔ ツ). After those, readings of other items with the same length.
  - cloze: the authored distractors as they are
- Every choice set is still deduplicated by displayed text, and the correct answer never appears as a distractor (the rule from the original modes).

Once Test Phase 5 removes multiple choice from tests, this ranking isn't wasted: it becomes an optional "Hard choices" setting for practice.

### Typed answers (Test Phases 4–5)
Recall is harder to guess than recognition. Typing replaces choosing in two steps:

- **Test Phase 4, Japanese answers:**
  - **reading** questions become typed kana
  - **reverse** questions become typed Japanese: the kana reading or the written form, both accepted

  Input accepts kana from the OS IME, or romaji converted as you type (`ka` → か, `kka` → っか, `nn`/`n'` → ん). Grading converts katakana to hiragana for kana-only answers, trims whitespace, and ignores `〜`. Near misses (a missing っ or long vowel) are wrong, because that's exactly what a reading test is for.
- **Test Phase 5, no multiple choice at all:**
  - **cloze** becomes typing the missing word. Answers are short (particles like に/が/の, or verb forms like います), graded like Japanese answers.
  - **meaning** becomes typing the English. It's graded leniently, because English has endless synonyms (see Test Phase 5), and with a **"Count it"** override on the result screen: if the grader marked a reasonable answer wrong, you can flip it to correct before it counts. This relies on your honesty, which is fine for a single-user app.
  - After this phase, tests have **no multiple choice**. Practice modes keep it, with an optional "Type answers" setting that uses the same typed questions outside tests.

### Mastery: a fourth tier
The dashboard's states stay as they are, and **mastered** goes on top:

| State | Rule |
|---|---|
| `new` | never answered |
| `learning` | answered, but no practice streak of 3 |
| `known` | practice streak ≥ 3 (the dashboard's rule, unchanged) |
| **`mastered`** | the unit's **most recent test**, deck or word, passed every one of its questions |

- Only **test** answers affect `mastered`. Failing a unit in a later test drops it back to its practice state. Practice answers never change `mastered`.
- Stats gain `testedAt`, `testPassed` and `masteredAt` (the first time; never cleared, like `knownAt`). They're computed from the answer log with the same rebuild the dashboard plan introduced, so past tests count as soon as this lands.
- The dashboard headline becomes "**Mastered** 180 · Known 412 · Learning 230 · New 213 of 1,035", and the "learned over time" chart gains a mastered line.
- Mastery doesn't depend on *how* you answered. A unit mastered by multiple choice before Test Phase 5 stays mastered until a typed test fails it. Each answer records whether it was typed, so a stricter "typed only" rule could be rebuilt from the log later if you want one.

### Data model changes
Answers need a **mode**: in a test the same unit is answered in several modes in one session. This is a change to the Dashboard plan's schema, and it has been folded into `docs/PLAN-dashboard.md` (`answers(attempt_id, item_id, mode, correct)`), so no migration is needed here as long as that plan lands first.

- A test session is an attempt with `mode: "test"` and a `scope` of `deck` or `words`. A word test spans decks, so its `deck_id` is empty. The `scope` column already exists from Tags Phase 2 (which added `deck` and `custom`); this plan adds the `words` value. Per-deck results always come from mapping each answer's unit to its deck in TS, which works for both kinds.
- Each answer carries its own mode (`meaning`, `reverse`, `reading`, `cloze`).
- `kana: false, hints: false` on every test attempt, so "unassisted" is also true of the stored data.
- `answers` gains:
  - `skipped` ("I don't know"), stored as `correct = 0` so accuracy maths is unchanged
  - `typed` (Test Phase 4)
  - `response`, the text typed (Test Phase 4), kept so graders can be improved and answers re-graded later
- `POST /api/attempts/{uid}/overrides` records "Count it" flips (Test Phase 5), and the rebuild applies them.
- Server validation accepts `"test"` as an attempt mode, requires a known per-answer mode on test answers, and allows an empty `deckId` only for word tests (`scope: "words"`) and Custom practice sessions (`scope: "custom"`, from Tags Phase 2).

---

## Test Phase 1: Deck tests

- `src/study/script.ts`: `levelKanji(decks, level)` and `levelScript(segments, kanjiSet)`.
- `src/study/test.ts`: `buildTest(units, decks, rng): Question[]` interleaves every applicable mode per unit, using the existing builders with the strict presentation. `scoreTest(questions, answers)` returns results per unit and per question. It takes a list of units, not a deck, so Test Phase 3's word tests reuse it unchanged.
- Presentation override: `RubyText` reads a provided `presentation` (`{kana, hints}`) before falling back to the global settings. The test session provides `{kana: false, hints: false}`. Question building applies `levelScript` and leaves out `promptEn` for reading and cloze.
- `QuizSession`: a `test` prop that disables per-question feedback and adds the "I don't know" choice (key `0`).
- Routes:
  - `/deck/:id/test` and `/deck/:id/test/result`
  - the result screen lists each unit as pass/fail with the right answers and offers "Practise the ones you missed", which builds a Custom deck with `customDeckFrom(missedUnits)` and opens it on the Custom session route from Tags Phase 2
  - no retry
- Deck page: a "Test" row below the practice modes, with the last test's pass rate and date.
- Header: while a test is running, the toggles are disabled and show a "Test" badge.
- Timer: a small `Stopwatch` component shown only when the Timer switch is on. The on/off choice is saved in localStorage (like the font picker), and the elapsed time is shown on the result screen only.
- Recording: `postAttempt` with `mode: "test"`, `scope: "deck"`, a per-answer `mode` and `skipped`.

**As built (notes for later phases)**
- `buildQuestion(deck, unitId, mode, rng)` in `modes.ts` builds one question; `buildTest` uses it per unit and mode.
- When a unit's own deck can't offer three distinct distractors (a small deck's reading questions, say), the question borrows from every deck of the same level and group. Test Phase 2 replaces this with the ranked level-wide pool.
- A test attempt's `correct`/`total` count **units passed / units tested**, so the deck page's "last 18/25 passed" is the ordinary `deckId:test` score, from `localStorage` or `GET /api/progress`.
- "Practise the ones you missed" builds the deck with `missedDeck`, which is `customDeckFrom` plus a `pool` of the rest of those words' decks. `Deck.pool` is an in-memory field, never content: distractors only, so a practice deck of two words still has four choices. It opens on the first mode that deck can play.
- The Timer switch is `settings.timer`, saved with the other settings in `lj.settings`.

**A/C**
- [x] `script.test.ts`:
  - the N5 kanji set is derived from content, includes known N5 kanji (日, 水, 食) and excludes a non-N5 one
  - `levelScript` keeps in-set kanji, turns out-of-set segments into their reading, and leaves plain kana alone
- [x] `test.test.ts`:
  - every unit appears in every applicable mode exactly once
  - reading questions only use items with in-set kanji
  - nothing in the built test has a reading shown, a hint gloss, or a `promptEn` for reading or cloze
  - the same seed gives the same test
  - a unit with one wrong or skipped question fails
- [x] A component test runs a small test with keys, including `0` for "I don't know". It checks that no correct/incorrect feedback appears between questions and that the emitted results are per unit.
- [x] Global settings are the same before and after a test session (a test toggles Kana on, runs a test and checks it's still on).
- [x] Timer, with fake timers: off by default, the stopwatch shows elapsed time when it's on, the result screen shows the total, and the posted attempt payload contains no timing fields.
- [x] The Go server accepts `mode: "test"` with per-answer modes, and rejects a test answer without a mode (400).
- [x] `router.test.ts` covers the test and test-result routes, and a bad deck redirect.
- [x] `npm test`, `npm run build`, `go test ./...` and `go vet ./...` pass.

## Test Phase 2: Harder choices

- `src/study/distractors.ts`:
  - `levelPool(decks, level, group)`
  - `rankCandidates(target, candidates, kind, rng)`, the similarity scoring above
  - `kanaVariants(kana)`, the minimal pairs
- Test questions take their 3 distractors from the ranked level-wide pool. Practice modes are unchanged.

**As built**
- Reading choices come as **two pairs**: the answer and one near miss of it, plus a real reading of similar length and one near miss of *that*. With two near misses of the answer, the answer would be the one every other choice is spelled from, which gives it away.
- `kanaVariants` returns the likeliest mistakes first: dropped っ, long vowels and ー, and ゃゅょ written full size; then added っ or long vowels inside the word, and dakuten swaps; then long vowels added at the end, and look-alike kana. `nearMiss` picks among the first three.
- `alsoRight` keeps out candidates that would also be right: the same word (そば twice), or a shared sense after normalising the gloss ("to eat" and "to eat (honorific)"). A homograph's reading is never offered either.
- `src/study/modes.snapshot.test.ts` snapshots practice questions for a fixed seed, recorded before this phase. Practice is unchanged.

**A/C**
- [x] `kanaVariants` produces the expected variants for fixed inputs (きって, おばさん, がっこう, きょう). It never returns the input itself, and every variant is valid kana.
- [x] Ranking tests with fixed fixtures: a meaning candidate with the same type tags outranks a different one, and a shared-kanji reverse candidate outranks an unrelated one.
- [x] A property test over **every real deck**: every test question has exactly 4 choices, unique by displayed text, exactly one is correct, and the correct text never appears as a distractor, even when glosses or readings collide across decks.
- [x] Practice-mode snapshots from the original plan are unchanged.

## Test Phase 3: Mastered tier, word tests & struggling decks

- `mastery.ts`: `testedAt`, `testPassed` and `masteredAt` in `ItemStat`, test answers applied during the rebuild, and `masteryOf` returning `mastered`.
- `analytics.ts`:
  - `coverage`, `byGroup`, `byDeck` and `learnedOverTime` include `mastered`
  - `wordSet(kind, level, progress, limit = 20)` for the Ready / Missed / Weak sets, oldest-tested first. It selects the candidates and caps them with `pickUnits` from `src/study/tags.ts` (Tags Phase 2), passing an oldest-tested order, rather than writing a second capping helper.
  - `strugglingDecks(level, progress)`: the fail rate of each deck's most recent test results (minimum 5 tested units), plus its weak count, worst first
- Word tests:
  - a `/test/:set` route (`ready`, `missed`, `weak`), plus a "Test these" button on a deck test's result screen that tests that deck's misses
  - built with the same `buildTest`
  - recorded with `scope: "words"` and an empty `deckId` (the column and the per-answer deck mapping already exist from Tags Phase 2)
- Dashboard:
  - a fourth colour in every stacked bar, the new headline, and a mastered line on "learned over time"
  - a **Struggling decks** section, where each row shows the pass rate with **Practise** and **Test again** buttons
  - word-test buttons ("Test 20 ready words", and so on) next to "Next up", hidden when the set is empty
- Deck page: the mastery bar shows mastered as well.
- Extend the shared `testdata/mastery-cases.json` with test-answer sequences, which both Go and TS read.

**As built**
- The rebuild marks each answer of a test session with the session's uid (TS) or attempt id (Go). A unit's `testPassed` for that test is whether all of its answers in it were right. Test answers still count towards `seen`, `correct` and the practice streak.
- `masteryOf` returns `mastered` whenever `testPassed` is true. `isLearned` and `learnedOf(split)` count known or mastered, which is what the dashboard headline ("N of M units known"), the group bars and "least learned" use. The legend splits the two.
- `strugglingDecks(decks, stats, level)` works from each unit's stats, so a word test's answers count towards each word's own deck with no extra bookkeeping. Decks with nothing failed are left out.
- A "Test these" word test (`/test/these`) asks the words in `wordTestUnits`, held in memory like the Custom deck. Word tests take `?level=`, N5 by default.
- `src/practice.ts` holds `practiseUnits`, shared by a test's "Practise the N you missed" and the Struggling decks "Practise" button (that deck's failed and weak words).
- Server: `item_stats` and `item_base` gain `tested_at`, `test_passed` and `mastered_at`, and `statColumns`/`scanStat` read them in one place. Scope `words` must be a test and has no `deckId`.

**A/C**
- [x] `mastery.test.ts`:
  - practice-only answers never reach `mastered`
  - passing a test (deck or word) gives `mastered`
  - a later failed test drops it back to the practice state, while `masteredAt` stays
  - practice mistakes don't remove `mastered`
- [x] Rebuilding from a log that contains test attempts recorded **before** this phase gives the same result as recording them live.
- [x] Analytics tests:
  - the four-way split
  - each `wordSet` kind, the 20-word cap and oldest-first ordering
  - `strugglingDecks` ranking, the 5-unit minimum, and a word test's results counting towards each word's own deck
- [x] The Go server accepts a word-test attempt with an empty `deckId` and rejects an empty `deckId` on a deck test or a deck practice session (`scope: "deck"`). Custom practice sessions (`scope: "custom"`) still post with an empty `deckId`.
- [x] Component tests cover the dashboard's four-tier headline and the Struggling decks list (rows and their links).
- [x] The TS and Go tests pass against the extended fixture.

## Test Phase 4: Typed Japanese answers

- `src/study/romaji.ts`: `toHiragana(input)` with Hepburn and common variants (`shi`/`si`, `tsu`/`tu`, `chi`/`ti`, `fu`/`hu`, `ji`/`zi`), double consonants → っ, `n`/`nn`/`n'` → ん, and `-` → ー. Written in-house. If the edge cases get out of hand, switch to `wanakana` and note the reason in the PR, per the dependency rule.
- `src/study/grade.ts`: `gradeJapanese(response, accepted)` normalises (trims whitespace, converts katakana → hiragana for kana answers, strips `〜`) and compares against the accepted forms: the kana reading, and for `reverse` also the plain written form.
- `QuizSession`: typed questions render a text input with live romaji → kana conversion. Enter submits, an empty submit counts as "I don't know", and there's still no feedback until the end.
- In tests, **reading** and **reverse** become typed. Meaning and cloze stay multiple choice until Test Phase 5.
- Recording: answers carry `typed: true` and the `response`.
- Content check: extend the validation test so every item has non-empty accepted Japanese answers. Flag items whose `ja` holds alternatives (such as `・` or `/`) and fix the content, not the grader.

**A/C**
- [ ] `romaji.test.ts` covers every basic kana row, the variant spellings, っ doubling, ん before vowels and `y` (`kin'en` vs. `kinen`), long vowels, and passes through input that is already kana.
- [ ] `grade.test.ts` accepts the correct reading in hiragana, katakana and romaji, and the written form for reverse. It rejects a near miss (a missing っ, a missing long vowel).
- [ ] A component test types romaji into a test question, sees kana appear, submits, and gets the right per-unit result.
- [ ] The validation test passes for every deck, so every item can be graded when typed.

## Test Phase 5: No more multiple choice

- **Typed cloze:** the blank is typed and graded with `gradeJapanese` against the authored `answer`: its kana form and its plain form, for answers with furigana markup.
- **Typed meaning:** `gradeEnglish(response, item)`:
  - Accepted answers come from `en`, split on ` / ` ("cooked rice / meal" → either one), plus an optional per-item `accept: string[]` in the content for extra synonyms. This is a small, one-off content-format addition: the `Item` type, the Go struct, and a validation rule that entries are non-empty and unique.
  - Normalise both sides: lowercase, trim, drop punctuation, drop parenthetical notes ("light (in weight)" accepts "light"), drop a leading "to " for verbs, and drop a leading article.
  - Allow one typo (Levenshtein distance ≤ 1) for answers of 5 or more letters. Short words must be exact.
- **"Count it" override:** on the result screen, each typed meaning answer that was marked wrong has a "Count it" button. Flips are posted to `POST /api/attempts/{uid}/overrides` (and stored locally in static mode), and the rebuild treats them as correct. The server keeps the original grading too, so an override can be undone.
- **Tests are 100% typed:** every question in a deck or word test is a text input. The "I don't know" choice is replaced by empty submit, plus a visible "I don't know" button.
- **Practice:** a "Type answers" setting (off by default) makes practice sessions use the same typed questions, with the usual instant feedback. The Test Phase 2 distractor ranking becomes an optional "Hard choices" setting for multiple-choice practice.

**A/C**
- [ ] `grade.test.ts` (English):
  - each `/` alternative is accepted, and so is an `accept` entry
  - a parenthetical is optional, a leading "to " is optional for verbs, and case/punctuation are ignored
  - one typo is accepted on a long word and rejected on a short one
  - an unrelated word is rejected
- [ ] `grade.test.ts` (cloze): kana and plain forms of the authored answer are accepted, and one of the authored distractors is rejected.
- [ ] A property test over **every real deck**: every unit in every applicable mode can be built as a typed question, and its own correct answer (the `en`, reading or cloze answer) grades as correct.
- [ ] Override tests: a flip changes the unit's result after a rebuild, an undo restores it, and a flip on an unknown `uid` gets a 404.
- [ ] A component test runs a fully typed test (no choice buttons rendered) through to the result screen, and uses "Count it" once.
- [ ] With "Type answers" off, practice sessions are unchanged: the original practice tests still pass.
- [ ] `npm test`, `npm run build`, `go test ./...` and `go vet ./...` pass.

## Out of scope (possible later work)
- **Using the timer for anything:** per-question countdowns, storing times, or charting speed. For now the timer is a stopwatch for fun only.
- **Re-testing mastered units over time:** mastered decaying after N days without a test. This belongs with spaced repetition (still in `docs/PLAN.md`'s backlog), which can use `testedAt`.
- **Listening tests** (TTS audio → type what you hear).

## Decisions (settled 2026-09-20)
- **Test scope:** both kinds: whole-deck tests, and word tests of up to 20 hand-picked words, plus a Struggling decks view to focus on the weakest decks.
- **Choices:** 4 plus "I don't know", the same as practice, until Test Phase 5 removes multiple choice from tests.
- **"I don't know"** stays, as a choice at first and as empty submit once answers are typed.
- **Timer:** optional, off by default, just for fun (a stopwatch, not stored or scored).
- **End goal:** tests become fully typed (Test Phase 5). Multiple choice stays available for practice.

## Verification (end-to-end)
1. `npm test`, `npm run build`, `go vet ./...` and `go test ./...` pass at the repo root.
2. Turn Kana and Hints on, then start a deck test. No furigana, glosses or English lines appear. Words with out-of-level kanji show in kana, and your settings are the same afterwards.
3. Finish a deck test, deliberately missing two units and using "I don't know" once. The result screen shows exactly those three units as failed, the dashboard's mastered count goes up by the number of passed units, and "Practise the ones you missed" opens a practice session with those three.
4. Fail several units across two decks. Those decks appear at the top of **Struggling decks**, and "Test again" and a Missed word test both pick up the failed units.
5. After Test Phase 5: a deck test shows only text inputs. Typing a reasonable synonym that the grader marks wrong and pressing "Count it" makes the unit pass.
6. Stop and restart the server. The mastered counts and struggling decks are unchanged.
