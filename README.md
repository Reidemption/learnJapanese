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

Config comes from env vars: `PORT` (default 8080) and `DB_PATH`
(default `./data/app.db`).

## Running both together

```sh
cd server && go run .          # terminal 1
VITE_API_URL=/api npm run dev  # terminal 2 (repo root)
```

The Vite dev server proxies `/api` to `http://localhost:8080`, so there is no
CORS setup needed. Progress is then stored server-side against an anonymous
`clientId` kept in localStorage; localStorage still holds a local copy, and
attempts that fail to post are queued and retried on the next call.

## API

- `GET  /api/health`
- `GET  /api/decks` — deck summaries, optionally `?level=N5`
- `GET  /api/decks/{id}` — the full deck JSON
- `POST /api/attempts` — `{clientId, deckId, mode, correct, total, items:[{itemId, correct}]}`
- `GET  /api/progress?clientId=` — `{decks: {"deckId:mode": {best,last,at}}, items: {itemId:{seen,correct}}}`
