# restream-tiktokstudio-unified-chat

**One chat feed for TikTok, Twitch, YouTube and Kick.** Messages land in SQLite,
render in a Next.js dashboard, and can be dropped straight into OBS as a
transparent overlay.

*[Léeme en español →](README.es.md)*

---

<p align="center">
  <img src="docs/dashboard.png" width="440" alt="Unified dashboard showing TikTok, Twitch, YouTube and Kick messages in one feed">
</p>

<p align="center">
  <em>The dashboard. Every message carries its author's avatar with the platform's logo pinned to it.</em>
</p>

---

Streaming to several platforms at once means watching several chats at once.
This pulls all of them into one feed where every message carries its author's
avatar with the platform's logo pinned to it, so you know where it came from
without reading a label.

- **No screenshots, no OCR, no headless browser.** Both sources hand over
  structured JSON with a unique ID per message.
- **TikTok Studio is not required.** The name refers to where your chat normally
  lives — Restream's embed and TikTok Studio's panel. This reads TikTok's LIVE
  WebSocket directly, so the desktop app never has to be open or even installed.
- **No TikTok credentials.** Just your `@handle`.
- **One process.** The collectors start with the Next.js server.
- **Nothing is lost on reconnect.** Deduplication is a unique index in SQLite,
  not a heuristic.

## Requirements

- Node.js 22 or newer — the Restream collector uses the built-in `WebSocket`
- A [Restream](https://restream.io) account for Twitch, YouTube and Kick
- A TikTok account that streams live

TikTok and Restream are independent. Set up one, both, or neither — whatever is
missing is simply disabled, and the header tells you which.

## Setup

```bash
git clone https://github.com/<you>/restream-tiktokstudio-unified-chat
cd restream-tiktokstudio-unified-chat
npm install
cp .env.example .env
```

Fill in `.env`:

```ini
# From https://chat.restream.io — the embed URL is
#   https://chat.restream.io/embed?token=YOUR-TOKEN-HERE
RESTREAM_CHAT_TOKEN=your-token-here

# Your TikTok handle, no leading @
TIKTOK_USERNAME=yourhandle
```

Then:

```bash
npm run dev
```

Open <http://localhost:7637>. That is the whole setup — there is no second
process to start.

Once it is running you can change both values from the **gear icon** in the
header without touching `.env` or restarting anything.

## The dashboard

Each row is an avatar with the platform's logo pinned to its corner, the
author's name, their badges, and the message. Usernames get a stable color
derived from their ID, so regulars become recognizable at a glance. Twitch users
who picked their own color keep it.

The platform buttons in the header double as filters and as connection status —
a green dot means connected, amber means reconnecting, red means something
broke. Click one to hide that platform.

Likes and joins from the same person collapse into a single row within a
30-second window. TikTok sends likes in bursts, and without this they bury the
conversation.

### View filters

Under the gear icon:

| Toggle | Default | What it does |
|---|---|---|
| Messages only | off | Hides likes, gifts, follows, shares and joins |
| Joins | off | Announces when someone enters the live |
| Bot messages | on | Streamlabs, Nightbot and friends |

These are stored in `localStorage`. They are per-browser display preferences and
apply instantly, unlike the token and handle which change the collector's
sockets and live in SQLite.

## OBS overlay

Add `?stream` to the URL and the page becomes a transparent, chrome-free overlay
anchored to the bottom of the screen:

```
http://localhost:7637/?stream
```

<p align="center">
  <img src="docs/overlay.png" width="620" alt="Transparent chat overlay composited over a video scene">
</p>

In **OBS**: add a *Browser* source, paste that URL, and check *Shutdown source
when not visible*. No custom CSS needed — the page already renders with an alpha
channel. TikTok Studio works the same way with its browser source.

Each message sits on a translucent pill with a blur behind it. That is not
decoration: without it the text disappears against bright scenes.

### Parameters

| Parameter | Default | What it does |
|---|---|---|
| `ttl` | `0` | Seconds before a message fades out. `0` keeps them |
| `max` | `12` | How many messages are visible at once (1–60) |
| `scale` | `1` | Text scale (0.5–3), to match your scene resolution |
| `events` | on | Gifts, follows, subs, raids and shares |
| `likes` | **off** | Likes |
| `bots` | **off** | Streamlabs and similar |

Booleans accept `?likes`, `?likes=1` or `?likes=true` to enable; `=0`, `=false`
or `=no` to disable. Joins never appear in the overlay.

```
# clears itself after a minute of silence, larger text
http://localhost:7637/?stream&ttl=60&scale=1.3

# messages and nothing else
http://localhost:7637/?stream&events=0
```

Likes are off by default for a reason: on a busy stream they arrive every second
and your viewers would see nothing but "sent 15 likes".

## How the data gets in

| Source | Mechanism | Credentials |
|---|---|---|
| TikTok | LIVE WebSocket via [`tiktok-live-connector`](https://github.com/isaackogan/TikTokLive) | none — just the `@handle` |
| Twitch · YouTube · Kick | `wss://backend.chat.restream.io/ws/embed` | the embed token |

The Restream embed is a web page, but its WebSocket URL is built from the same
token the embed uses, so no browser is involved.

TikTok's WebSocket needs a signed handshake, which
[`tiktok-live-connector`](https://github.com/isaackogan/TikTokLive) obtains from
Euler Stream's free tier. One signature per connection, not per message, so a
multi-hour stream costs a single request. The collector uses exponential backoff
precisely so a reconnect loop cannot burn through that quota.

**This is reverse engineering, not an official API.** TikTok can break it at any
time. For a personal dashboard that is a reasonable trade; for anything load
bearing, it is not.

## Architecture

```
instrumentation.ts        starts the collectors when the server boots
src/server/
  collector.ts            orchestrates, validates config, restarts in place
  tiktok.ts               chat, gifts, likes, follows, shares, joins, viewers
  restream.ts             the other three platforms
  db.ts                   schema, writes, deduplication
  settings.ts             token and handle, with .env as the initial value
  status.ts               connection state the UI reads
src/app/api/stream/       SSE — history on connect, then only what is new
src/app/api/settings/     reads and writes settings; saving reconnects
src/app/api/status/       connection state as JSON
src/components/chat/      message row, avatar with platform chip, badges, overlay
src/lib/                  types, readonly reads, user colors, collapsing, view prefs
```

Three decisions worth knowing before you change anything:

**Deduplication belongs to the database.** The unique index on
`(platform, external_id)` means a collector can crash, reconnect and replay
without duplicating a single row. Restream's key is `payload.eventIdentifier` —
**not** `payload.eventId`, which looks like a per-message UUID but is constant
for the whole session and even repeats across platforms. Using the wrong one
silently drops every message after the first.

**The collectors must start exactly once.** The guard in `collector.ts` lives on
`globalThis` rather than in module scope, because dev hot-reload re-evaluates
modules and would open a fresh socket on every save — which on TikTok also burns
a signature each time.

**A dead socket does not always close.** A half-open TCP connection stays
"connected" while delivering nothing. Restream sends a heartbeat every few
seconds, so the collector treats 45 seconds of total silence as death and
reconnects.

## Configuration reference

| Variable | Required | Default |
|---|---|---|
| `RESTREAM_CHAT_TOKEN` | for Twitch/YouTube/Kick | — |
| `TIKTOK_USERNAME` | for TikTok | — |
| `CHAT_DB_PATH` | no | `./data/chat.db` |

`.env` provides the initial values. Anything saved from the gear icon is stored
in SQLite and takes precedence — the file is never rewritten, because Next.js
watches it in dev and would restart the server mid-reconfiguration.

## Running in production

```bash
npm run build
npm start
```

`next start` serves on **port 7637**, the same as `npm run dev`. The collectors
start here too — `instrumentation.ts` runs on `next start`, not just in dev — so
production behaves exactly like development: one process, nothing else to launch.

To use a different port, pass it through:

```bash
npm run dev -- -p 3000
npm start -- -p 3000
```

Keep in mind this is a **long-lived stateful server**, not a request/response app.
It holds open WebSockets and writes to a local SQLite file, so it does not fit
serverless platforms. Run it on a machine that stays up: your own box, a VPS, or
a container with a persistent volume mounted at `data/`.

Because SQLite is a local file, `data/chat.db` is the whole database. Back it up
by copying it — but copy `chat.db-wal` alongside it, or use
`sqlite3 data/chat.db ".backup backup.db"` to get a consistent snapshot while the
collectors are writing.

## Development

```bash
npm run dev        # server + collectors on http://localhost:7637
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build

npm run shot -- '/?stream' --on-video   # screenshot the overlay over a mock scene
npm run shot -- --readme                # regenerate both images in docs/
```

The README images are rendered from `docs/fixture.json` — a fixed set of real
messages — rather than from whatever is in chat at that moment, so they stay
reproducible and actually show the app doing its job instead of a random
twenty-second slice full of likes.

The database is a plain SQLite file, so you can query it directly:

```bash
sqlite3 data/chat.db "SELECT platform, type, COUNT(*) FROM events GROUP BY 1, 2"
```

## Roadmap

- Claude inference: rolling chat summary, unanswered questions, clip-worthy moments
- Remote deployment
- Moderation actions from the dashboard

## License

MIT — see [LICENSE](LICENSE).

This project is not affiliated with TikTok, Twitch, YouTube, Kick or Restream.
The TikTok integration relies on an unofficial reverse-engineered library; check
the terms of service of each platform before deploying this anywhere public.
