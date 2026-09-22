# 習い (LearnJapanese)

A small web app for studying JLPT N5 (and later N4) Japanese: single-topic decks
of 10–30 items, drilled through multiple-choice modes (meaning, recall, reading
and fill-in-the-blank).

`docs/PLAN.md` is the source of truth for the roadmap and acceptance criteria.

## Layout

| Path                 | What it is                                               |
| -------------------- | -------------------------------------------------------- |
| `src/`               | Vue 3 + Vite + TypeScript frontend                        |
| `content/decks/*.json` | Study content — read by both the web app and the server |
| `server/`            | Go + SQLite backend                                       |
| `docs/PLAN.md`       | Plan and acceptance criteria                              |

## Frontend

```sh
npm install
npm run dev      # dev server on http://localhost:5173
npm test         # Vitest
npm run build    # vue-tsc -b && vite build
```

The app runs standalone: with `VITE_API_URL` unset it reads the bundled deck
JSON and keeps progress in localStorage.

## Backend

```sh
cd server
go run .         # http://localhost:8080
go test ./...
go vet ./...
```

Config comes from env vars: `PORT` (default 8080) and `DB_PATH`.

### Where progress is stored

By default the database is `<user config dir>/learnjapanese/app.db`, which is
`%AppData%\learnjapanese\app.db` on Windows. It is outside the repo and the same
file whichever directory you start the server from, so stopping the server
each night (or running `git clean`) loses nothing. The startup log prints the
path. Set `DB_PATH` to use a different file.

Older versions kept it in `data/app.db` relative to wherever the server was
started. On first start the server copies that file (`./data/app.db` or
`./server/data/app.db`) to the new location, logs that it did so, and leaves the
old file alone.

### Backups

The **Download backup** and **Restore backup** buttons at the bottom of the
**Progress** page (`/#/dashboard`) save and restore every session, with every answer, as a JSON file. They
work in both static and HTTP mode, and restoring the same file twice changes
nothing. The same file moves history between static mode (localStorage) and the
server.

## Running both together

bash / zsh:

```sh
cd server && go run .          # terminal 1
VITE_API_URL=/api npm run dev  # terminal 2 (repo root)
```

Windows PowerShell:

```powershell
# terminal 1
cd server
go run .

# terminal 2 (repo root)
$env:VITE_API_URL = "/api"
npm run dev
```

If PowerShell refuses to run `npm` ("running scripts is disabled on this
system"), use `npm.cmd run dev` instead; it skips the blocked `npm.ps1` wrapper.

To check you are really in HTTP mode, look for `/api/...` requests in the
browser's Network tab. If the backend is unreachable, the app quietly falls back
to the bundled content, which looks the same.

The Vite dev server proxies `/api` to `http://localhost:8080`, so there is no
CORS setup needed. Progress is then stored server-side against an anonymous
`clientId` kept in localStorage; localStorage still holds a local copy, and
attempts that fail to post are queued and retried on the next call.

## API

- `GET  /api/health`
- `GET  /api/decks` — deck summaries, optionally `?level=N5`
- `GET  /api/decks/{id}` — the full deck JSON
- `POST /api/attempts` — `{clientId, uid, deckId, mode, correct, total, kana, hints, retry, at, items:[{itemId, mode, correct}]}`
  — `uid` identifies the session, so posting it twice records it once. `at` is
  when it was studied, so a session queued offline keeps its real time. Each
  answer's `mode` defaults to the session's. `retry: true` marks a "Retry
  missed" run: its answers count towards mastery, but it is not a deck score.
  An unknown `mode` is a 400.
- `GET  /api/attempts?clientId=&since=` — the client's sessions, oldest first:
  `[{uid, deckId, mode, correct, total, kana, hints, at, retry?}]`
- `GET  /api/progress?clientId=` — `{decks: {"deckId:mode": {best,last,total,at}}, items: {itemId:{seen,correct,streak,firstAt,lastAt,knownAt}}}`
  — `total` belongs to the best attempt; retry runs are left out. A unit is *known* once `streak`
  reaches 3 (see `src/study/mastery.ts`), and `knownAt` records when that
  first happened.
- `GET  /api/export?clientId=` — a backup: `{version: 1, exportedAt, baseline, attempts: [... with items]}`
- `POST /api/import` — `{clientId, ...backup}`; returns `{imported, duplicates, skipped}`

All timestamps are unix milliseconds, the same as `Date.now()` in the static
implementation. Every answer is stored, and per-item stats are rebuilt from
them (plus any counts recorded before answers were kept).
