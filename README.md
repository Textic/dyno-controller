# Dyno Controller (`com.textic.dyno-controller`)

Stream Deck plugin (SDK v3 / Node.js 24) to view live playback state and control **Dyno Music** through its local WebSocket Developer API.

---

## Features & Actions

### Keypad Actions

| Action | UUID | States | Configurable Settings | Behavior |
| --- | --- | --- | --- | --- |
| **Play / Pause** | `com.textic.dyno-controller.play-pause` | `0` Play, `1` Pause | — | Sends `toggle` and mirrors `playing` / `buffering` status. |
| **Next Track** | `com.textic.dyno-controller.next` | `0` Default | — | Skips to the next track (`next`). |
| **Previous Track** | `com.textic.dyno-controller.previous` | `0` Default | — | Returns to the previous track (`previous`). |
| **Now Playing** | `com.textic.dyno-controller.now-playing` | `0` Default | `titleMode` (`titleArtist`, `title`, `none`), `pressAction` (`toggle`, `next`, `none`) | Renders live album artwork (`144×144` data URL) and wrapped title/artist on the key. |
| **Like Track** | `com.textic.dyno-controller.like` | `0` Off, `1` Liked | — | Toggles `LIKE` / `INDIFFERENT`. |
| **Dislike Track** | `com.textic.dyno-controller.dislike` | `0` Off, `1` Disliked | — | Toggles `DISLIKE` / `INDIFFERENT`. |
| **Shuffle** | `com.textic.dyno-controller.shuffle` | `0` Off, `1` On | — | Toggles queue shuffle (`shuffle`). |
| **Repeat Mode** | `com.textic.dyno-controller.repeat` | `0` Off, `1` All, `2` One | — | Cycles `NONE → ALL → ONE`. |
| **Mute / Unmute** | `com.textic.dyno-controller.mute` | `0` Unmuted, `1` Muted | — | Toggles audio mute (`mute`). |
| **Volume Step** | `com.textic.dyno-controller.volume-step` | `0` Up, `1` Down | `direction` (`up`, `down`), `step` (`1–25%`), `showVolume` (`boolean`) | Adjusts volume incrementally and optionally shows the volume % on the key. |
| **Quick Play** | `com.textic.dyno-controller.quick-play` | `0` Default | `target` (URL or ID), `label` | Starts playback via `watch` using a YouTube/YouTube Music URL or raw `videoId` / `playlistId`. |

> All multi-state keypad actions set `"DisableAutomaticStates": true` in [manifest.json](com.textic.dyno-controller.sdPlugin/manifest.json) and re-sync in `onKeyUp` so Stream Deck never fights WebSocket state updates with local key-toggle jumps.

### Stream Deck+ Encoder Action

| Action | UUID | Layout | Configurable Settings | Behavior |
| --- | --- | --- | --- | --- |
| **Dyno Dial** | `com.textic.dyno-controller.volume-dial` | `$B2` | `step` (`1–20%`), `pushAction` (`toggle`, `mute`), `touchAction` (`mute`, `toggle`) | Rotate to adjust volume with optimistic UI feedback; press dial to Play/Pause (default); tap touchstrip to Mute/Unmute (default). Displays current track artwork (or the Dyno Music icon when idle/offline). |

---

## Architecture

```text
X:\dyno-controller
├── src/
│   ├── plugin.ts                  # Entry point: registers actions, Global Settings, and PI status sync
│   ├── types.ts                   # Dyno Music WebSocket protocol types & URL/token resolver
│   ├── dyno-client.ts             # Singleton WebSocket client with backoff reconnect & ack tracking
│   └── actions/
│       ├── helpers.ts             # SyncedKeyAction base class, command runner, key title wrapper
│       ├── play-pause.ts          # Play / Pause toggle key
│       ├── next.ts                # Next track key
│       ├── previous.ts            # Previous track key
│       ├── now-playing.ts         # Live artwork + track info key
│       ├── like.ts                # Like rating toggle key
│       ├── dislike.ts             # Dislike rating toggle key
│       ├── shuffle.ts             # Queue shuffle toggle key
│       ├── repeat.ts              # Repeat mode cycle key
│       ├── mute.ts                # Audio mute toggle key
│       ├── volume-step.ts         # Discrete volume +/- key
│       ├── volume-dial.ts         # Stream Deck+ rotary encoder ($B2)
│       └── quick-play.ts          # Watch URL / playlist launcher key
├── com.textic.dyno-controller.sdPlugin/
│   ├── manifest.json              # SDK v3 plugin & action manifest
│   ├── ui/settings.html           # Shared Property Inspector (sdpi-components v4)
│   └── imgs/                      # Marketplace icons, category icon, and SVG action states
├── tests/
│   └── dyno-client.test.mjs       # Node test suite (URL parsing + mock WebSocketServer integration)
├── rollup.config.mjs              # Bundles src/plugin.ts -> .sdPlugin/bin/plugin.js
└── tsconfig.json                  # Strict TypeScript config
```

### Dyno Music WebSocket Protocol

- Endpoint: `ws://127.0.0.1:<port>/ws?token=<token>` (default port `26538`).
- Server pushes `hello`, `state` (`PlayerState`), `queue`, `artwork` (`videoId` + base64 `image`), and `result` (`id`, `ok`, `error`).
- Client sends `{ id, type: "get" }` or `{ id, type: "command", command }` and awaits matching `result` acknowledgments with a 5-second timeout.
- Reconnect strategy: exponential backoff (`1s → 10s`), halting automatic retries on HTTP `401` until Global Settings change or the user triggers **Reconnect Now**.

---

## Setup in Dyno Music

1. Open **Dyno Music → Settings → Developer**.
2. Enable **API WebSocket**.
3. Click **Copy address** (`ws://127.0.0.1:26538/ws?token=...`).
4. In **Elgato Stream Deck**, drag any action from the **Dyno Controller** category onto a key or dial.
5. Paste the URL into **WebSocket URL** (or fill **Port** and **Token** individually). Connection settings are stored globally across all actions.

---

## Development & Verification

```bash
npm install         # Install dependencies
npm run typecheck   # Run tsc --noEmit
npm run build       # Bundle src/plugin.ts into .sdPlugin/bin/plugin.js
npm test            # Run unit & WebSocket mock integration tests
npm run validate    # Validate manifest, icons, and bundle with @elgato/cli
npm run pack        # Generate .streamDeckPlugin installer archive
npm run watch       # Watch & auto-restart plugin inside Stream Deck
npm run link        # Symlink .sdPlugin into Stream Deck's Plugins directory
npm run restart     # Restart the running plugin process
```

> **Note:** Stream Deck reads `manifest.json` only on application startup. After adding/renaming actions or changing manifest flags, quit **Stream Deck** from the system tray and reopen it.
