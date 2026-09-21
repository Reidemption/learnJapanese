# N5 coverage checklist

Phase 3.5 of `docs/PLAN.md`: the goal is that someone who clears every N5 deck is
genuinely N5 ready. Every syllabus area below is either ticked with the deck that
covers it, or marked skipped with a reason. `src/coverage.test.ts` enforces the
totals so content cannot quietly shrink.

**Status: complete.** 50 N5 decks, 1035 items in total.

| Area | Deck | Items |
| --- | --- | --- |
| Greetings & set phrases | `n5-greetings` | 22 |
| Numbers 1–100 | `n5-numbers` | 24 |
| Money & big numbers | `n5-money` | 22 |
| Counters I: things & people | `n5-counters-1` | 23 |
| Counters II: long things, animals, times | `n5-counters-2` | 23 |
| Days of the week | `n5-days-week` | 19 |
| Family | `n5-family` | 24 |
| Months & dates | `n5-months-dates` | 25 |
| Telling time | `n5-telling-time` | 22 |
| Time expressions | `n5-time-words` | 22 |
| People & occupations | `n5-people` | 23 |
| The body | `n5-body` | 22 |
| Clothing | `n5-clothing` | 23 |
| Food & drink | `n5-food` | 24 |
| Food II: dishes & cooking | `n5-food-2` | 23 |
| Home & rooms | `n5-home` | 22 |
| Drinks & eating out | `n5-drinks-restaurant` | 22 |
| Furniture & household items | `n5-furniture` | 24 |
| School & stationery | `n5-school` | 24 |
| Nature & weather | `n5-nature-weather` | 24 |
| Animals | `n5-animals` | 22 |
| Colors & い-adjectives | `n5-colors-adjectives` | 26 |
| Transport | `n5-transport` | 22 |
| Directions & positions | `n5-positions` | 24 |
| い-adjectives II | `n5-adjectives-i-2` | 23 |
| な-adjectives | `n5-adjectives-na` | 23 |
| Adverbs & frequency | `n5-adverbs` | 24 |
| Places in town | `n5-places` | 24 |
| Conjunctions & connectors | `n5-connectors` | 22 |
| Classroom & travel phrases | `n5-daily-phrases` | 22 |
| Everyday verbs I | `n5-verbs-1` | 24 |
| Verbs II: movement & daily life | `n5-verbs-2` | 22 |
| Verbs III: communication & study | `n5-verbs-3` | 22 |
| Verbs IV: shopping & everyday actions | `n5-verbs-4` | 22 |
| Question words | `n5-question-words` | 16 |
| Basic particles | `n5-particles` | 14 + 12 cloze |
| Noun sentences & です | `n5-grammar-copula` | 14 + 12 cloze |
| Polite verb forms | `n5-grammar-verb-forms` | 12 + 12 cloze |
| The て-form | `n5-grammar-te-form` | 12 + 12 cloze |
| Adjective conjugation | `n5-grammar-adjectives` | 12 + 12 cloze |
| あります・います & location | `n5-grammar-existence` | 12 + 12 cloze |
| Comparing & preferences | `n5-grammar-comparison` | 12 + 12 cloze |
| Common patterns I | `n5-grammar-patterns-1` | 12 + 12 cloze |
| Common patterns II | `n5-grammar-patterns-2` | 12 + 12 cloze |
| Kanji: numbers, days & time | `n5-kanji-numbers-days` | 26 |
| Kanji: people & family | `n5-kanji-people` | 20 |
| Kanji: nature & places | `n5-kanji-nature` | 20 |
| Kanji: verbs & adjectives | `n5-kanji-verbs` | 22 |
| Kanji: body & directions | `n5-kanji-body` | 20 |
| Kanji: everyday & study | `n5-kanji-everyday` | 20 |

## Totals (floors enforced by `src/coverage.test.ts`)

| Measure | Floor | Actual |
| --- | --- | --- |
| Distinct vocabulary items (vocab, phrases, verbs, numbers) | 700 | 794 |
| Distinct kanji (kanji decks) | 100 | 128 |
| Grammar points (grammar + particles items) | 75 | 109 |
| Cloze questions | — | 108 |

## Skipped on purpose

- **Hiragana and katakana charts.** The app assumes kana is already known; a kana
  trainer needs a different mode (typing or recognition drills), not a deck. It is
  in the backlog.
- **Counters beyond the common sets.** The two counter decks cover つ/人/枚/個/歳/本/
  匹/台/回/冊/杯/階; the rarer ones are not worth deck space at N5.
- **Keigo.** Beyond the set phrases in `n5-greetings`, honorific language is N4+.

## Known soft spots

Worth a human eye when reviewing content:

- Cloze questions rely on the English gloss to disambiguate tense and politeness.
  Where two choices could both be grammatical, the gloss is what makes one correct.
- Cloze hints (the hover glosses in `{base|reading|gloss}`) are hand-written and short,
  e.g. `{食|た|eat}`. They deliberately skip particles, demonstratives (これ/この/ここ…)
  and grammar words, since those are what the decks test. The content test keeps
  hints off vocab items and answer choices, where they would give the answer away.
- Kanji decks teach one representative reading per character, not every on/kun reading.
- A few words appear in two decks with different senses (そば = noodles / nearby).
  That is deliberate; ids stay unique per deck.
