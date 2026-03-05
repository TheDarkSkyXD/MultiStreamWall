# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Streamwall is an Electron app that composes multiple livestreams into a mosaic grid with source attributions and audio control. It loads webpages into a grid of browser views, finds `<video>` tags, and reformats them to fill the space. v2.0 is a TypeScript rewrite using Electron Forge.

## Build & Development Commands

```bash
# Install dependencies (from root)
npm ci

# Start dev (from root — delegates to packages/streamwall)
npm start
# With config file:
npm start -- --config="../streamwall.toml"

# Lint (from packages/streamwall)
npm -w streamwall run lint

# Package / make distributable / publish
npm -w streamwall run package
npm -w streamwall run make
npm -w streamwall run publish
```

There is no test suite configured.

## Monorepo Structure

npm workspaces monorepo with three packages:

- **`packages/streamwall`** — Main Electron app (Electron Forge + Vite)
- **`packages/streamwall-shared`** — Shared TypeScript types, geometry helpers, roles, colors
- **`packages/streamwall-control-ui`** — Preact-based control panel UI component library

## Architecture

### Electron Process Model

```
Main Process (packages/streamwall/src/main/index.ts)
├── StreamWindow — display grid window
│   ├── backgroundView (WebContentsView — iframes for kind=background streams)
│   ├── overlayView (WebContentsView — stream labels, borders, spinners, blur)
│   └── N stream views (WebContentsView per active stream, each with XState actor)
└── ControlWindow — operator control panel window
```

### Renderer Pages (Vite multi-page build, all Preact)

| Page | Purpose |
|---|---|
| `background.html/tsx` | Renders iframes for background-kind streams |
| `overlay.html/tsx` | Stream borders, labels, loading spinners, blur |
| `playHLS.html/ts` | HLS `.m3u8` playback via hls.js |
| `control.html/tsx` | Operator control panel |

### Key Patterns

- **IPC bridge via preload scripts**: Three preload scripts (`layerPreload`, `mediaPreload`, `controlPreload`) use `contextBridge` to expose typed APIs. Main<->renderer communication goes through named IPC channels.
- **XState state machines**: Each stream view has a `viewStateMachine` managing its lifecycle: `empty → displaying.loading → displaying.running` with parallel audio (muted/listening/background) and video (normal/blurred) states.
- **Yjs CRDT for view state**: View-to-stream assignment is stored in a `Y.Doc` (`Y.Map<Y.Map>` named `'views'`). Main process is authoritative; control window syncs via binary updates over IPC. This enables future multi-operator collaboration.
- **Data pipeline**: Streams come from JSON URLs (polled), TOML files (watched via chokidar), or in-memory `LocalStreamData`. These are merged via `combineDataSources` (async generators using Repeater) and assigned stable IDs via `StreamIDGenerator`.
- **Streamdelay integration**: Optional WebSocket connection to a [Streamdelay](https://github.com/chromakode/streamdelay) instance for censor/delay control.

### Key Files

| File | Role |
|---|---|
| `packages/streamwall/src/main/index.ts` | App entry: CLI parsing (yargs+TOML), Electron init, orchestrates windows and data sources |
| `packages/streamwall/src/main/StreamWindow.ts` | Display window: BrowserWindow, WebContentsViews, view lifecycle |
| `packages/streamwall/src/main/ControlWindow.ts` | Control panel window, IPC routing |
| `packages/streamwall/src/main/viewStateMachine.ts` | XState machine per stream view |
| `packages/streamwall/src/main/data.ts` | Data pipeline: polling, file watching, combining sources |
| `packages/streamwall-control-ui/src/index.tsx` | Full control panel UI (drag assignment, hotkeys, stream list) |
| `packages/streamwall-shared/src/types.ts` | All shared TypeScript types |
| `packages/streamwall-shared/src/geometry.ts` | Grid layout math, box merging |

## Tech Stack Notes

- **Preact** (not React) — `react`/`react-dom` are aliased to `preact/compat` in tsconfig and Vite config
- **styled-components** for CSS-in-JS
- **TypeScript** — v4.5 in `streamwall` package, v5.6 in shared packages
- **Prettier** — no semicolons, single quotes, trailing commas, organize-imports plugin
- **Electron Forge** with Vite plugin — builds are configured in `forge.config.ts`
- Dev startup uses `scripts/start.js` which strips `ELECTRON_RUN_AS_NODE` env var for VS Code compatibility
