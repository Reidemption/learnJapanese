import type { Category } from "../types";
import { grammar } from "./grammar";
import { kanji } from "./kanji";
import { numbers } from "./numbers";
import { particles } from "./particles";
import { verbs } from "./verbs";
import { vocabulary } from "./vocabulary";

export const categories: Category[] = [
  vocabulary,
  kanji,
  particles,
  verbs,
  grammar,
  numbers,
];

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
