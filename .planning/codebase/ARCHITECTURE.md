# Architecture

**Analysis Date:** 2026-03-05

## Pattern Overview

**Overall:** Multi-process Electron application with event-driven IPC orchestration

**Key Characteristics:**
- Electron main process orchestrates all state; renderer processes are passive consumers
- XState state machines manage per-view lifecycle with parallel audio/video states
- Yjs CRDT document provides collaborative view-to-stream assignment (future multi-operator support)
- Async generator data pipeline merges multiple stream sources in real-time
- Three preload scripts form typed IPC bridges between main and renderer processes

## Layers

**Main Process (Orchestrator):**
- Purpose: Application entry, CLI/config parsing, window management, data pipeline, state distribution
- Location: `packages/streamwall/src/main/`
- Contains: `index.ts` (entry + orchestration), `StreamWindow.ts`, `ControlWindow.ts`, `viewStateMachine.ts`, `data.ts`, `StreamdelayClient.ts`, `loadHTML.ts`
- Depends on: Electron APIs, Yjs, XState, yargs, chokidar, node-fetch
- Used by: All renderer processes via IPC

**Preload Layer (IPC Bridge):**
- Purpose: Expose typed APIs from main process to renderer processes via `contextBridge`
- Location: `packages/streamwall/src/preload/`
- Contains: `controlPreload.ts`, `layerPreload.ts`, `mediaPreload.ts`
- Depends on: Electron `contextBridge`, `ipcRenderer`
- Used by: Renderer pages access these as `window.streamwallControl`, `window.streamwallLayer`, or direct `ipcRenderer` calls

**Renderer Layer (UI):**
- Purpose: Display stream grid, overlay labels/borders, control panel UI, HLS playback
- Location: `packages/streamwall/src/renderer/`
- Contains: `background.tsx`, `overlay.tsx`, `control.tsx`, `playHLS.ts`
- Depends on: Preact, styled-components, preload APIs, streamwall-control-ui, streamwall-shared
- Used by: End users (display window, control panel)

**Shared Library:**
- Purpose: TypeScript types, geometry math, role-based access control, color hashing
- Location: `packages/streamwall-shared/src/`
- Contains: `types.ts`, `geometry.ts`, `roles.ts`, `colors.ts`, `index.ts`
- Depends on: Electron `Rectangle` type, lodash-es, color
- Used by: All layers (main, preload, renderer, control-ui)

**Control UI Library:**
- Purpose: Reusable Preact control panel component with drag-and-drop stream assignment, hotkeys, stream list
- Location: `packages/streamwall-control-ui/src/index.tsx`
- Contains: Single large file (~1300+ lines) with all components, hooks, and styled-components
- Depends on: Preact, Yjs, xstate, styled-components, streamwall-shared, react-hotkeys-hook, react-icons
- Used by: `packages/streamwall/src/renderer/control.tsx` (Electron renderer) and potentially future web control server

## Data Flow

**Stream Data Pipeline:**

1. Data sources are configured via CLI/TOML: JSON URLs (polled at interval) and TOML files (watched via chokidar), plus in-memory `LocalStreamData` for operator-added custom streams
2. Each source is an async generator (`DataSource = AsyncGenerator<StreamData[]>`) wrapped with `markDataSource()` to tag origin
3. `combineDataSources()` uses `Repeater.latest()` to merge all generators, deduplicating by URL and merging properties
4. `StreamIDGenerator.process()` assigns stable short IDs to streams based on source/label/link text
5. `updateState({ streams })` distributes the merged stream list to `StreamWindow` and `ControlWindow`

**View Assignment Flow:**

1. Operator drags stream to grid cell in control UI, which updates the local Yjs document
2. Yjs update is sent via IPC (`control:ydoc`) to main process
3. Main process applies update to authoritative `Y.Doc` via `Y.applyUpdate()`
4. `viewsState.observeDeep()` callback fires, builds a `ViewContentMap` (viewIdx -> {url, kind})
5. `streamWindow.setViews()` receives the map, runs box-merging algorithm (`boxesFromViewContentMap`), and matches existing views to new positions using three-pass matching (same URL + same position > same URL + loaded > same URL)
6. Unmatched boxes get new `WebContentsView` instances with XState actors
7. Each actor navigates to the URL, waits for video detection via `mediaPreload`, then positions the view

**State Synchronization:**

1. Main process maintains canonical `clientState: StreamwallState` (config, streams, views, streamdelay)
2. `updateState()` pushes full state to both `StreamWindow.onState()` and `ControlWindow.onState()` via `webContents.send('state', ...)`
3. `StreamWindow` emits `'state'` events (view states from XState snapshots) back to main, which updates `clientState.views`
4. Yjs document updates flow bidirectionally: main -> control via `onYDocUpdate()`, control -> main via `'ydoc'` event

**State Management:**
- Application state (`StreamwallState`) is a plain object held in main process `index.ts`, updated via `updateState()` spread-merge
- View-to-stream assignment state is a Yjs `Y.Map<Y.Map>` CRDT document, enabling future multi-operator collaboration
- Per-view lifecycle state is managed by XState actors (`viewStateMachine`)
- Renderer state is local Preact `useState` hooks, receiving updates via IPC subscriptions

## Key Abstractions

**StreamWindow:**
- Purpose: Manages the display BrowserWindow with background, overlay, and N stream WebContentsViews
- Examples: `packages/streamwall/src/main/StreamWindow.ts`
- Pattern: EventEmitter subclass, creates/destroys WebContentsView instances and XState actors per stream slot. Contains view matching algorithm for efficient view reuse during layout changes.

**ControlWindow:**
- Purpose: Manages the operator control panel BrowserWindow and routes IPC
- Examples: `packages/streamwall/src/main/ControlWindow.ts`
- Pattern: EventEmitter subclass, thin wrapper that routes IPC events (`control:load`, `control:command`, `control:ydoc`) to EventEmitter events consumed by main orchestrator

**viewStateMachine (XState):**
- Purpose: Manages lifecycle of each stream WebContentsView: loading, running, audio/video states, error handling
- Examples: `packages/streamwall/src/main/viewStateMachine.ts`
- Pattern: XState v5 `setup().createMachine()` with states: `empty -> displaying.loading.navigate -> displaying.loading.waitForInit -> displaying.loading.waitForVideo -> displaying.running{audio, video}`. Parallel states for audio (muted/listening/background) and video (normal/blurred).

**Data Sources (async generators):**
- Purpose: Provide streams of stream data from various inputs (JSON polling, TOML file watching, in-memory)
- Examples: `packages/streamwall/src/main/data.ts`
- Pattern: Each source is an `AsyncGenerator<StreamData[]>`. `pollDataURL()` polls HTTP endpoints. `watchDataFile()` watches filesystem. `LocalStreamData` wraps a Map with `Repeater` for push-based updates. `combineDataSources()` merges using `Repeater.latest()`.

**Preload APIs:**
- Purpose: Type-safe IPC bridge between main and renderer processes
- Examples: `packages/streamwall/src/preload/controlPreload.ts`, `packages/streamwall/src/preload/layerPreload.ts`, `packages/streamwall/src/preload/mediaPreload.ts`
- Pattern: Each preload creates an API object, exposes it via `contextBridge.exposeInMainWorld()`. Renderers declare the global type and access via `window.streamwallControl` etc. The `mediaPreload` is special: it runs complex DOM manipulation (video finding, CSS injection, mutation observers) directly in the loaded page's context.

**StreamIDGenerator:**
- Purpose: Assigns stable short alphanumeric IDs to streams based on their source/label/link
- Examples: `packages/streamwall/src/main/data.ts` (class `StreamIDGenerator`)
- Pattern: Deterministic ID generation from text normalization, with collision avoidance via counter suffix

## Entry Points

**Application Entry:**
- Location: `packages/streamwall/src/main/index.ts`
- Triggers: `npm start` -> `scripts/start.js` -> Electron Forge -> runs this as main process
- Responsibilities: Parse CLI args (yargs + TOML config), initialize Electron, create StreamWindow + ControlWindow, set up data pipeline, wire IPC, run main event loop

**Renderer Entry Points (4 separate HTML pages):**
- `packages/streamwall/src/renderer/background.html` / `background.tsx`: Renders iframes for `kind=background` streams
- `packages/streamwall/src/renderer/overlay.html` / `overlay.tsx`: Stream borders, labels, loading spinners, blur covers
- `packages/streamwall/src/renderer/playHLS.html` / `playHLS.ts`: HLS `.m3u8` playback via hls.js
- `packages/streamwall/src/renderer/control.html` / `control.tsx`: Operator control panel, delegates to `streamwall-control-ui`

**Dev Startup:**
- Location: `packages/streamwall/scripts/start.js`
- Triggers: `npm start`
- Responsibilities: Strips `ELECTRON_RUN_AS_NODE`, runs Forge build, starts Vite dev server, spawns Electron

## Error Handling

**Strategy:** Console logging with graceful degradation; no centralized error handling framework

**Patterns:**
- Main process wraps top-level `main()` in `.catch()` that logs and exits with code 1
- Data pipeline: `pollDataURL()` catches fetch errors and falls back to cached data; `watchDataFile()` catches read errors and yields empty array
- View lifecycle: XState machine has an `error` state; `loadPage` actor `onError` transitions to `displaying.error` with `logError` action
- URL validation: `ensureValidURL()` in `packages/streamwall/src/util.ts` rejects non-http(s) URLs
- IPC handlers: `viewsState.observeDeep()` callback wraps view updates in try/catch
- Navigation prevention: `view.webContents.on('will-navigate', (ev) => ev.preventDefault())` prevents stream views from navigating away

## Cross-Cutting Concerns

**Logging:** `console.debug()`, `console.warn()`, `console.error()` throughout main process. No structured logging framework.

**Validation:** URL validation via `ensureValidURL()` (`packages/streamwall/src/util.ts`). Stream data is unvalidated (TODO comment mentions Zod). Permission requests from web content are blanket-rejected via `session.setPermissionRequestHandler()`.

**Authentication:** Role-based access control defined in `packages/streamwall-shared/src/roles.ts` with four roles: `local`, `admin`, `operator`, `monitor`. Currently only `local` role is used (Electron-only mode). Web control server with auth is commented out in `packages/streamwall/src/main/index.ts`.

**Security:** Electron sandbox enabled (`app.enableSandbox()`), `contextIsolation: true` on all views, `nodeIntegration: false`, `partition: 'persist:session'` for stream content. Fuses configured in `packages/streamwall/forge.config.ts` (RunAsNode disabled, CookieEncryption enabled, NodeOptions disabled).

---

*Architecture analysis: 2026-03-05*
