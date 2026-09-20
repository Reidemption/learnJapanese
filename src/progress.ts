import type { CardMark, Choice, Jlpt, Question, QuizScore, RubySegment } from "./types";

const SETTINGS_KEY = "lj.settings";
const QUIZ_KEY = "lj.quiz";
const CARDS_KEY = "lj.cards";

export type Settings = {
  kana: boolean;
  hints: boolean;
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { kana: true, hints: true };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      kana: parsed.kana !== false,
      hints: parsed.hints !== false,
    };
  } catch {
    return { kana: true, hints: true };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

type QuizMap = Record<string, QuizScore>;

function quizKey(categoryId: string, jlpt: Jlpt): string {
  return `${categoryId}:${jlpt}`;
}

function loadQuizMap(): QuizMap {
  try {
    return JSON.parse(localStorage.getItem(QUIZ_KEY) ?? "{}") as QuizMap;
  } catch {
    return {};
  }
}

export function getQuizScore(categoryId: string, jlpt: Jlpt): QuizScore | undefined {
  return loadQuizMap()[quizKey(categoryId, jlpt)];
}

export function saveQuizScore(categoryId: string, jlpt: Jlpt, score: QuizScore): void {
  const map = loadQuizMap();
  map[quizKey(categoryId, jlpt)] = score;
  localStorage.setItem(QUIZ_KEY, JSON.stringify(map));
}

function loadCards(): Record<string, CardMark> {
  try {
    return JSON.parse(localStorage.getItem(CARDS_KEY) ?? "{}") as Record<string, CardMark>;
  } catch {
    return {};
  }
}

export function getCardMark(id: string): CardMark | undefined {
  return loadCards()[id];
}

export function setCardMark(id: string, mark: CardMark): void {
  const map = loadCards();
  map[id] = mark;
  localStorage.setItem(CARDS_KEY, JSON.stringify(map));
}

export function knownCount(questions: Question[]): number {
  const map = loadCards();
  return questions.filter((q) => map[q.id] === "known").length;
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j]!;
    next[j] = tmp!;
  }
  return next;
}

export function correctChoice(question: Question): Choice {
  const found = question.choices.find((c) => c.id === question.correctId);
  if (!found) throw new Error(`Missing correct choice for ${question.id}`);
  return found;
}

export function filledPrompt(question: Question): RubySegment[] {
  const answer = correctChoice(question).ja ?? [{ ja: correctChoice(question).en ?? "" }];
  const out: RubySegment[] = [];
  for (const part of question.promptJa) {
    if (part.blank) out.push(...answer);
    else out.push(part);
  }
  return out;
}

export function questionsFor(jlpt: Jlpt, all: Question[]): Question[] {
  return all.filter((q) => q.jlpt === jlpt);
}
