# Codebase Concerns

**Analysis Date:** 2026-03-05

## Tech Debt

**Massive Single-File Control UI (1560 lines):**
- Issue: `packages/streamwall-control-ui/src/index.tsx` is a 1560-line monolith containing all control panel components, hooks, state management, WebSocket connection logic, and styled components in a single file.
- Files: `packages/streamwall-control-ui/src/index.tsx`
- Impact: Difficult to navigate, test individual components, or modify isolated functionality without risk of side effects. New contributors face a steep learning curve.
- Fix approach: Extract into separate files: connection hooks (`useStreamwallState`, `useYDoc`, `useStreamwallWebsocketConnection`), UI components (`GridInput`, `GridControls`, `StreamLine`, `CustomStreamInput`, `StreamDelayBox`), and utility functions (`filterStreams`).

**Commented-Out Web Control Server:**
- Issue: Large blocks of commented-out code for a web control server remain in `packages/streamwall/src/main/index.ts` (lines 118-168, 322-334, 388-410). These reference features like SSL certificates, authentication tokens, and invite creation that are not implemented in v2.
- Files: `packages/streamwall/src/main/index.ts`
- Impact: Code noise; ControlCommand type in `packages/streamwall-shared/src/types.ts` (lines 101-102) still defines `create-invite` and `delete-token` command types that have no handler, misleading developers.
- Fix approach: Remove commented-out code. Remove unused ControlCommand variants. Track desired web control server feature in an issue instead.

**TypeScript Version Mismatch Across Packages:**
- Issue: `packages/streamwall` uses TypeScript ~4.5.4, while `packages/streamwall-shared` and `packages/streamwall-control-ui` use ~5.6.2. This is a major version gap (4.x vs 5.x).
- Files: `packages/streamwall/package.json` (line 38), `packages/streamwall-shared/package.json` (line 12), `packages/streamwall-control-ui/package.json` (line 24)
- Impact: Different type-checking behavior across packages. Features available in TS 5.x (satisfies, const type params, decorators) cannot be used in the main Electron package. Could cause subtle type incompatibilities at package boundaries.
- Fix approach: Upgrade `packages/streamwall` to TypeScript ~5.6.2 to match the other packages. Update tsconfig if needed.

**No Runtime Data Validation:**
- Issue: External data (JSON URLs, TOML files, WebSocket messages) is consumed without runtime validation. Two TODO comments explicitly call this out: "TODO: type validate with Zod" in `packages/streamwall/src/main/data.ts` (line 50) and "TODO: validate using zod" in `packages/streamwall-control-ui/src/index.tsx` (line 111). Data is cast with `as unknown as StreamList` and `as T`.
- Files: `packages/streamwall/src/main/data.ts` (lines 51, 22), `packages/streamwall-control-ui/src/index.tsx` (line 112), `packages/streamwall/src/main/StreamdelayClient.ts` (line 48)
- Impact: Malformed data from external sources silently propagates through the system, causing hard-to-debug crashes or incorrect behavior downstream.
- Fix approach: Add Zod schemas for `StreamData`, `StreamwallState`, and Streamdelay messages. Validate at ingestion boundaries: `pollDataURL`, `watchDataFile`, `StreamdelayClient.connect`, and `useYDoc`.

**IPC Handlers Registered in Constructor (Singleton Pattern Not Enforced):**
- Issue: `StreamWindow` and `ControlWindow` register global `ipcMain.handle` and `ipcMain.on` handlers in their constructors. If either class were instantiated more than once, it would throw "Attempted to register a second handler" errors for `handle` calls or create duplicate listeners for `on` calls.
- Files: `packages/streamwall/src/main/StreamWindow.ts` (lines 113-145), `packages/streamwall/src/main/ControlWindow.ts` (lines 35-58)
- Impact: Currently not a problem because only one instance is created, but the code is fragile. Any future refactor that creates multiple instances would break.
- Fix approach: Either enforce singleton pattern, move IPC registration to a separate init function, or use channel namespacing with instance IDs.

**Deprecated `url.resolve` Usage:**
- Issue: `StreamdelayClient` uses `url.resolve()` which is deprecated in Node.js in favor of `new URL()`.
- Files: `packages/streamwall/src/main/StreamdelayClient.ts` (line 28)
- Impact: Will eventually be removed from Node.js. Minor functional risk: `url.resolve` has known edge cases with certain URL patterns.
- Fix approach: Replace with `new URL(path, base)` constructor.

**Deprecated `String.prototype.substr` Usage:**
- Issue: `StreamIDGenerator.process` uses `substr()` which is deprecated.
- Files: `packages/streamwall/src/main/data.ts` (line 148)
- Impact: Minor; `substr` works but is not part of the ES specification (Annex B only).
- Fix approach: Replace `normalizedText.substr(0, 3)` with `normalizedText.substring(0, 3)`.

## Known Bugs

**Grid Preview Truthiness Bug:**
- Symptoms: Grid preview boxes may fail to render for valid streams due to incorrect boolean logic.
- Files: `packages/streamwall-control-ui/src/index.tsx` (line 753)
- Trigger: The condition `!data == null` is always false because `!data` evaluates to a boolean, and a boolean is never `== null`. The intended check was likely `data == null`.
- Workaround: None; this causes some grid preview boxes to not render.

## Security Considerations

**executeJavaScript in Preload Script:**
- Risk: `webFrame.executeJavaScript()` runs arbitrary JavaScript strings in the renderer context. While this is used legitimately to lock down media tags, the pattern of building JS strings is error-prone.
- Files: `packages/streamwall/src/preload/mediaPreload.ts` (lines 108-119)
- Current mitigation: The script is hardcoded (not user-supplied), and views have `contextIsolation: true` and `nodeIntegration: false`.
- Recommendations: Consider using `webFrame.executeJavaScript` with a static module or converting the media lockdown to a content script injected via `webContents.executeJavaScriptInIsolatedWorld`.

**Streamdelay API Key in WebSocket URL:**
- Risk: The Streamdelay API key is passed as a query parameter in the WebSocket URL (`ws?key=${this.key}`), which may be logged in server access logs, proxy logs, or browser history.
- Files: `packages/streamwall/src/main/StreamdelayClient.ts` (lines 28-31)
- Current mitigation: None.
- Recommendations: Pass the key as a WebSocket subprotocol or in the first message after connection. This depends on the Streamdelay server's API.

**Electron Fuses: ASAR Integrity and OnlyLoadAppFromAsar Disabled:**
- Risk: `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` are both set to `false`, weakening protections against tampering with the packaged app.
- Files: `packages/streamwall/forge.config.ts` (lines 72-73)
- Current mitigation: The app rejects all permission requests from web content (`setPermissionRequestHandler` in `packages/streamwall/src/main/index.ts` line 192). Navigation is prevented in stream views (line 165 of StreamWindow.ts).
- Recommendations: Enable ASAR integrity validation and `OnlyLoadAppFromAsar` for production builds. These were likely disabled to work around development issues.

**IPC Command Dispatch Lacks Type Validation:**
- Risk: `ControlWindow` forwards IPC commands from the renderer to the main process without validating the `command` payload structure. A compromised renderer could send arbitrary command objects.
- Files: `packages/streamwall/src/main/ControlWindow.ts` (line 46), `packages/streamwall/src/main/index.ts` (lines 254-335)
- Current mitigation: The control window preload script limits the API surface. Sender verification exists (checks `ev.sender`).
- Recommendations: Validate incoming commands against the `ControlCommand` type union at runtime using a schema validator.

**backgroundView Missing contextIsolation:**
- Risk: The `backgroundView` WebContentsView is created without explicitly setting `contextIsolation: true` (only the overlay sets it explicitly).
- Files: `packages/streamwall/src/main/StreamWindow.ts` (lines 80-84)
- Current mitigation: Electron defaults `contextIsolation` to `true` since Electron 12, so this is likely safe in practice.
- Recommendations: Set `contextIsolation: true` explicitly for consistency and defense in depth.

## Performance Bottlenecks

**Linear Stream Lookups:**
- Problem: Multiple places search for streams by ID or URL using `Array.find()` inside loops or render cycles.
- Files: `packages/streamwall/src/main/index.ts` (line 239), `packages/streamwall/src/renderer/overlay.tsx` (line 48), `packages/streamwall-control-ui/src/index.tsx` (lines 458, 511, 526, 752)
- Cause: Streams are stored as arrays. While `StreamList.byURL` provides URL-indexed lookup, there is no equivalent index by `_id`.
- Improvement path: Add a `byId` index to `StreamList` (like `byURL`), or convert to a `Map<string, StreamData>` keyed by `_id`. This matters when grid count or stream count is large.

**Full State Broadcast on Every View Change:**
- Problem: Every view state machine snapshot change triggers `emitState()` which serializes all view states and sends the full array to the overlay, background, and control window renderers.
- Files: `packages/streamwall/src/main/StreamWindow.ts` (lines 179-184, 192-206, 344-346)
- Cause: No delta/diff mechanism for view state updates (unlike Yjs which handles view-to-stream assignment efficiently).
- Improvement path: Use `jsondiffpatch` (already a dependency in `streamwall-control-ui`) to send delta updates, or batch state emissions with a debounce.

## Fragile Areas

**Media Preload Script (Site-Specific Hacks):**
- Files: `packages/streamwall/src/preload/mediaPreload.ts`
- Why fragile: Contains site-specific hacks (Instagram play button detection at line 169, Facebook pause prevention at line 116) and DOM mutation observers that depend on specific page structures. Any change to these sites' DOM will break video detection.
- Safe modification: Test against live streams from the affected platforms. The 10-second timeout (line 153, 221) provides a fallback but results in broken views.
- Test coverage: None. No test suite exists.

**View Matching Logic in StreamWindow.setViews:**
- Files: `packages/streamwall/src/main/StreamWindow.ts` (lines 208-293)
- Why fragile: Complex three-pass matching algorithm that tries to reuse existing views when the grid layout changes. Depends on correct equality checks between `ViewContent` objects and position arrays. The logic creates new views for unmatched boxes but only removes unused views afterward, creating potential timing windows.
- Safe modification: Ensure any changes preserve the invariant that every view in `this.views` has a unique `id` and is added to exactly one window's contentView. Log view transitions during development.
- Test coverage: None.

**StreamIDGenerator Collision Handling:**
- Files: `packages/streamwall/src/main/data.ts` (lines 120-163)
- Why fragile: IDs are generated from a 3-character prefix of normalized stream names. With many streams from similar sources, the counter suffix grows but the 3-char prefix provides minimal uniqueness. The `idMap` and `idSet` grow indefinitely (never cleaned up for removed streams), causing a memory leak over long sessions.
- Safe modification: Ensure the `link` property used as the map key is stable across data refreshes.
- Test coverage: None.

## Scaling Limits

**Grid Count Quadratic Growth:**
- Current capacity: Grid count of 3 = 9 views. Grid count of 5 = 25 views.
- Limit: Each view is a separate Chromium WebContentsView loading a full webpage. At ~50-150MB per view, a 5x5 grid could use 1.25-3.75GB of RAM just for stream views, plus the overlay and background views.
- Scaling path: Consider lazy-loading views (only create WebContentsView when a stream is assigned), or use a single WebContentsView with canvas-based compositing for preview-only slots.

**Data Source Polling:**
- Current capacity: JSON URLs are polled at a configurable interval (default 30s).
- Limit: No backoff on repeated failures. `pollDataURL` in `packages/streamwall/src/main/data.ts` (lines 15-37) logs a warning but retries at the same interval. With many JSON URLs, this creates steady network traffic.
- Scaling path: Add exponential backoff on failures. Consider WebSocket or SSE for real-time data sources.

## Dependencies at Risk

**ws@7.x:**
- Risk: `ws` is pinned to ^7.5.10. The current major version is 8.x. Version 7 no longer receives patches.
- Impact: Missing security fixes and performance improvements.
- Migration plan: Upgrade to `ws@^8.x`. Breaking changes are minimal (mainly around `WebSocket.Server` options).

**ESLint 8 + @typescript-eslint 5:**
- Risk: ESLint 8 is in maintenance mode. @typescript-eslint 5 is outdated (current is 8.x). The ecosystem is migrating to ESLint 9 flat config.
- Impact: Missing new lint rules and TypeScript support improvements.
- Migration plan: Migrate to ESLint 9 with `@typescript-eslint/eslint-plugin@^8` and flat config format.

**Vite Plugin Type Workaround:**
- Risk: `vite.renderer.config.ts` (line 34-36) has a FIXME comment working around a TypeScript error by casting Preact plugins with `as Plugin[]`.
- Files: `packages/streamwall/vite.renderer.config.ts` (lines 33-36)
- Impact: Type safety is bypassed. Plugin API changes could silently break the build.
- Migration plan: Resolve the underlying type incompatibility, likely by upgrading `@preact/preset-vite` or adjusting the Vite plugin types.

## Missing Critical Features

**No Test Suite:**
- Problem: There are zero tests in the entire codebase. No test framework is configured. No test scripts in any `package.json`.
- Blocks: Confident refactoring, regression detection, CI/CD quality gates. The CLAUDE.md explicitly states "There is no test suite configured."

**No Error Recovery for Stream Views:**
- Problem: When a view enters the `error` state in the state machine (`packages/streamwall/src/main/viewStateMachine.ts` line 322), there is no automatic retry. The view stays in the error state until manually reloaded by the operator.
- Blocks: Unattended operation. If a stream page temporarily errors (network hiccup), it requires manual intervention.

**No Graceful Shutdown:**
- Problem: `process.exit(0)` is called directly when the stream window closes (`packages/streamwall/src/main/index.ts` line 373). No cleanup of WebSocket connections, file watchers, or Yjs documents.
- Blocks: Clean resource release. Could cause data loss in future collaborative editing scenarios.

## Test Coverage Gaps

**Entire Codebase Untested:**
- What's not tested: All functionality -- view state machine transitions, grid geometry calculations, data pipeline merging, stream ID generation, IPC communication, overlay rendering, control UI interactions.
- Files: All source files under `packages/`
- Risk: Any code change can introduce regressions that go unnoticed until manual testing. The view matching algorithm in `StreamWindow.setViews` and the box-merging algorithm in `packages/streamwall-shared/src/geometry.ts` are particularly high-value targets for unit tests.
- Priority: High. Start with pure functions: `boxesFromViewContentMap`, `idxInBox`, `idxToCoords` in `packages/streamwall-shared/src/geometry.ts`, `StreamIDGenerator.process` in `packages/streamwall/src/main/data.ts`, and `filterStreams` in `packages/streamwall-control-ui/src/index.tsx`.

---

*Concerns audit: 2026-03-05*
