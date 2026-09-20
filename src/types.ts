export type Jlpt = "N5" | "N4";
export type QuizKind = "meaning" | "reading" | "cloze";
export type CardMark = "known" | "learning";

export type RubySegment = {
  ja: string;
  reading?: string;
  en?: string;
  blank?: boolean;
};

export type Choice = {
  id: string;
  ja?: RubySegment[];
  en?: string;
};

export type Question = {
  id: string;
  jlpt: Jlpt;
  kind: QuizKind;
  promptEn?: string;
  promptJa: RubySegment[];
  choices: Choice[];
  correctId: string;
};

export type Category = {
  id: string;
  title: string;
  titleJa: string;
  questions: Question[];
};

export type QuizScore = {
  correct: number;
  total: number;
  at: number;
};
