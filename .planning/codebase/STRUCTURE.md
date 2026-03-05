# Codebase Structure

**Analysis Date:** 2026-03-05

## Directory Layout

```
MultiStreamWall/
├── packages/
│   ├── streamwall/                    # Main Electron app
│   │   ├── src/
│   │   │   ├── main/                  # Electron main process code
│   │   │   │   ├── index.ts           # App entry, CLI parsing, orchestration
│   │   │   │   ├── StreamWindow.ts    # Display window with stream grid
│   │   │   │   ├── ControlWindow.ts   # Operator control panel window
│   │   │   │   ├── viewStateMachine.ts # XState machine per stream view
│   │   │   │   ├── data.ts            # Data pipeline (polling, file watching, combining)
│   │   │   │   ├── StreamdelayClient.ts # WebSocket client for Streamdelay
│   │   │   │   └── loadHTML.ts        # Helper to load renderer HTML pages
│   │   │   ├── preload/               # Electron preload scripts (IPC bridges)
│   │   │   │   ├── controlPreload.ts  # Control panel IPC API
│   │   │   │   ├── layerPreload.ts    # Background/overlay layer IPC API
│   │   │   │   └── mediaPreload.ts    # Stream view: video finder, CSS injection, rotation
│   │   │   ├── renderer/              # Renderer process pages (Preact)
│   │   │   │   ├── background.html    # Background streams entry HTML
│   │   │   │   ├── background.tsx     # Background iframe renderer
│   │   │   │   ├── overlay.html       # Overlay entry HTML
│   │   │   │   ├── overlay.tsx        # Stream labels, borders, spinners, blur
│   │   │   │   ├── control.html       # Control panel entry HTML
│   │   │   │   ├── control.tsx        # Control panel renderer (wraps streamwall-control-ui)
│   │   │   │   ├── playHLS.html       # HLS player entry HTML
│   │   │   │   ├── playHLS.ts         # HLS.js player for .m3u8 streams
│   │   │   │   ├── index.css          # Shared base CSS (Tailwind)
│   │   │   │   └── svg-loaders-react.d.ts # Type declaration for SVG loaders
│   │   │   └── util.ts               # Shared utility (URL validation)
│   │   ├── scripts/
│   │   │   ├── start.js               # Dev startup script (Forge + Vite + Electron)
│   │   │   └── dev.js                 # Alternative dev script (untracked)
│   │   ├── forge.config.ts            # Electron Forge configuration
│   │   ├── forge.env.d.ts             # Forge environment type declarations
│   │   ├── vite.main.config.ts        # Vite config for main process bundle
│   │   ├── vite.preload.config.ts     # Vite config for preload bundles
│   │   ├── vite.renderer.config.ts    # Vite config for renderer pages (multi-page)
│   │   └── package.json               # Package manifest
│   ├── streamwall-shared/             # Shared TypeScript library
│   │   └── src/
│   │       ├── index.ts               # Barrel export
│   │       ├── types.ts               # All shared types (StreamData, ViewState, ControlCommand, etc.)
│   │       ├── geometry.ts            # Grid layout math, box merging, coordinate helpers
│   │       ├── roles.ts               # Role-based access control (local/admin/operator/monitor)
│   │       └── colors.ts              # Deterministic color hashing for stream IDs
│   └── streamwall-control-ui/         # Control panel component library
│       ├── src/
│       │   └── index.tsx              # Full control UI (single large file, ~1300+ lines)
│       ├── vite.config.ts             # Vite library-mode config
│       └── package.json               # Package manifest
├── package.json                       # Root workspace manifest
├── package-lock.json                  # Lockfile
├── prettier.config.js                 # Prettier configuration
├── example.config.toml                # Example app configuration
├── example.streams.toml               # Example stream data file
├── CLAUDE.md                          # Claude Code instructions
├── README.md                          # Project documentation
├── LICENSE                            # MIT license
└── CODE_OF_CONDUCT.md                 # Code of conduct
```

## Directory Purposes

**`packages/streamwall/src/main/`:**
- Purpose: All Electron main process logic
- Contains: Window managers, state machines, data pipeline, external service clients
- Key files: `index.ts` (entry), `StreamWindow.ts` (display), `ControlWindow.ts` (control), `viewStateMachine.ts` (per-view lifecycle), `data.ts` (stream data sources)

**`packages/streamwall/src/preload/`:**
- Purpose: Electron preload scripts that create typed IPC bridges
- Contains: Three preload scripts, each exposing a different API via `contextBridge`
- Key files: `controlPreload.ts` (exposes `window.streamwallControl`), `layerPreload.ts` (exposes `window.streamwallLayer`), `mediaPreload.ts` (runs video detection and DOM manipulation in stream pages)

**`packages/streamwall/src/renderer/`:**
- Purpose: Four separate renderer pages, each loaded in different WebContentsViews
- Contains: HTML entry points and their corresponding TSX/TS source files
- Key files: `overlay.tsx` (largest, renders stream labels/borders), `control.tsx` (wraps control-ui library), `background.tsx` (background iframes), `playHLS.ts` (HLS player)

**`packages/streamwall-shared/src/`:**
- Purpose: Types and utilities shared across all packages
- Contains: TypeScript interfaces, grid math, RBAC, color hashing
- Key files: `types.ts` (all shared interfaces including `StreamData`, `StreamwallState`, `ControlCommand`, `ViewState`), `geometry.ts` (grid box merging algorithm)

**`packages/streamwall-control-ui/src/`:**
- Purpose: Reusable control panel UI that can work in both Electron and web contexts
- Contains: Single `index.tsx` with all components, hooks, and styled-components
- Key files: `index.tsx` (exports `ControlUI`, `useStreamwallState`, `useYDoc`, `StreamwallConnection`)

**`packages/streamwall/scripts/`:**
- Purpose: Development startup scripts
- Contains: `start.js` handles the three-phase dev startup (Forge build -> Vite dev server -> Electron launch)

## Key File Locations

**Entry Points:**
- `packages/streamwall/src/main/index.ts`: Application entry point, CLI parsing, main orchestration loop
- `packages/streamwall/scripts/start.js`: Dev startup script invoked by `npm start`

**Configuration:**
- `packages/streamwall/forge.config.ts`: Electron Forge build/package/publish config
- `packages/streamwall/vite.renderer.config.ts`: Vite multi-page renderer build config
- `packages/streamwall/vite.main.config.ts`: Vite main process build config
- `packages/streamwall/vite.preload.config.ts`: Vite preload script build config
- `prettier.config.js`: Prettier formatting config (root level)
- `example.config.toml`: Example application configuration file

**Core Logic:**
- `packages/streamwall/src/main/StreamWindow.ts`: Display window management, view matching, WebContentsView lifecycle
- `packages/streamwall/src/main/viewStateMachine.ts`: XState v5 state machine for per-view lifecycle
- `packages/streamwall/src/main/data.ts`: Async generator data pipeline (polling, file watching, combining, ID generation)
- `packages/streamwall-shared/src/geometry.ts`: Grid layout algorithm, box merging for multi-cell streams
- `packages/streamwall/src/preload/mediaPreload.ts`: Video detection, CSS injection, rotation in loaded pages

**Type Definitions:**
- `packages/streamwall-shared/src/types.ts`: All shared TypeScript types
- `packages/streamwall/forge.env.d.ts`: Forge environment global declarations

**Testing:**
- No test files exist. No test framework is configured.

## Naming Conventions

**Files:**
- PascalCase for class-based modules: `StreamWindow.ts`, `ControlWindow.ts`, `StreamdelayClient.ts`
- camelCase for utility/functional modules: `viewStateMachine.ts`, `data.ts`, `loadHTML.ts`
- camelCase for renderer pages: `background.tsx`, `overlay.tsx`, `control.tsx`, `playHLS.ts`
- Preload scripts use camelCase with "Preload" suffix: `controlPreload.ts`, `layerPreload.ts`, `mediaPreload.ts`

**Directories:**
- All lowercase: `main/`, `preload/`, `renderer/`, `scripts/`, `src/`
- Package names use kebab-case: `streamwall`, `streamwall-shared`, `streamwall-control-ui`

**Exports:**
- Classes use `export default class` pattern: `StreamWindow`, `ControlWindow`, `StreamdelayClient`
- State machine uses `export default` for the machine, named export for actor type: `export type ViewActor`
- Shared package uses barrel export: `packages/streamwall-shared/src/index.ts` re-exports all submodules

## Where to Add New Code

**New Main Process Feature (e.g., new window type, service client):**
- Primary code: `packages/streamwall/src/main/` (new `.ts` file, PascalCase if class)
- Wire into orchestrator: `packages/streamwall/src/main/index.ts`
- If needs IPC: add preload in `packages/streamwall/src/preload/`, register in `packages/streamwall/forge.config.ts` build entries

**New Renderer Page:**
- HTML entry: `packages/streamwall/src/renderer/{name}.html`
- TSX source: `packages/streamwall/src/renderer/{name}.tsx`
- Register in Vite: add to `rollupOptions.input` in `packages/streamwall/vite.renderer.config.ts`
- Load from main: use `loadHTML(webContents, '{name}')` in main process code

**New Shared Type:**
- Add interface/type to `packages/streamwall-shared/src/types.ts`
- It will be automatically available via barrel export in `packages/streamwall-shared/src/index.ts`

**New Control UI Feature:**
- Add to `packages/streamwall-control-ui/src/index.tsx` (currently a single-file component library)
- Export any new hooks/components from this file

**New Utility Function:**
- Shared across packages: add to appropriate file in `packages/streamwall-shared/src/`
- Main process only: `packages/streamwall/src/util.ts`

**New Data Source Type:**
- Add async generator function to `packages/streamwall/src/main/data.ts`
- Wire into `dataSources` array in `packages/streamwall/src/main/index.ts` (around line 412)

## Special Directories

**`.vite/`:**
- Purpose: Vite build cache
- Generated: Yes
- Committed: No (should be in .gitignore)

**`node_modules/`:**
- Purpose: npm workspace dependencies
- Generated: Yes (via `npm ci`)
- Committed: No

**`.planning/`:**
- Purpose: Planning and analysis documents for development tooling
- Generated: By analysis tools
- Committed: Varies

**`.claude/`:**
- Purpose: Claude Code configuration, agents, commands, skills
- Generated: No (manually configured)
- Committed: Yes

---

*Structure analysis: 2026-03-05*
