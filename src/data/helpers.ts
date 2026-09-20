import type { Choice, Jlpt, Question, QuizKind, RubySegment } from "../types";

export function seg(
  ja: string,
  reading?: string,
  en?: string,
): RubySegment {
  const s: RubySegment = { ja };
  if (reading) s.reading = reading;
  if (en) s.en = en;
  return s;
}

export const blank: RubySegment = { ja: "＿", blank: true };

export function meaning(
  id: string,
  jlpt: Jlpt,
  promptJa: RubySegment[],
  correct: string,
  distractors: [string, string, string],
): Question {
  return mc(id, jlpt, "meaning", promptJa, undefined, enChoices(correct, distractors));
}

export function reading(
  id: string,
  jlpt: Jlpt,
  promptJa: RubySegment[],
  correct: string,
  distractors: [string, string, string],
  promptEn?: string,
): Question {
  const ids = ["a", "b", "c", "d"];
  const texts = [correct, ...distractors];
  const choices: Choice[] = texts.map((kana, i) => ({
    id: ids[i],
    ja: [{ ja: kana }],
  }));
  return {
    id,
    jlpt,
    kind: "reading",
    promptJa,
    promptEn,
    choices,
    correctId: "a",
  };
}

export function cloze(
  id: string,
  jlpt: Jlpt,
  promptJa: RubySegment[],
  promptEn: string,
  correct: RubySegment[] | string,
  distractors: [RubySegment[] | string, RubySegment[] | string, RubySegment[] | string],
): Question {
  const toJa = (v: RubySegment[] | string): RubySegment[] =>
    typeof v === "string" ? [{ ja: v }] : v;
  const ids = ["a", "b", "c", "d"];
  const texts = [correct, ...distractors];
  return {
    id,
    jlpt,
    kind: "cloze",
    promptJa,
    promptEn,
    choices: texts.map((t, i) => ({ id: ids[i], ja: toJa(t) })),
    correctId: "a",
  };
}

function enChoices(
  correct: string,
  distractors: [string, string, string],
): { choices: Choice[]; correctId: string } {
  const ids = ["a", "b", "c", "d"];
  const texts = [correct, ...distractors];
  return {
    correctId: "a",
    choices: texts.map((en, i) => ({ id: ids[i], en })),
  };
}

function mc(
  id: string,
  jlpt: Jlpt,
  kind: QuizKind,
  promptJa: RubySegment[],
  promptEn: string | undefined,
  payload: { choices: Choice[]; correctId: string },
): Question {
  return { id, jlpt, kind, promptJa, promptEn, ...payload };
}
