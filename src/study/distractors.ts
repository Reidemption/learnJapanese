import { TAGS, type Deck, type DeckGroup, type Item, type Jlpt, type Tag } from "../types";
import type { Rng } from "./rng";
import { parseRuby, toKana, toPlain } from "./ruby";
import { tagsOf } from "./tags";

/**
 * Wrong answers that are hard to rule out, for tests (see "Harder choices"
 * in docs/PLAN-test-understanding.md). Practice keeps its own, easier ones.
 */

/** One word a distractor can come from, with what the ranking compares. */
export type Candidate = {
  item: Item;
  deckId: string;
  /** Type tags only (verb, i-adj…): themes say nothing about grammar. */
  types: Tag[];
  plain: string;
  kana: string;
};

export type RankKind = "meaning" | "reverse";

export function candidateOf(deck: Deck, item: Item): Candidate {
  const segments = parseRuby(item.ja);
  return {
    item,
    deckId: deck.id,
    types: tagsOf(deck, item).filter((tag) => TAGS[tag].facet === "type"),
    plain: toPlain(segments),
    kana: toKana(segments),
  };
}

/** Every item of one level and group, across decks: topic can't rule these out. */
export function levelPool(decks: Deck[], level: Jlpt, group: DeckGroup): Candidate[] {
  return decks
    .filter((deck) => deck.level === level && deck.group === group)
    .flatMap((deck) => deck.items.map((item) => candidateOf(deck, item)));
}

/** "to eat (polite)" / "meal" → ["eat", "meal"]: the senses an English gloss lists. */
export function glosses(en: string): string[] {
  return en
    .split(/[/;,]/)
    .map((part) =>
      part
        .replace(/\([^)]*\)/g, "")
        .trim()
        .toLowerCase()
        .replace(/^to\s+/, "")
        .replace(/^(a|an|the)\s+/, ""),
    )
    .filter(Boolean);
}

/**
 * Whether `other` would also be a right answer to a question about `target`:
 * the same word (そば twice), or a shared sense ("to eat" and "to eat
 * (honorific)"). Such a candidate is never offered.
 */
export function alsoRight(target: Candidate, other: Candidate): boolean {
  if (other.item.id === target.item.id || other.plain === target.plain) return true;
  const senses = new Set(glosses(target.item.en));
  return glosses(other.item.en).some((sense) => senses.has(sense));
}

function shared<T>(a: readonly T[], b: readonly T[]): number {
  const set = new Set(a);
  return b.filter((x) => set.has(x)).length;
}

/** 1 for the same type tags, 0 for none in common; words without tags score equal. */
function typeScore(a: Tag[], b: Tag[]): number {
  const union = new Set([...a, ...b]).size;
  return union ? shared(a, b) / union : 1;
}

const KANJI = /[一-龯㐀-䶿]/g;

/**
 * `candidates` closest to `target` first, `rng` breaking ties. Candidates
 * that would also be right are left out.
 *
 *   meaning (English choices): same type tags, a similar word count, same deck
 *   reverse (Japanese choices): a shared kanji, a similar kana length, same type tags
 */
export function rankCandidates(
  target: Candidate,
  candidates: Candidate[],
  kind: RankKind,
  rng: Rng,
): Candidate[] {
  const words = (c: Candidate) => c.item.en.split(/\s+/).length;
  const kanji = (c: Candidate) => c.plain.match(KANJI) ?? [];
  const score = (c: Candidate): number => {
    if (kind === "meaning") {
      return (
        3 * typeScore(target.types, c.types) -
        Math.min(3, Math.abs(words(target) - words(c))) +
        (c.deckId === target.deckId ? 1 : 0)
      );
    }
    return (
      3 * Math.min(1, shared(kanji(target), kanji(c))) -
      Math.min(3, Math.abs(target.kana.length - c.kana.length) / 2) +
      2 * typeScore(target.types, c.types)
    );
  };
  return candidates
    .filter((c) => !alsoRight(target, c))
    .map((c) => ({ c, score: score(c), tie: rng() }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .map(({ c }) => c);
}

// ——— Kana minimal pairs ———

const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const KATAKANA_OFFSET = 0x60;

function toHira(char: string): string {
  const code = char.charCodeAt(0);
  return code >= HIRAGANA_START + KATAKANA_OFFSET && code <= HIRAGANA_END + KATAKANA_OFFSET
    ? String.fromCharCode(code - KATAKANA_OFFSET)
    : char;
}

function isKatakana(char: string): boolean {
  return char !== toHira(char) || char === "ー";
}

/** Writes hiragana `char` in the script of `like`. */
function inScriptOf(char: string, like: string): string {
  if (!isKatakana(like) || char === "ー") return char;
  const code = char.charCodeAt(0);
  return code >= HIRAGANA_START && code <= HIRAGANA_END
    ? String.fromCharCode(code + KATAKANA_OFFSET)
    : char;
}

const ROWS: Record<string, string> = {
  a: "あかさたなはまやらわがざだばぱぁゃ",
  i: "いきしちにひみりぎじぢびぴぃ",
  u: "うくすつぬふむゆるぐずづぶぷぅゅ",
  e: "えけせてねへめれげぜでべぺぇ",
  o: "おこそとのほもよろをごぞどぼぽぉょ",
};

function vowelOf(hira: string): string | undefined {
  return Object.keys(ROWS).find((vowel) => ROWS[vowel]!.includes(hira));
}

/** The kana that lengthen a vowel, as in おばあさん, せんせい, おねえさん, がっこう, おおきい. The first is the usual one. */
const LENGTHEN: Record<string, string[]> = {
  a: ["あ"],
  i: ["い"],
  u: ["う"],
  e: ["い", "え"],
  o: ["う", "お"],
};

const SMALL_Y = "ゃゅょ";
const SMALL = "ぁぃぅぇぉゃゅょっゎ";
const DOUBLES = "かきくけこさしすせそたちつてとぱぴぷぺぽ";

/** Pairs that differ by a dakuten or handakuten. */
const DAKUTEN = [
  "かが", "きぎ", "くぐ", "けげ", "こご",
  "さざ", "しじ", "すず", "せぜ", "そぞ",
  "ただ", "てで", "とど",
  "はばぱ", "ひびぴ", "ふぶぷ", "へべぺ", "ほぼぽ",
];

/** Kana that are easy to confuse by shape. */
const LOOKALIKE = ["ぬめ", "われね", "るろ", "さち", "はほ", "シツ", "ソン", "クワ", "ウワ", "コユ"];

/**
 * Whether `text` is a well-formed kana spelling: nothing small or long at
 * the start, っ never last or doubled, and ゃゅょ only after an い-row kana.
 */
export function isValidKana(text: string): boolean {
  const chars = [...text];
  if (!chars.length) return false;
  for (let i = 0; i < chars.length; i++) {
    const hira = toHira(chars[i]!);
    const prev = i > 0 ? toHira(chars[i - 1]!) : undefined;
    if (!/^[ぁ-ゖァ-ヶー]$/.test(chars[i]!)) return false;
    if (i === 0 && (SMALL.includes(hira) || hira === "ー" || hira === "ん")) return false;
    if (hira === "っ" && (i === chars.length - 1 || prev === "っ")) return false;
    if (SMALL_Y.includes(hira) && (!prev || vowelOf(prev) !== "i" || prev === "い")) return false;
    if (hira === "ー" && (prev === "ー" || prev === "っ")) return false;
  }
  return true;
}

/**
 * Near misses of a reading, the mistakes a reading test is for, likeliest first:
 *   1. っ, a long vowel or ー dropped; ゃゅょ written full size
 *      (きって → きて, おばあさん → おばさん, きょう → きよう)
 *   2. っ or a long vowel added inside the word; a dakuten swapped
 *      (きて → きって, おばさん → おばあさん, か ↔ が)
 *   3. a long vowel added at the very end; a look-alike kana (ぬ ↔ め)
 * Never returns `kana` itself, and every variant is valid kana.
 */
export function kanaVariants(kana: string): string[] {
  const chars = [...kana];
  const tiers: string[][] = [[], [], []];
  const edit = (tier: number, i: number, replace: number, ...insert: string[]) =>
    tiers[tier]!.push([...chars.slice(0, i), ...insert, ...chars.slice(i + replace)].join(""));

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    const hira = toHira(char);
    const prev = i > 0 ? toHira(chars[i - 1]!) : undefined;
    const next = chars[i + 1] === undefined ? undefined : toHira(chars[i + 1]!);

    // っ dropped, or added before a k/s/t/p sound.
    if (hira === "っ") edit(0, i, 1);
    else if (prev !== undefined && prev !== "っ" && DOUBLES.includes(hira)) {
      edit(1, i, 0, inScriptOf("っ", char));
    }

    // A long vowel dropped, or added after a short one (not after one that's already long).
    const vowel = vowelOf(hira);
    const prevVowel = prev === undefined ? undefined : vowelOf(prev);
    const alreadyLong = prevVowel !== undefined && LENGTHEN[prevVowel]!.includes(hira);
    if (vowel && (!SMALL.includes(hira) || SMALL_Y.includes(hira))) {
      const lengths = isKatakana(char) ? ["ー"] : LENGTHEN[vowel]!;
      if (next !== undefined && lengths.includes(next)) edit(0, i + 1, 1);
      else if (!alreadyLong && (next === undefined || !SMALL.includes(next))) {
        edit(next === undefined ? 2 : 1, i + 1, 0, lengths[0]!);
      }
    }
    if (hira === "ー") edit(0, i, 1);

    // ゃゅょ written full size.
    const big = "やゆよ"["ゃゅょ".indexOf(hira)];
    if (big) edit(0, i, 1, inScriptOf(big, char));

    // Dakuten in either script; look-alikes only within their own script.
    for (const group of DAKUTEN) {
      if (!group.includes(hira)) continue;
      for (const other of group) if (other !== hira) edit(1, i, 1, inScriptOf(other, char));
    }
    for (const group of LOOKALIKE) {
      if (!group.includes(char)) continue;
      for (const other of group) if (other !== char) edit(2, i, 1, other);
    }
  }
  return [...new Set(tiers.flat())].filter((v) => v !== kana && isValidKana(v));
}

/** The likeliest near miss of `kana`, `rng` choosing among the first few; undefined if none is allowed. */
export function nearMiss(kana: string, rng: Rng, allowed: (text: string) => boolean): string | undefined {
  const likely = kanaVariants(kana).filter(allowed).slice(0, 3);
  return likely[Math.floor(rng() * likely.length)];
}
