# Coding Conventions

**Analysis Date:** 2026-03-05

## Naming Patterns

**Files:**
- Use `PascalCase` for class-based modules: `StreamWindow.ts`, `ControlWindow.ts`, `StreamdelayClient.ts`
- Use `camelCase` for utility/functional modules: `viewStateMachine.ts`, `loadHTML.ts`, `data.ts`
- Use `camelCase` for renderer entry points: `overlay.tsx`, `background.tsx`, `control.tsx`, `playHLS.ts`
- Use `camelCase` + `Preload` suffix for preload scripts: `controlPreload.ts`, `layerPreload.ts`, `mediaPreload.ts`
- Shared package uses `camelCase` for all files: `types.ts`, `geometry.ts`, `colors.ts`, `roles.ts`

**Functions:**
- Use `camelCase` for all functions: `parseArgs()`, `ensureValidURL()`, `boxesFromViewContentMap()`, `idxToCoords()`
- Prefix internal/private methods with underscore: `_emitUpdate()`, `_update()`
- Use `handle` prefix for IPC/event handlers inline: `handleState`, `handleUpdate`
- Use `on` prefix for class event handler methods: `onState()`, `onYDocUpdate()`, `onCommand()`

**Variables:**
- Use `camelCase` for all variables: `streamWindow`, `controlWindow`, `clientState`, `viewContentMap`
- Use `UPPER_SNAKE_CASE` for constants: `SCAN_THROTTLE`, `VIDEO_OVERRIDE_STYLE`, `NO_SCROLL_STYLE`

**Types:**
- Use `PascalCase` for interfaces and types: `StreamwallState`, `ViewContent`, `ContentKind`, `StreamWindowConfig`
- Use `PascalCase` for type aliases: `ViewActor`, `DataSource`, `StreamList`
- Suffix event map interfaces with `EventMap`: `StreamWindowEventMap`, `ControlWindowEventMap`
- Suffix options interfaces with `Options` or `Config`: `StreamdelayClientOptions`, `StreamwallConfig`, `StreamWindowConfig`
- Use discriminated unions for command types with `type` field: `ControlCommand` in `packages/streamwall-shared/src/types.ts`

**Enums:**
- Use `const` arrays with `as const` instead of TypeScript enums: `validRoles`, `adminActions`, `operatorActions` in `packages/streamwall-shared/src/roles.ts`
- Derive types from const arrays: `type StreamwallRole = (typeof validRoles)[number]`

## Code Style

**Formatting:**
- Prettier configured in `prettier.config.js`
- No semicolons (`semi: false`)
- Single quotes (`singleQuote: true`)
- Trailing commas everywhere (`trailingComma: 'all'`)
- 2-space indentation (`tabWidth: 2`)
- Plugin: `prettier-plugin-organize-imports` auto-sorts imports

**Linting:**
- ESLint configured in `.eslintrc.json`
- Extends: `eslint:recommended`, `@typescript-eslint/recommended`, `plugin:import/recommended`, `plugin:import/electron`, `plugin:import/typescript`
- Parser: `@typescript-eslint/parser`
- Run via: `npm -w streamwall run lint`

## Import Organization

Imports are auto-sorted by `prettier-plugin-organize-imports`. The observed order is:

**Order:**
1. External packages (alphabetical): `assert`, `electron`, `events`, `lodash-es`, `preact`, `xstate`, `yjs`
2. Workspace packages: `streamwall-shared`, `streamwall-control-ui`
3. Relative imports: `../util`, `./data`, `./StreamWindow`

**Path Aliases:**
- `react` aliased to `preact/compat` in all three `tsconfig.json` files
- `react-dom` aliased to `preact/compat` in all three `tsconfig.json` files
- Vite config also maps `react`/`react-dom` to `preact/compat` for bundling

**Import Style:**
- Use named imports: `import { BrowserWindow, app, session } from 'electron'`
- Use `import * as` for namespace imports: `import * as Y from 'yjs'`, `import * as url from 'url'`
- Use default imports for classes/modules: `import StreamWindow from './StreamWindow'`
- Use side-effect imports for CSS/fonts: `import '@fontsource/noto-sans'`, `import './index.css'`

**Cross-package imports:**
- Prefer importing from the package name: `import { StreamwallState } from 'streamwall-shared'`
- Some files use direct path imports (legacy): `import { StreamData } from '../../../streamwall-shared/src/types'` in `packages/streamwall/src/renderer/background.tsx` and `packages/streamwall/src/main/data.ts`
- Some files mix lodash import styles: `lodash-es` (ESM) vs `lodash/throttle` (CJS) -- see `packages/streamwall/src/main/StreamWindow.ts` vs `packages/streamwall/src/preload/mediaPreload.ts`

## Error Handling

**Patterns:**
- Use `try/catch` blocks for recoverable operations (URL parsing, data fetching, JSON parsing)
- Log errors with `console.error()` or `console.warn()` and continue operation:
  ```typescript
  // packages/streamwall/src/main/data.ts
  try {
    const resp = await fetch(url)
    data = (await resp.json()) as StreamData[]
  } catch (err) {
    console.warn('error loading stream data', err)
  }
  ```
- Use `assert()` from Node.js `assert` module for invariants (programmer errors):
  ```typescript
  // packages/streamwall/src/main/StreamdelayClient.ts
  assert(this.ws != null, 'Must be connected')
  ```
- Use `throw new Error()` for validation failures:
  ```typescript
  // packages/streamwall/src/util.ts
  throw new Error(`rejecting attempt to load non-http URL '${urlStr}'`)
  ```
- Top-level async entry points use `.catch()` to exit:
  ```typescript
  // packages/streamwall/src/main/index.ts
  app.whenReady().then(() => main(argv)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
  ```
- Preload scripts use `.catch()` to report errors via IPC:
  ```typescript
  // packages/streamwall/src/preload/mediaPreload.ts
  main().catch((error) => {
    ipcRenderer.send('view-error', { error })
  })
  ```

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- Use `console.debug()` for operational flow tracing in main process: `console.debug('Creating StreamWindow...')`
- Use `console.warn()` for non-fatal errors: `console.warn('error loading stream data', err)`
- Use `console.error()` for fatal/critical errors: `console.error('Invalid URL:', msg.url)`
- Use `console.log()` in preload scripts for media detection: `console.log('video started')`
- Include context in log messages: `console.debug('Setting listening view:', msg.viewIdx)`

## Comments

**When to Comment:**
- Use comments for workaround explanations referencing issues: `// Work around https://github.com/electron/electron/issues/14308`
- Use comments for TODO items with context: `// TODO: validate using zod`, `// TODO: Move to control server`
- Use comments for inline explanations of non-obvious behavior: `// Prevent sites from re-muting the video`
- Use comments for code section headers: `// Wire up IPC:`
- Use block comments (`/* */`) for large sections of commented-out code (future features)

**JSDoc/TSDoc:**
- Minimal usage. Only one JSDoc comment found in the codebase:
  ```typescript
  // packages/streamwall-shared/src/geometry.ts
  /** Grid space indexes inhabited by the view. */
  spaces: number[]
  ```
- Do not add JSDoc unless documenting a particularly non-obvious interface field

## Function Design

**Size:**
- Most functions are small (5-30 lines)
- Larger functions exist for complex orchestration: `main()` in `packages/streamwall/src/main/index.ts` (~250 lines), `setViews()` in `packages/streamwall/src/main/StreamWindow.ts` (~85 lines)
- The control UI is one large file (~1200 lines) with many small function components

**Parameters:**
- Use destructuring for options objects: `({ endpoint, key }: StreamdelayClientOptions)`
- Use inline object types for XState machine inputs/params
- Use `Partial<T>` for update operations: `update(url: string, data: Partial<StreamData>)`

**Return Values:**
- Use explicit return types on public APIs and exported functions
- Omit return types on internal/private functions and callbacks
- Use `satisfies` for type-checked object literals: `} satisfies ViewState`

## Module Design

**Exports:**
- Use `export default class` for main class modules: `StreamWindow`, `ControlWindow`, `StreamdelayClient`
- Use `export default` for XState machines: `viewStateMachine`
- Use named exports for utility functions and types: `export function ensureValidURL()`, `export interface ViewContent`
- Use barrel file for shared package: `packages/streamwall-shared/src/index.ts` re-exports everything

**Barrel Files:**
- Only `packages/streamwall-shared/src/index.ts` acts as a barrel: `export * from './colors'` etc.
- Other packages do not use barrel files

## Component Patterns (Preact)

**Renderer Pages:**
- Each renderer page has a standalone `App` component that manages its own state via `useState`
- Mount directly to `document.body`: `render(<App />, document.body)`
- Use `useEffect` with cleanup for IPC subscriptions:
  ```typescript
  useEffect(() => {
    const unsubscribe = window.streamwallLayer.onState(setState)
    window.streamwallLayer.load()
    return unsubscribe
  }, [])
  ```

**Styled Components:**
- Use `styled-components` for CSS-in-JS in overlay and background renderers
- Use tagged template literals with interpolated props
- Use Tailwind CSS (v4) in control renderer via `@tailwindcss/vite` plugin

**Preact-specific:**
- Import hooks from `preact/hooks`, not `react`
- Import JSX type from `preact`: `import { JSX } from 'preact'`
- Use `react-hotkeys-hook` and `react-icons` via preact/compat alias

## IPC Conventions

**Channel Naming:**
- Use `namespace:action` format: `control:load`, `control:command`, `control:ydoc`, `layer:load`
- Use `view-action` format for media view channels: `view-init`, `view-loaded`, `view-info`, `view-error`
- Use bare names for broadcast channels: `state`, `ydoc`, `options`

**Preload API Pattern:**
- Define API object with typed methods
- Export the type: `export type StreamwallControlGlobal = typeof api`
- Expose via `contextBridge.exposeInMainWorld()`
- Declare global Window interface in renderer:
  ```typescript
  declare global {
    interface Window {
      streamwallControl: StreamwallControlGlobal
    }
  }
  ```
- Use `ipcRenderer.invoke()` for request/response, `ipcRenderer.send()` for fire-and-forget
- Use `ipcRenderer.on()` with cleanup function pattern for subscriptions

## Class Patterns

**Event Emitters:**
- Extend `EventEmitter` with typed event map generic: `class StreamWindow extends EventEmitter<StreamWindowEventMap>`
- Define event maps as interfaces: `interface StreamWindowEventMap { load: []; close: []; state: [ViewState[]] }`
- Use `this.emit()` and `this.on()` for internal event propagation

**State Machines (XState v5):**
- Use `setup().createMachine()` pattern in `packages/streamwall/src/main/viewStateMachine.ts`
- Define types inline in `setup({ types: { ... } })`
- Use UPPER_SNAKE_CASE for event type strings: `'VIEW_INIT'`, `'DISPLAY'`, `'MUTE'`
- Use `createActor()` and `actor.start()` to instantiate
- Use `actor.getSnapshot()` to read current state
- Use `actor.send()` to dispatch events
- Use `actor.subscribe()` for state change notifications

---

*Convention analysis: 2026-03-05*
