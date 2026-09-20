import { reactive, watch } from "vue";
import { loadSettings, saveSettings, type Settings } from "./progress";

export const settings = reactive<Settings>(loadSettings());

watch(settings, (value) => saveSettings({ kana: value.kana, hints: value.hints }), {
  deep: true,
});
