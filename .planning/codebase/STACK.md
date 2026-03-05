# Technology Stack

**Analysis Date:** 2026-03-05

## Languages

**Primary:**
- TypeScript ~4.5.4 - Main Electron app (`packages/streamwall`)
- TypeScript ~5.6.2 - Shared packages (`packages/streamwall-shared`, `packages/streamwall-control-ui`)

**Secondary:**
- JavaScript (CommonJS) - Build/start scripts (`packages/streamwall/scripts/start.js`)
- HTML - Renderer entry pages (`packages/streamwall/src/renderer/*.html`)
- CSS - Styling via Tailwind CSS 4 and styled-components

## Runtime

**Environment:**
- Electron ^33.2.1 (Chromium-based, bundles Node.js)
- Target: ES2024 (tsconfig `target`)

**Package Manager:**
- npm with workspaces
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Electron ^33.2.1 - Desktop app shell, multi-process model (main + renderer)
- Preact ^10.25.3 - UI rendering (aliased as `react`/`react-dom` via tsconfig paths and Vite config)
- XState ^5.19.1 - State machines for view lifecycle management
- Yjs ^13.6.21 - CRDT for collaborative view state synchronization

**Build/Dev:**
- Electron Forge ^7.6.0 - Build toolchain, packaging, publishing
- Vite ^5.4.14 - Bundler for main, preload, and renderer builds
- `@preact/preset-vite` ^2.10.1 - Preact JSX transform for Vite
- `@electron-forge/plugin-vite` ^7.6.0 - Integrates Vite into Forge pipeline
- `@electron/fuses` ^1.8.0 - Security fuse configuration

**Linting/Formatting:**
- ESLint ^8.57.1 with `@typescript-eslint` ^5.62.0 - Config at `.eslintrc.json`
- Prettier ^3.4.2 with `prettier-plugin-organize-imports` - Config at `prettier.config.js`

**Testing:**
- No test framework configured

## Key Dependencies

**Critical (core functionality):**
- `hls.js` ^1.5.18 - HLS `.m3u8` livestream playback in `packages/streamwall/src/renderer/playHLS.ts`
- `ws` ^7.5.10 - WebSocket client for Streamdelay integration (Node.js side)
- `reconnecting-websocket` ^4.4.0 - Auto-reconnecting WebSocket wrapper used by `StreamdelayClient` and control UI
- `@repeaterjs/repeater` ^3.0.6 - Async iterator combinators for data pipeline in `packages/streamwall/src/main/data.ts`
- `chokidar` ^4.0.3 - File watching for TOML data sources in `packages/streamwall/src/main/data.ts`
- `yargs` (transitive/bundled) - CLI argument parsing in main process

**UI:**
- `styled-components` ^6.1.13 - CSS-in-JS for renderer components
- `tailwindcss` ^4.2.1 with `@tailwindcss/postcss` and `@tailwindcss/vite` - Utility CSS (Tailwind v4)
- `react-hotkeys-hook` ^4.6.1 - Keyboard shortcut handling in control UI
- `react-icons` ^5.4.0 - Icon library
- `svg-loaders-react` ^3.1.1 - Loading spinner SVGs
- `@fontsource/noto-sans` ^5.1.1 - Self-hosted font
- `luxon` ^3.5.0 - Date/time formatting (control UI only)
- `jsondiffpatch` ^0.6.0 - JSON diffing (control UI only)

**Infrastructure:**
- `@iarna/toml` ^2.2.5 - TOML parsing for config files and data sources
- `node-fetch` ^3.3.2 - HTTP fetching for JSON data source polling
- `color` ^5.0.0 - Color manipulation for stream borders/labels
- `lodash-es` ^4.17.21 - Utility functions
- `source-map-support` ^0.5.21 - Source map support in main process
- `update-electron-app` ^3.1.1 - Auto-update for packaged builds
- `electron-squirrel-startup` ^1.0.1 - Windows installer shortcut handling
- `esbuild-register` ^3.6.0 - TypeScript loader for Forge config
- `bufferutil` ^4.0.9 / `utf-8-validate` ^5.0.10 - Native WebSocket performance addons

## Monorepo Structure

**Workspace layout (npm workspaces):**
- `packages/streamwall` - Main Electron app
- `packages/streamwall-shared` - Shared types, geometry helpers (`"main": "./src/index.ts"`)
- `packages/streamwall-control-ui` - Preact control panel UI component library (`"main": "./src/index.tsx"`)

Cross-package references use workspace `"*"` version specifiers and Vite `resolve.alias` for dev watching.

## Configuration

**App Configuration:**
- CLI arguments via `yargs` with TOML config file support (`--config` flag)
- Config sections: `grid`, `window`, `data`, `streamdelay`
- No `.env` files used; all config via CLI/TOML
- See `packages/streamwall/src/main/index.ts` `parseArgs()` for full option list

**Build Configuration:**
- `packages/streamwall/forge.config.ts` - Electron Forge config (makers, plugins, fuses)
- `packages/streamwall/vite.main.config.ts` - Vite config for main process
- `packages/streamwall/vite.preload.config.ts` - Vite config for preload scripts
- `packages/streamwall/vite.renderer.config.ts` - Vite config for renderer (multi-page: background, overlay, playHLS, control)
- `packages/streamwall/tsconfig.json` - TypeScript config (JSX via Preact, react/react-dom path aliases)
- `.eslintrc.json` - ESLint config (root)
- `prettier.config.js` - Prettier config (root): no semicolons, single quotes, trailing commas, organize-imports plugin

**Vite Multi-Page Renderer Build:**
Renderer has four HTML entry points configured in `vite.renderer.config.ts`:
- `src/renderer/background.html` - Background iframe streams
- `src/renderer/overlay.html` - Stream labels, borders, spinners
- `src/renderer/playHLS.html` - HLS video playback
- `src/renderer/control.html` - Operator control panel

## Platform Requirements

**Development:**
- Node.js (version not pinned; no `.nvmrc` in project root)
- npm (workspaces support required, npm 7+)
- Native build tools for `bufferutil`/`utf-8-validate` (node-gyp)

**Production/Distribution:**
- Windows: Squirrel installer (`@electron-forge/maker-squirrel`)
- macOS: ZIP archive (`@electron-forge/maker-zip` for `darwin`)
- Linux: DEB and RPM packages (`@electron-forge/maker-deb`, `@electron-forge/maker-rpm`)
- Publishing: GitHub Releases via `@electron-forge/publisher-github` (repo: `streamwall/streamwall`, prerelease: true)
- Auto-updates: `update-electron-app` (GitHub Releases backend, packaged builds only)

**Electron Security Fuses (enabled):**
- `RunAsNode`: disabled
- `CookieEncryption`: enabled
- `NodeOptions` env var: disabled
- `NodeCliInspectArguments`: disabled
- `EmbeddedAsarIntegrityValidation`: disabled
- `OnlyLoadAppFromAsar`: disabled

---

*Stack analysis: 2026-03-05*
