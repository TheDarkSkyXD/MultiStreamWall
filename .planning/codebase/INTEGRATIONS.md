# External Integrations

**Analysis Date:** 2026-03-05

## APIs & External Services

**Stream Data Sources (JSON URL polling):**
- User-configured JSON endpoints providing stream metadata
  - Client: `node-fetch` ^3.3.2 in `packages/streamwall/src/main/data.ts` (`pollDataURL()`)
  - Auth: None (unauthenticated HTTP GET)
  - Config: `--data.json-url` CLI flag or `[data] json-url` in TOML config
  - Polling interval: configurable via `--data.interval` (default 30 seconds)
  - Expected response: JSON array of `StreamData` objects (see `packages/streamwall-shared/src/types.ts`)

**Streamdelay (optional - stream delay/censor control):**
- External service: [Streamdelay](https://github.com/chromakode/streamdelay) - provides broadcast delay and censor functionality
  - Client: `packages/streamwall/src/main/StreamdelayClient.ts`
  - Protocol: WebSocket (auto-reconnecting via `reconnecting-websocket` + `ws`)
  - Auth: API key passed as query parameter (`?key=<key>`)
  - Config: `--streamdelay.endpoint` (default `http://localhost:8404`) and `--streamdelay.key` CLI flags
  - Capabilities: Set censored state, set stream running state, receive status updates
  - Only initialized when `streamdelay.key` is provided

**Livestream Content (rendered in BrowserViews):**
- Arbitrary web URLs loaded into Electron `WebContentsView` instances
- HLS streams (`.m3u8`) played via `hls.js` in dedicated renderer page (`packages/streamwall/src/renderer/playHLS.ts`)
- Content types supported: `video`, `audio`, `web`, `background`, `overlay` (defined in `packages/streamwall-shared/src/types.ts`)

## Data Storage

**Databases:**
- None. All state is in-memory.

**File Storage:**
- TOML data files watched via `chokidar` in `packages/streamwall/src/main/data.ts` (`watchDataFile()`)
  - Config: `--data.toml-file` CLI flag or `[data] toml-file` in TOML config
  - Format: TOML with `[[streams]]` array
  - Hot-reloaded on file change

**State Management:**
- `Yjs` CRDT document (`Y.Doc`) for view-to-stream assignments
  - Main process is authoritative source
  - Control window syncs via binary updates over Electron IPC
  - Stored in-memory only (no persistence)
- `LocalStreamData` class for operator-added custom streams (in-memory `Map`)
- No persistent storage of any kind between sessions

**Caching:**
- `pollDataURL()` caches last successful JSON response; serves cached data if endpoint errors or returns empty

## Authentication & Identity

**Auth Provider:**
- None currently active
- Commented-out code in `packages/streamwall/src/main/index.ts` references a planned web control server with username/password auth and invite-based token system (lines 119-167, 388-409)
- Streamdelay uses a simple API key (not user auth)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Bugsnag, etc.)

**Logs:**
- `console.debug`, `console.warn`, `console.error` throughout main process
- No structured logging framework

## CI/CD & Deployment

**Hosting:**
- Desktop application distributed via GitHub Releases
- Repository: `streamwall/streamwall` on GitHub

**CI Pipeline:**
- Not detected in repository (no `.github/workflows`, no CI config files found)

**Publishing:**
- `npm -w streamwall run publish` triggers `@electron-forge/publisher-github`
- Publishes to GitHub Releases as prerelease

**Auto-Updates:**
- `update-electron-app` ^3.1.1 checks GitHub Releases for updates (packaged builds only)
- Invoked in `packages/streamwall/src/main/index.ts` line 186-187

## Environment Configuration

**Required configuration (via CLI or TOML config file):**
- No environment variables required
- All configuration via command-line arguments or `--config=path/to/config.toml`

**Key configurable values:**
| Setting | Default | Description |
|---|---|---|
| `grid.count` | 3 | Grid dimension (creates NxN grid) |
| `window.width` | 1920 | Display window width |
| `window.height` | 1080 | Display window height |
| `window.frameless` | false | Frameless window mode |
| `data.interval` | 30 | JSON polling interval (seconds) |
| `data.json-url` | [] | JSON data source URLs |
| `data.toml-file` | [] | TOML data source file paths |
| `streamdelay.endpoint` | `http://localhost:8404` | Streamdelay server URL |
| `streamdelay.key` | null | Streamdelay API key |

**Secrets:**
- `streamdelay.key` - API key for Streamdelay service (passed via CLI or TOML config)
- No `.env` files used

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## IPC Communication (Internal)

**Electron IPC channels (main <-> renderer):**
Three preload scripts expose typed APIs via `contextBridge`:
- `packages/streamwall/src/preload/layerPreload.ts` - For background/overlay renderers
- `packages/streamwall/src/preload/mediaPreload.ts` - For stream view content
- `packages/streamwall/src/preload/controlPreload.ts` - For control panel

IPC is used for:
- State synchronization (main -> control, main -> stream window)
- Yjs CRDT binary updates (bidirectional between main and control)
- Control commands (control -> main, see `ControlCommand` type in `packages/streamwall-shared/src/types.ts`)

## Planned/Commented-Out Integrations

**Web Control Server (commented out in `packages/streamwall/src/main/index.ts`):**
- HTTP/HTTPS web server for remote control
- SSL certificate via ACME (Let's Encrypt)
- Username/password authentication
- Invite-based token system with roles
- Currently disabled; control is via Electron window only

---

*Integration audit: 2026-03-05*
