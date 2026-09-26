import { JLPT_LEVELS, type Deck, type Jlpt, type RubySegment } from "../types";
import { parseRuby, toPlain } from "./ruby";

const KANJI = /[一-龯㐀-䶿]/g;

/**
 * Every kanji a learner at `level` is expected to read: the kanji in the
 * `kanji` decks of that level and every easier one. Taken from the content,
 * so adding a level's kanji decks extends its tests with no code change.
 */
export function levelKanji(decks: Deck[], level: Jlpt): Set<string> {
  const upTo = JLPT_LEVELS.slice(0, JLPT_LEVELS.indexOf(level) + 1);
  const out = new Set<string>();
  for (const deck of decks) {
    if (deck.group !== "kanji" || !upTo.includes(deck.level)) continue;
    for (const item of deck.items) {
      for (const kanji of toPlain(parseRuby(item.ja)).match(KANJI) ?? []) out.add(kanji);
    }
  }
  return out;
}

/**
 * How a test shows Japanese without furigana: a segment whose kanji are all
 * in `kanjiSet` stays as plain kanji, and one with a kanji above the level is
 * written in its reading, as the JLPT itself does. Readings and hint glosses
 * are dropped either way.
 */
export function levelScript(segments: RubySegment[], kanjiSet: ReadonlySet<string>): RubySegment[] {
  return segments.map((segment) => {
    if (segment.blank) return segment;
    const kanji = segment.ja.match(KANJI) ?? [];
    const readable = kanji.every((k) => kanjiSet.has(k));
    return { ja: !readable && segment.reading ? segment.reading : segment.ja };
  });
}
