# Dyno Controller (`com.textic.dyno-controller`)

Stream Deck plugin (SDK v3 / Node 24) to view and control **Dyno Music** over its local WebSocket API.

## Actions Included

### Keypad Actions
- **Play / Pause** — Toggles playback and syncs play/pause key state.
- **Next Track** / **Previous Track** — Skips backward or forward in the queue.
- **Now Playing** — Displays album artwork and track title/artist dynamically; configurable press behavior (Play/Pause, Next Track, or Display Only).
- **Like Track** / **Dislike Track** — Toggles track rating and reflects current like/dislike state.
- **Shuffle** / **Repeat Mode** — Toggles queue shuffle or cycles Repeat (`Off` → `All` → `One`).
- **Mute / Unmute** — Toggles audio mute.
- **Volume Step** — Increases or decreases volume by a configurable step (`1–25%`), optionally showing current volume on the key.
- **Quick Play** — Starts a configured YouTube / YouTube Music watch URL, playlist URL, or raw `videoId` / `playlistId`.

### Stream Deck+ Dial Action
- **Volume Dial** (`$B2` touchstrip layout) — Rotate to adjust volume with live feedback bar, push or tap touchstrip to toggle mute.

## Setup in Dyno Music

1. Open **Dyno Music** → **Settings** → **Developer**.
2. Enable **API WebSocket**.
3. Click **Copy address** (`ws://127.0.0.1:26538/ws?token=...`).
4. In the **Stream Deck** app, drag any **Dyno Controller** action onto a key or dial.
5. Paste the copied WebSocket URL into **WebSocket URL** (or fill **Port** and **Token** separately). Settings are shared globally across all actions.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
npm run validate
npm run link
```

- Rebuild & hot-reload: `npm run watch`
- Package `.streamDeckPlugin`: `npm run pack`
