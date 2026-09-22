<script setup lang="ts">
import { computed } from "vue";
import { FONTS, fontStack } from "./fonts";
import { settings } from "./settings";
import { THEMES } from "./theme";

const fontVars = computed(() => ({ "--ja": fontStack(settings.font) }));
</script>

<template>
  <div class="shell" :style="fontVars">
    <header class="site-header">
      <RouterLink class="brand" :to="{ name: 'home' }">
        習い
        <small>N5 study</small>
      </RouterLink>
      <div class="toggles">
        <RouterLink class="toggle nav-link" :to="{ name: 'custom' }">Custom</RouterLink>
        <RouterLink class="toggle nav-link" :to="{ name: 'dashboard' }">Progress</RouterLink>
        <button
          class="toggle"
          type="button"
          :aria-pressed="settings.kana"
          @click="settings.kana = !settings.kana"
        >
          Kana
        </button>
        <button
          class="toggle"
          type="button"
          :aria-pressed="settings.hints"
          @click="settings.hints = !settings.hints"
        >
          Hints
        </button>
        <select v-model="settings.font" class="toggle picker" aria-label="Japanese font">
          <option v-for="font in FONTS" :key="font.id" :value="font.id">
            {{ font.label }}
          </option>
        </select>
        <select v-model="settings.theme" class="toggle picker" aria-label="Colour theme">
          <option v-for="theme in THEMES" :key="theme.id" :value="theme.id">
            {{ theme.label }}
          </option>
        </select>
      </div>
    </header>

    <RouterView />
  </div>
</template>
