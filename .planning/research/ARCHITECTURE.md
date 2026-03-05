# Architecture Research

**Domain:** Live stream discovery integration into Electron multi-stream viewer
**Researched:** 2026-03-05
**Confidence:** HIGH

## System Overview

```
Main Process (packages/streamwall/src/main/)
├── Existing Components
│   ├── StreamWindow          — display grid BrowserWindow
│   ├── ControlWindow         — operator panel BrowserWindow + IPC routing
│   ├── viewStateMachine      — XState per-view lifecycle
│   ├── data.ts               — combineDataSources, pollDataURL, watchDataFile
│   ├── StreamdelayClient     — WebSocket to Streamdelay
│   └── index.ts              — orchestrator: wires IPC, state, data pipeline
│
├── New: Discovery Layer
│   ├── DiscoveryManager      — orchestrates all platform providers, owns settings
│   ├── Platform Providers    — one per platform (YouTube, Twitch, Kick, TikTok, Instagram, Facebook)
│   │   ├── YouTubeProvider   — youtubei (Innertube) + optional Data API v3
│   │   ├── TwitchProvider    — public Helix API
│   │   ├── KickProvider      — public API
│   │   ├── TikTokProvider    — unofficial scraping
│   │   ├── InstagramProvider — unofficial scraping
│   │   └── FacebookProvider  — unofficial scraping
│   ├── LivenessChecker       — periodic liveness verification, emits removals
│   └── SettingsStore         — persists API keys, filters, intervals to disk
│
├── IPC Bridge
│   ├── controlPreload.ts     — existing: state, ydoc, command channels
│   └── controlPreload.ts     — extended: discovery:* channels added
│
└── Control Panel Renderer (packages/streamwall-control-ui/)
    ├── Existing: StreamList, GridView, DragAssignment, Hotkeys
    └── New: DiscoveryPanel (tabs, filters, settings, stream cards)
```

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **DiscoveryManager** | Owns discovery lifecycle: starts/stops providers, manages intervals, aggregates results, feeds into data pipeline | Platform providers, LivenessChecker, SettingsStore, data pipeline (via async generator) |
| **Platform Provider** (x6) | Fetches live streams from one platform, normalizes to StreamData format, handles rate limiting and errors | DiscoveryManager (called by), platform APIs (HTTP) |
| **LivenessChecker** | Periodically verifies streams are still live, signals removal of dead streams | DiscoveryManager (reports to), platform APIs (HTTP) |
| **SettingsStore** | Reads/writes discovery configuration (API keys, filters, intervals, language) to disk | DiscoveryManager (read by), ControlWindow IPC (written via settings UI) |
| **DiscoveryPanel** (renderer) | UI: platform tabs, filter inputs, stream cards with Watch/Link buttons, settings panel | controlPreload IPC bridge |

## Recommended Project Structure

```
packages/streamwall/src/main/
├── discovery/
│   ├── DiscoveryManager.ts       # orchestrator, async generator output
│   ├── LivenessChecker.ts        # periodic liveness verification
│   ├── SettingsStore.ts          # persistent settings (electron-store or JSON)
│   ├── types.ts                  # DiscoveryStream, ProviderConfig, FilterConfig
│   └── providers/
│       ├── BaseProvider.ts       # abstract class: poll(), normalize(), rateLimit()
│       ├── YouTubeProvider.ts    # youtubei + optional API v3
│       ├── TwitchProvider.ts     # Helix public API
│       ├── KickProvider.ts       # Kick public API
│       ├── TikTokProvider.ts     # unofficial
│       ├── InstagramProvider.ts  # unofficial
│       └── FacebookProvider.ts   # unofficial
├── data.ts                       # existing — unchanged
├── index.ts                      # existing — adds discovery data source
├── StreamWindow.ts               # existing — unchanged
└── ControlWindow.ts              # existing — adds discovery IPC handlers

packages/streamwall-control-ui/src/
├── index.tsx                     # existing control panel — adds tabs
├── discovery/
│   ├── DiscoveryPanel.tsx        # main discovery tab container
│   ├── PlatformTab.tsx           # per-platform stream list
│   ├── StreamCard.tsx            # thumbnail, title, viewers, Watch/Link buttons
│   ├── FilterBar.tsx             # keyword/tag filter inputs
│   └── SettingsPanel.tsx         # API keys, intervals, language settings

packages/streamwall-shared/src/
├── types.ts                      # existing — add DiscoveryStream, DiscoveryState types
└── ...
```

### Structure Rationale

- **`discovery/` subdirectory in main:** Keeps discovery isolated from existing code. The only touch point is `index.ts` adding one more data source to the `dataSources` array.
- **`providers/` subdirectory:** Each platform is its own file. Adding/removing platforms means adding/removing one file plus registering in DiscoveryManager. No cross-platform coupling.
- **`discovery/` subdirectory in control-ui:** Discovery UI is additive (new tab), not a rewrite of existing control panel code.

## Architectural Patterns

### Pattern 1: Discovery as Data Source (async generator)

**What:** DiscoveryManager exposes a `gen(): AsyncGenerator<StreamData[]>` method identical to `LocalStreamData.gen()`. The main orchestrator adds it to the `dataSources` array passed to `combineDataSources()`. Discovery streams merge seamlessly with JSON/TOML/custom streams.

**When to use:** Always. This is the core integration point.

**Trade-offs:**
- Pro: Zero changes to existing data pipeline. Discovery streams get IDs, deduplication, and view assignment for free.
- Pro: Existing stream list in control panel shows discovery streams automatically.
- Con: `combineDataSources` deduplicates by URL, so a discovered stream added manually via custom stream won't conflict — the custom data will merge/override discovery data (spread semantics: `{ ...existing, ...data }`), which is correct behavior.

**Example:**
```typescript
// In DiscoveryManager
class DiscoveryManager extends EventEmitter {
  private streams: Map<string, StreamData> = new Map()

  gen(): AsyncGenerator<StreamData[]> {
    return new Repeater(async (push, stop) => {
      await push([])
      this.on('update', push)
      await stop
      this.off('update', push)
    })
  }
}

// In index.ts — the only change to existing orchestration:
const discoveryManager = new DiscoveryManager(settingsStore)
const dataSources = [
  ...existingSources,
  markDataSource(discoveryManager.gen(), 'discovery'),
]
```

### Pattern 2: Provider Abstraction with Graceful Degradation

**What:** Each platform provider extends a `BaseProvider` abstract class that defines a common interface: `search(filters): Promise<DiscoveryStream[]>`, `checkLive(urls): Promise<Map<string, boolean>>`, and `isAvailable(): boolean`. The base class handles rate limiting, retry with backoff, and error catching. If a provider throws, DiscoveryManager catches it, marks that platform as degraded, and continues with other platforms.

**When to use:** Always. Essential for the unofficial TikTok/Instagram/Facebook providers that will break.

**Trade-offs:**
- Pro: One provider failing does not affect others. UI shows per-platform status.
- Pro: Adding a new platform is one class implementing the interface.
- Con: Slightly more abstraction than needed for the 3 stable platforms (YouTube/Twitch/Kick), but consistency matters more.

**Example:**
```typescript
abstract class BaseProvider {
  abstract readonly platform: string
  abstract search(filters: FilterConfig): Promise<DiscoveryStream[]>
  abstract checkLive(urls: string[]): Promise<Map<string, boolean>>

  private lastCall = 0
  protected minIntervalMs = 1000

  protected async rateLimitedFetch<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const wait = Math.max(0, this.lastCall + this.minIntervalMs - now)
    if (wait > 0) await sleep(wait)
    this.lastCall = Date.now()
    return fn()
  }
}
```

### Pattern 3: Separate Discovery State via IPC (not Yjs)

**What:** Discovery state (discovered streams per platform, filter settings, provider status) is sent from main to renderer via a dedicated `discovery-state` IPC channel, separate from the existing `state` channel. The control panel renderer receives both `StreamwallState` (existing) and `DiscoveryState` (new) independently.

**When to use:** Always. Discovery state is fundamentally different from view assignment state.

**Trade-offs:**
- Pro: Does not bloat the existing `StreamwallState` object that gets serialized on every view state change.
- Pro: Discovery state changes (new streams found) do not trigger re-renders of the grid view.
- Pro: Clean separation — Yjs remains for collaborative view assignment only.
- Con: Two state channels to manage, but they are independent concerns.

**Why not Yjs:** Discovery is not collaborative. One operator's filters should not sync to another operator. Yjs adds complexity for no benefit here.

**Example:**
```typescript
// New type in streamwall-shared/types.ts
interface DiscoveryState {
  platforms: Record<string, {
    enabled: boolean
    status: 'active' | 'degraded' | 'error' | 'disabled'
    streams: DiscoveryStream[]
    lastFetch: number | null
    error: string | null
  }>
  filters: FilterConfig
  settings: DiscoverySettings
}

// In controlPreload.ts — add:
onDiscoveryState: (handler: (state: DiscoveryState) => void) => {
  const internalHandler = (_ev, state) => handler(state)
  ipcRenderer.on('discovery-state', internalHandler)
  return () => ipcRenderer.off('discovery-state', internalHandler)
}

// In ControlWindow.ts — add:
onDiscoveryState(state: DiscoveryState) {
  this.win.webContents.send('discovery-state', state)
}
```

### Pattern 4: Command Pattern for Discovery Actions

**What:** Discovery user actions (set filters, toggle platform, change interval, add API key) are sent as typed commands through the existing `control:command` IPC channel by extending `ControlCommand` with new discriminated union members. The main process routes discovery commands to DiscoveryManager.

**When to use:** Always. Reuses the existing command routing infrastructure.

**Trade-offs:**
- Pro: No new IPC channels needed for commands (only one new channel for state).
- Pro: Existing pattern is well-established and type-safe.
- Con: `onCommand` switch in index.ts grows, but can be refactored to delegate discovery commands to DiscoveryManager.

**Example:**
```typescript
// Extend ControlCommand in streamwall-shared/types.ts:
| { type: 'discovery:set-filters'; filters: FilterConfig }
| { type: 'discovery:toggle-platform'; platform: string; enabled: boolean }
| { type: 'discovery:set-interval'; intervalMs: number }
| { type: 'discovery:set-liveness-interval'; intervalMs: number }
| { type: 'discovery:set-api-key'; platform: string; key: string }
| { type: 'discovery:watch-stream'; url: string; streamData: Partial<StreamData> }
| { type: 'discovery:set-language'; language: string }
```

## Data Flow

### Discovery Data Flow

```
                    DiscoveryManager
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    YouTubeProvider TwitchProvider  KickProvider  ...
          │              │              │
          └──────────────┼──────────────┘
                         │ search() returns DiscoveryStream[]
                         ▼
              DiscoveryManager.streams (Map)
                    │            │
                    │            ▼
                    │     LivenessChecker
                    │     (removes dead streams)
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
  gen() → AsyncGenerator    IPC → discovery-state
  (feeds into data pipeline)    (feeds control panel UI)
         │
         ▼
  combineDataSources()
         │
         ▼
  StreamIDGenerator.process()
         │
         ▼
  updateState({ streams })
         │
    ┌────┴────┐
    ▼         ▼
StreamWindow  ControlWindow (existing stream list)
```

### Discovery Command Flow

```
DiscoveryPanel (renderer)
    │ user clicks "Watch", changes filter, etc.
    ▼
controlPreload.invokeCommand({ type: 'discovery:*', ... })
    │
    ▼
ControlWindow IPC handler → emits 'command'
    │
    ▼
index.ts onCommand()
    │ routes discovery:* commands
    ▼
DiscoveryManager
    │ updates filters/settings/providers
    ▼
Providers re-fetch → DiscoveryManager.streams updated
    │
    ├── gen() pushes to data pipeline → streams merge
    └── IPC push → discovery-state → DiscoveryPanel re-renders
```

### "Watch" Button Flow (Adding a Discovered Stream to Grid)

```
User clicks "Watch" on a stream card
    │
    ▼
Command: { type: 'discovery:watch-stream', url, streamData }
    │
    ▼
index.ts onCommand()
    │ finds first empty view slot in Yjs viewsState
    │ sets viewData.streamId = stream._id
    ▼
Yjs observeDeep fires → streamWindow.setViews()
    │
    ▼
Stream appears in grid (existing view lifecycle)
```

This is notable: the "Watch" button does NOT add a custom stream. The stream already exists in the data pipeline via the discovery generator. The Watch action only assigns it to a view slot via Yjs, exactly like drag-and-drop assignment in the existing UI.

### Settings Persistence Flow

```
SettingsStore
    │ reads on startup from:
    │   ~/.config/streamwall/discovery.json (or electron-store)
    │
    │ writes on change (debounced)
    ▼
DiscoveryManager reads settings → configures providers
```

## Integration Points

### Existing Code Touchpoints (Minimal)

The architecture is designed to minimize changes to existing code. Here are the exact files that need modification:

| File | Change | Scope |
|------|--------|-------|
| `packages/streamwall/src/main/index.ts` | Add DiscoveryManager instantiation, add its `gen()` to `dataSources` array, route `discovery:*` commands in `onCommand`, push discovery-state to ControlWindow | ~30 lines added |
| `packages/streamwall/src/main/ControlWindow.ts` | Add `onDiscoveryState()` method, add `discovery:*` IPC handlers | ~15 lines added |
| `packages/streamwall/src/preload/controlPreload.ts` | Add `onDiscoveryState`, `invokeDiscoveryCommand` to API | ~10 lines added |
| `packages/streamwall-shared/src/types.ts` | Add `DiscoveryStream`, `DiscoveryState`, `FilterConfig` types, extend `ControlCommand` | ~40 lines added |
| `packages/streamwall-control-ui/src/index.tsx` | Add tab navigation, render DiscoveryPanel when discovery tab active | ~20 lines modified |

**All new code lives in new files.** Existing files get small additions, not rewrites.

### External Services

| Service | Integration Pattern | Rate Limit Concern |
|---------|--------------------|--------------------|
| YouTube (Innertube via youtubei) | HTTP via library, no auth | Moderate — Innertube has implicit limits, ~100 req/day safe range |
| YouTube Data API v3 | HTTP with API key | 10,000 quota units/day (search = 100 units each) |
| Twitch Helix | HTTP, no auth for public endpoints | 800 req/min (no auth), sufficient for discovery |
| Kick | HTTP, no auth | Undocumented, conservative polling recommended |
| TikTok | Unofficial scraping/package | Fragile, aggressive anti-bot, expect breakage |
| Instagram | Unofficial scraping/package | Fragile, login-walled, expect breakage |
| Facebook | Unofficial scraping/package | Fragile, heavy anti-scraping, expect breakage |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| DiscoveryManager <-> Providers | Direct method calls (search, checkLive) | Providers are owned by DiscoveryManager, not shared |
| DiscoveryManager <-> Data Pipeline | Async generator (Repeater push pattern) | Same pattern as LocalStreamData — proven |
| DiscoveryManager <-> ControlWindow | IPC via main process relay | Main process pushes discovery-state; control sends commands |
| DiscoveryPanel <-> Existing Control UI | Preact component composition (tabs) | Discovery is a sibling tab, not nested in existing UI |

## Anti-Patterns

### Anti-Pattern 1: Fetching from Renderer Process

**What people do:** Make platform API calls directly from the control panel renderer.
**Why it's wrong:** Violates Electron security model (renderer is sandboxed, contextIsolation is on). Also breaks the data pipeline pattern — discovered streams must flow through `combineDataSources` to get IDs and deduplication.
**Do this instead:** All network requests in main process. Renderer only displays state and sends commands.

### Anti-Pattern 2: Putting Discovery Streams in Yjs

**What people do:** Store discovered stream list in the Yjs document alongside view assignments.
**Why it's wrong:** Yjs is for collaborative state that must sync between operators. Discovery filters/results are per-operator. Yjs adds serialization overhead and conflict resolution complexity for data that does not need it.
**Do this instead:** Use a plain IPC state channel for discovery results. Keep Yjs exclusively for view-to-stream assignment.

### Anti-Pattern 3: Separate Data Pipeline for Discovery

**What people do:** Create a parallel stream management system for discovered streams, bypassing `combineDataSources`.
**Why it's wrong:** Discovered streams need the same ID generation, deduplication, and state distribution as all other streams. Parallel systems lead to duplicate logic, inconsistent behavior, and streams that can not be assigned to views.
**Do this instead:** DiscoveryManager produces an `AsyncGenerator<StreamData[]>` that feeds directly into the existing `dataSources` array. One pipeline for all streams.

### Anti-Pattern 4: Polling All Platforms at the Same Interval

**What people do:** Use a single fetch interval for all platforms.
**Why it's wrong:** Platforms have different rate limits. YouTube Innertube is more restrictive than Twitch Helix. A 5-second interval that works for Twitch will get YouTube rate-limited.
**Do this instead:** DiscoveryManager uses a single user-facing fetch interval but applies per-provider minimum intervals internally via BaseProvider.rateLimitedFetch.

## Build Order (Dependencies)

The following order respects dependency chains. Each step depends on the one before it.

| Phase | What to Build | Depends On | Rationale |
|-------|---------------|------------|-----------|
| 1 | Shared types (`DiscoveryStream`, `DiscoveryState`, `FilterConfig`, extended `ControlCommand`) | Nothing | Everything else imports these |
| 2 | `BaseProvider` abstract class + `SettingsStore` | Shared types | Providers need the base class; Manager needs settings |
| 3 | YouTube + Twitch + Kick providers | BaseProvider, shared types | Stable platforms first — validates the provider pattern |
| 4 | `DiscoveryManager` + `LivenessChecker` | Providers, SettingsStore | Orchestrates providers, produces async generator |
| 5 | Main process integration (index.ts, ControlWindow, controlPreload) | DiscoveryManager | Wires discovery into app: data pipeline + IPC |
| 6 | Control panel UI (DiscoveryPanel, tabs, stream cards, filter bar) | IPC channels working | UI consumes discovery-state, sends commands |
| 7 | Settings UI | SettingsStore + UI framework | Least critical — can use config file initially |
| 8 | TikTok, Instagram, Facebook providers | BaseProvider pattern proven | Unstable platforms last — may need iteration |

**Key dependency insight:** Phases 1-5 are sequential (each builds on the last). Phase 6 (UI) can partially overlap with Phase 5 if IPC types are defined early. Phase 7-8 are independent of each other and can be done in any order after Phase 5.

## Scaling Considerations

| Concern | 6 platforms | 10+ platforms | Notes |
|---------|-------------|---------------|-------|
| Memory (stream objects) | Negligible — hundreds of stream objects are small | Still fine at thousands | StreamData objects are lightweight |
| CPU (polling) | 6 timers, minimal | Stagger timers to avoid bursts | BaseProvider.rateLimitedFetch handles this |
| Network (API calls) | ~6-12 requests per interval | Watch for aggregate rate | Per-provider intervals prevent overload |
| UI rendering (stream cards) | Virtualize list if >100 per platform | Must virtualize | Use windowing library if needed in Phase 6 |

### First Bottleneck: UI Rendering

If a platform returns 200+ live streams, rendering all cards will be slow. Use a virtual list (e.g., `@tanstack/virtual` or simple scroll-based pagination) in PlatformTab. This is a Phase 6 concern, not an architecture concern.

### Second Bottleneck: Unofficial Provider Maintenance

TikTok/Instagram/Facebook will break. The BaseProvider pattern with `isAvailable()` and graceful degradation means this is an operational concern, not an architectural one. The app continues working with degraded platforms showing an error state.

## Sources

- Existing codebase analysis: `packages/streamwall/src/main/data.ts` (data pipeline pattern)
- Existing codebase analysis: `packages/streamwall/src/main/index.ts` (orchestration pattern)
- Existing codebase analysis: `packages/streamwall/src/main/ControlWindow.ts` (IPC pattern)
- Existing codebase analysis: `packages/streamwall/src/preload/controlPreload.ts` (preload API pattern)
- Existing codebase analysis: `packages/streamwall-shared/src/types.ts` (type patterns)
- Electron security documentation: contextIsolation and sandbox model (HIGH confidence, official docs)

---
*Architecture research for: live stream discovery in Electron*
*Researched: 2026-03-05*
