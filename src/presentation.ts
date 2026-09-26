import type { InjectionKey } from "vue";

/** How Japanese is shown: furigana and hint glosses on or off. */
export type Presentation = { kana: boolean; hints: boolean };

/**
 * Provided by a screen that must not follow the header toggles (a test).
 * `RubyText` reads it before falling back to the global settings, so the
 * saved settings are never touched.
 */
export const PRESENTATION: InjectionKey<Presentation> = Symbol("presentation");

/** A test: no furigana, no hints. */
export const TEST_PRESENTATION: Presentation = Object.freeze({ kana: false, hints: false });
