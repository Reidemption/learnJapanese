import { reactive, ref, watch, watchEffect } from "vue";
import { loadSettings, saveSettings, type Settings } from "./progress";
import { resolveTheme } from "./theme";

export const settings = reactive<Settings>(loadSettings());

watch(
  settings,
  (value) =>
    saveSettings({ kana: value.kana, hints: value.hints, font: value.font, theme: value.theme }),
  { deep: true },
);

// Tracks the system preference so "auto" follows it live. jsdom has no
// matchMedia, so tests just see a light system.
const darkQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
const systemDark = ref(darkQuery?.matches ?? false);
darkQuery?.addEventListener("change", (e) => (systemDark.value = e.matches));

// Runs as soon as this module loads, before the app mounts, so the first
// paint is already in the right theme.
watchEffect(() => {
  document.documentElement.dataset.theme = resolveTheme(settings.theme, systemDark.value);
});
