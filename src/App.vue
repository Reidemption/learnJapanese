<script setup lang="ts">
import { settings } from "./settings";
</script>

<template>
  <div class="shell">
    <header class="site-header">
      <RouterLink class="brand" :to="{ name: 'home' }">
        習い
        <small>N5 study</small>
      </RouterLink>
      <div class="toggles">
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
      </div>
    </header>

    <RouterView />
  </div>
</template>
