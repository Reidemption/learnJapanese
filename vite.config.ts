/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    // With VITE_API_URL=/api the frontend talks to the Go backend through here,
    // so there is no CORS and no hard-coded port in the app.
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    // Day bucketing is local time; a fixed zone with DST keeps the analytics
    // tests (midnight and DST edges) meaning the same on every machine.
    env: { TZ: "America/Denver" },
  },
});
