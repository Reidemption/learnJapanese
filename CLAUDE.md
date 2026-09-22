# LearnJapanese (習い)

Small side-project web app for studying JLPT N5 (and later N4) Japanese: small
single-topic decks (10–30 items) studied through multiple-choice modes.

**Read `docs/PLAN.md` first.** It is the source of truth for the roadmap, the
content format, and the acceptance criteria for each phase. Tick A/C items there
as you finish them. The dashboard initiative (Dashboard Phase 1, 2, …) lives in
`docs/PLAN-dashboard.md`; test understanding (Test Phase 1, 2, …) lives in
`docs/PLAN-test-understanding.md`; word tags and Custom study (Tags Phase 1, 2, …)
live in `docs/PLAN-tags.md`.

## Layout
- `src/` — Vue 3 + Vite + TS frontend
- `content/decks/*.json` — study content (source of truth, read by web and server)
- `server/` — Go + SQLite backend (Phase 4)

## Commands
- `npm run dev` — dev server
- `npm test` — Vitest
- `npm run build` — type-check + build

## Conventions
- `<script setup lang="ts">`, double quotes, small pure helpers, no state library.
- Pure logic lives in `src/study/*` with a colocated `*.test.ts`.
- Adding content should never require code changes; if validation fails, fix the
  content, not the test.
