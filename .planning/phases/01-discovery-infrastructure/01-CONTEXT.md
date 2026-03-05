# Phase 1: Discovery Infrastructure - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The discovery system's backbone: provider interface (BaseProvider abstract class), DiscoveryManager orchestrator, settings persistence (electron-store), IPC channels, rate limiting, and data pipeline integration. No platform implementations yet -- those are Phase 2. This phase delivers the infrastructure that makes adding platform providers a matter of subclassing BaseProvider.

</domain>

<decisions>
## Implementation Decisions

### Settings Persistence
- Use `electron-store` for discovery settings (API keys, intervals, filters)
- Existing CLI/TOML config remains for grid, window, and data source config -- no migration
- API key credentials encrypted via Electron's `safeStorage` (OS keychain: DPAPI on Windows, Keychain on macOS, libsecret on Linux)
- Settings accessible only via IPC through main process -- renderer stays sandboxed
- Settings changes take effect immediately (hot reload) -- no Apply button
- Ship with sensible defaults: 60s discovery interval, 30s liveness check
- Observable store: use electron-store's `onDidChange` so DiscoveryManager reacts to settings changes live
- "Reset all to defaults" action available in settings
- Versioned migrations via electron-store's built-in migration support
- API keys stored as-is without validation on save -- validation happens naturally when provider uses the key
- Define `DiscoverySettings` type in `streamwall-shared` package for type sharing across main/renderer

### Worker Architecture
- Use Electron's `utilityProcess` for discovery polling -- full process isolation, crash doesn't affect main
- Single utility process runs all providers (not one per platform)
- Communication via `MessagePort` with `postMessage` -- serialized stream arrays
- Auto-restart with exponential backoff (1s, 2s, 4s) on crash, cap at 5 retries then surface error to UI
- Main process sends settings to utility process via MessagePort -- utility process has no direct disk/store access
- Per-provider health/status reporting to control panel UI (running/paused/error states)
- Utility process fetches thumbnail URLs alongside stream metadata -- renderer loads images directly from URL
- Start utility process immediately on app launch
- Console-only logging (stdout/stderr) -- no file logging
- Restart sufficient for dev -- no HMR for utility process
- Build as Vite entry point in `vite.main.config.ts` alongside main process entry (`src/main/discovery-worker.ts`)

### Provider Interface Design
- Abstract class pattern: `BaseProvider` with `init()`, `search()`, `destroy()` lifecycle
- Shared logic in base class: rate limiter, error handling
- Separate `DiscoveredStream` type (not extending StreamData): platform, title, channelName, url, thumbnailUrl, viewerCount, language, tags, startedAt
- Rate limiting owned by base class -- provider declares limits (maxRequests, windowMs), base class enforces
- Keyword search only for Phase 1 -- additional modes (trending, categories) can be added later
- Typed error reporting: `ProviderResult` with `{ streams, error?: { type, message, retryAfter } }` -- error types: auth_failed, rate_limited, network_error, unavailable
- Static imports for provider registration -- DiscoveryManager imports all providers at build time
- Capability flags on providers: `requiresCredentials`, `supportsLanguageFilter`, `isExperimental`
- Providers handle pagination internally -- return a page of results, manager can request more via cursor
- Providers accept raw config without upfront validation

### File Organization
- `src/main/discovery/` directory structure:
  - `base.ts` -- BaseProvider abstract class
  - `manager.ts` -- DiscoveryManager
  - `types.ts` -- DiscoveredStream, ProviderResult, ProviderError
  - `rate-limiter.ts` -- RateLimiter utility
  - `providers/` -- one file per platform (youtube.ts, twitch.ts, kick.ts, etc.)

### Pipeline Integration
- One merged async generator from DiscoveryManager (all platforms combined) -- single data source in `combineDataSources`
- Mapping from DiscoveredStream to StreamData happens in main process (mapper function), not utility process
- Discovery streams marked via `_dataSource: 'discovery:{platform}'` for UI differentiation
- Extend StreamData with optional fields: `thumbnailUrl?`, `viewerCount?`, `platform?`, `channelName?`
- Use Repeater pattern (matching LocalStreamData.gen()) for the main-process bridge that receives MessagePort messages
- Separate liveness checker with independent interval (default 30s) -- distinct from discovery polling
- Pause/resume support: main process can pause discovery without stopping the utility process

### Claude's Discretion
- Import/export of settings (likely defer to keep Phase 1 simple)
- Exact rate limiter implementation (token bucket, sliding window, etc.)
- Thumbnail caching strategy (LRU eviction per INFR-04)
- Exact MessagePort message protocol/schema

</decisions>

<specifics>
## Specific Ideas

- Discovery bridge should follow the exact Repeater pattern from LocalStreamData.gen() -- push updates when messages arrive from utility process
- Mapper function signature: `toStreamData(d: DiscoveredStream): StreamData` with `_dataSource: 'discovery:${d.platform}'`
- Provider file layout mirrors the preview: base.ts, manager.ts, types.ts, rate-limiter.ts, providers/

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `combineDataSources` (data.ts): Async generator combiner using Repeater.latest -- discovery plugs in as another data source
- `LocalStreamData` (data.ts): EventEmitter + Repeater pattern -- model for the discovery bridge
- `markDataSource` (data.ts): Tags streams with `_dataSource` -- use same pattern for discovery origin tracking
- `StreamIDGenerator` (data.ts): Generates stable IDs from stream link/source/label -- will process discovered streams too
- `StreamData` type (streamwall-shared): Core stream type, will be extended with optional discovery fields
- `ControlCommand` union type: Pattern for typed IPC commands -- extend for discovery commands

### Established Patterns
- Async generators + `@repeaterjs/repeater` for data pipeline -- all data sources are async generators
- IPC via preload scripts with contextBridge -- three preload scripts (layerPreload, mediaPreload, controlPreload)
- Yjs CRDT for view state -- discovery doesn't need to interact with this directly
- yargs + TOML for CLI config -- discovery uses electron-store instead (separate concern)
- EventEmitter for internal communication (LocalStreamData, StreamdelayClient)

### Integration Points
- `main/index.ts:412-423`: dataSources array where discovery generator gets added
- `main/index.ts:425-429`: `for await` loop processing streams -- discovery streams flow through here
- `streamwall-shared/types.ts:25-35`: StreamData interface to extend with discovery fields
- `streamwall-shared/types.ts:85-102`: ControlCommand union type to extend with discovery commands
- `forge.config.ts`: Build config for adding utility process Vite entry point

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 01-discovery-infrastructure*
*Context gathered: 2026-03-05*
