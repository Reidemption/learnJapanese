import type { RubySegment } from "../types";

/** Marker for a cloze blank inside a prompt string. */
export const BLANK = "___";

const KANA = /^[぀-ゟ゠-ヿー・・ー]+$/;
const KANJI = /[一-龯㐀-䶿]/;

/**
 * Parses the deck markup into ruby segments.
 *
 *   plain text        -> { ja }
 *   {食|た}           -> { ja: "食", reading: "た" }
 *   {毎日|まいにち|every day} -> { ja, reading, en }
 *   {ごはん||meal}    -> { ja, en }
 *   ___               -> { ja: "＿", blank: true }
 *
 * Throws on malformed markup (unclosed brace, empty base, too many fields) so
 * broken content fails the content test instead of rendering as junk.
 */
export function parseRuby(source: string): RubySegment[] {
  const out: RubySegment[] = [];
  let plain = "";

  const flush = (): void => {
    if (plain) {
      out.push({ ja: plain });
      plain = "";
    }
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;

    if (source.startsWith(BLANK, i)) {
      flush();
      out.push({ ja: "＿", blank: true });
      i += BLANK.length - 1;
      continue;
    }

    if (char === "}") {
      throw new Error(`Unmatched "}" in ruby markup: ${source}`);
    }

    if (char !== "{") {
      plain += char;
      continue;
    }

    const end = source.indexOf("}", i);
    if (end === -1) throw new Error(`Unclosed "{" in ruby markup: ${source}`);

    const parts = source.slice(i + 1, end).split("|");
    if (parts.length < 2 || parts.length > 3) {
      throw new Error(`Expected {base|reading} or {base|reading|gloss} in: ${source}`);
    }

    const [base, reading, gloss] = parts as [string, string, string | undefined];
    if (!base) throw new Error(`Empty base in ruby markup: ${source}`);
    if (!reading && !gloss) throw new Error(`Empty {${base}||} in ruby markup: ${source}`);

    flush();
    const segment: RubySegment = { ja: base };
    if (reading) segment.reading = reading;
    if (gloss) segment.en = gloss;
    out.push(segment);

    i = end;
  }

  flush();
  return out;
}

/** The kana spelling of a parsed string: readings where given, plain text otherwise. */
export function toKana(segments: RubySegment[]): string {
  return segments.map((s) => (s.blank ? "" : (s.reading ?? s.ja))).join("");
}

/** The plain Japanese text, furigana dropped. */
export function toPlain(segments: RubySegment[]): string {
  return segments.map((s) => s.ja).join("");
}

export function isKana(text: string): boolean {
  return KANA.test(text);
}

export function hasKanji(text: string): boolean {
  return KANJI.test(text);
}
