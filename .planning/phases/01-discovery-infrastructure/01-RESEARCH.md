# Phase 1: Discovery Infrastructure - Research

**Researched:** 2026-03-05
**Domain:** Electron utility process, settings persistence, async data pipeline, provider abstraction
**Confidence:** HIGH

## Summary

Phase 1 builds the discovery backbone: a `BaseProvider` abstract class, `DiscoveryManager` orchestrator, `electron-store` settings persistence with `safeStorage` encryption for API keys, a utility process for off-main-thread polling, rate limiting infrastructure, and integration into the existing `combineDataSources` async generator pipeline.

The existing codebase provides strong patterns to follow. The `LocalStreamData` class (EventEmitter + Repeater) is the direct model for the discovery bridge that receives messages from the utility process. The `combineDataSources` function accepts any `AsyncGenerator<StreamData[]>`, so the discovery output simply becomes another entry in the `dataSources` array. The `markDataSource` pattern handles origin tracking. Electron 33.2.1 has mature `utilityProcess` and `safeStorage` APIs.

**Primary recommendation:** Build the utility process as a separate Vite entry point in `forge.config.ts`, use `MessagePort` for bidirectional communication, wrap incoming messages in a `Repeater` (mirroring `LocalStreamData.gen()`), and use `electron-store` with `safeStorage` for credential encryption. Hand-roll a simple token bucket rate limiter (~50 lines) rather than pulling in a Redis-dependent npm package.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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
- Abstract class pattern: `BaseProvider` with `init()`, `search()`, `destroy()` lifecycle
- Shared logic in base class: rate limiter, error handling
- Separate `DiscoveredStream` type (not extending StreamData): platform, title, channelName, url, thumbnailUrl, viewerCount, language, tags, startedAt
- Rate limiting owned by base class -- provider declares limits (maxRequests, windowMs), base class enforces
- Keyword search only for Phase 1
- Typed error reporting: `ProviderResult` with `{ streams, error?: { type, message, retryAfter } }`
- Static imports for provider registration
- Capability flags on providers: `requiresCredentials`, `supportsLanguageFilter`, `isExperimental`
- Providers handle pagination internally
- Providers accept raw config without upfront validation
- File organization: `src/main/discovery/` with base.ts, manager.ts, types.ts, rate-limiter.ts, providers/
- One merged async generator from DiscoveryManager (all platforms combined)
- Mapping from DiscoveredStream to StreamData happens in main process (mapper function)
- Discovery streams marked via `_dataSource: 'discovery:{platform}'`
- Extend StreamData with optional fields: `thumbnailUrl?`, `viewerCount?`, `platform?`, `channelName?`
- Use Repeater pattern (matching LocalStreamData.gen()) for the main-process bridge
- Separate liveness checker with independent interval (default 30s)
- Pause/resume support: main process can pause discovery without stopping the utility process

### Claude's Discretion
- Import/export of settings (likely defer to keep Phase 1 simple)
- Exact rate limiter implementation (token bucket, sliding window, etc.)
- Thumbnail caching strategy (LRU eviction per INFR-04)
- Exact MessagePort message protocol/schema

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-08 | All platform providers implement a consistent adapter interface | BaseProvider abstract class pattern with init/search/destroy lifecycle, capability flags, typed ProviderResult |
| DISC-09 | A broken/unavailable platform degrades gracefully without affecting other platforms | Per-provider error isolation in DiscoveryManager, typed error reporting (auth_failed, rate_limited, network_error, unavailable), utility process crash recovery |
| INFR-01 | Discovery manager orchestrates all platform providers and merges results | DiscoveryManager with static provider imports, merged async generator output, Repeater-based bridge |
| INFR-02 | API polling runs in a worker thread or utility process to avoid blocking main process | Electron utilityProcess with MessagePort communication, built as separate Vite entry |
| INFR-03 | Per-platform rate limiting prevents API throttling/bans | Token bucket rate limiter owned by BaseProvider, per-provider limits declared via maxRequests/windowMs |
| INFR-04 | Thumbnail caching with LRU eviction prevents memory leaks | LRU cache in main process for thumbnail URLs, configurable max size |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 33.2.1 | utilityProcess, safeStorage, MessagePort APIs | Already in project; v33 has mature utility process support |
| electron-store | 11.x | Settings persistence (JSON on disk) | De facto standard for Electron app settings; built-in migrations, schema validation, change observers |
| @repeaterjs/repeater | 3.0.6 | Async generator bridge for MessagePort messages | Already used throughout the data pipeline |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (hand-rolled) | n/a | Token bucket rate limiter | ~50 lines; avoids Redis dependency that npm packages require |
| (hand-rolled) | n/a | LRU cache for thumbnails | Simple Map-based LRU; no need for external dependency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-store | conf (same author) | electron-store wraps conf with Electron-specific features (initRenderer, app paths) |
| Hand-rolled rate limiter | bottleneck npm | Bottleneck is 45KB and designed for job queues, overkill for simple API rate limiting |
| Hand-rolled LRU | lru-cache npm | lru-cache is solid but the requirement is simple enough (~30 lines) to avoid the dep |
| utilityProcess | worker_threads | utilityProcess provides full process isolation (crash safety) and MessagePort support; worker_threads share memory space |

**Installation:**
```bash
npm install -w streamwall electron-store
```

## Architecture Patterns

### Recommended Project Structure
```
packages/streamwall/src/main/discovery/
  base.ts              # BaseProvider abstract class
  manager.ts           # DiscoveryManager orchestrator
  types.ts             # DiscoveredStream, ProviderResult, ProviderError, DiscoveryMessage
  rate-limiter.ts      # TokenBucket rate limiter
  lru-cache.ts         # Simple LRU cache for thumbnails
  settings.ts          # electron-store instance, safeStorage helpers, defaults
  bridge.ts            # Repeater-based bridge: MessagePort -> AsyncGenerator<StreamData[]>
  mapper.ts            # toStreamData(DiscoveredStream) -> StreamData
  providers/           # One file per platform (empty in Phase 1, structure ready)
    index.ts           # Static provider registry

packages/streamwall/src/main/discovery-worker.ts
  # Utility process entry point -- imports providers, runs polling loop

packages/streamwall-shared/src/types.ts
  # Extended with DiscoverySettings, optional StreamData fields
```

### Pattern 1: Utility Process Communication via MessagePort
**What:** Main process forks a utility process and establishes bidirectional MessagePort communication.
**When to use:** When work must not block the main Electron process and crash isolation is required.
**Example:**
```typescript
// Source: Electron docs - utilityProcess API
// In main process:
import { utilityProcess, MessageChannelMain } from 'electron'
import path from 'path'

const { port1, port2 } = new MessageChannelMain()
const child = utilityProcess.fork(path.join(__dirname, 'discovery-worker.js'))
child.postMessage({ type: 'init' }, [port1])

// port2 stays in main process for receiving messages
port2.on('message', (event) => {
  const msg = event.data // DiscoveryMessage
  // process discovered streams
})
port2.start()

// In utility process (discovery-worker.ts):
process.parentPort.once('message', (e) => {
  const [port] = e.ports
  port.on('message', (event) => {
    // receive settings updates from main
  })
  // send discovered streams back
  port.postMessage({ type: 'streams', payload: discoveredStreams })
})
```

### Pattern 2: Repeater Bridge (matching LocalStreamData.gen())
**What:** Wrap MessagePort incoming messages in a Repeater to produce an AsyncGenerator compatible with combineDataSources.
**When to use:** When bridging event-based communication into the async generator pipeline.
**Example:**
```typescript
// Source: Existing pattern in data.ts LocalStreamData.gen()
import { Repeater } from '@repeaterjs/repeater'
import { StreamData } from 'streamwall-shared'

function createDiscoveryBridge(port: MessagePort): AsyncGenerator<StreamData[]> {
  return new Repeater(async (push, stop) => {
    await push([]) // initial empty state
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'streams') {
        const streams = event.data.payload.map(toStreamData)
        push(streams)
      }
    }
    port.on('message', handler)
    await stop
    port.off('message', handler)
  })
}
```

### Pattern 3: Settings with safeStorage Encryption
**What:** Use electron-store for general settings, encrypt API keys via safeStorage before storing.
**When to use:** For persisting credentials that should be protected at rest.
**Example:**
```typescript
// Main process only
import Store from 'electron-store'
import { safeStorage } from 'electron'

const store = new Store<DiscoverySettingsSchema>({
  name: 'discovery-settings',
  defaults: {
    discoveryIntervalMs: 60000,
    livenessIntervalMs: 30000,
    providers: {},
  },
  migrations: {
    '1.0.0': (store) => {
      // future migrations
    },
  },
})

// Encrypt API key before storing
function setApiKey(platform: string, key: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    store.set(`providers.${platform}.apiKeyEncrypted`, encrypted.toString('base64'))
  } else {
    // Fallback: store in plain text with warning
    store.set(`providers.${platform}.apiKey`, key)
  }
}

// Decrypt when sending to utility process
function getApiKey(platform: string): string | null {
  const encrypted = store.get(`providers.${platform}.apiKeyEncrypted`) as string | undefined
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }
  return store.get(`providers.${platform}.apiKey`) as string | null
}
```

### Pattern 4: BaseProvider Abstract Class
**What:** Abstract class that enforces consistent provider interface while owning rate limiting and error handling.
**When to use:** For all platform provider implementations.
**Example:**
```typescript
// src/main/discovery/base.ts
import { TokenBucket } from './rate-limiter'
import { DiscoveredStream, ProviderResult, ProviderCapabilities, RateLimitConfig } from './types'

export abstract class BaseProvider {
  abstract readonly platform: string
  abstract readonly capabilities: ProviderCapabilities
  protected abstract readonly rateLimit: RateLimitConfig
  private rateLimiter?: TokenBucket

  async init(config: Record<string, unknown>): Promise<void> {
    this.rateLimiter = new TokenBucket(this.rateLimit.maxRequests, this.rateLimit.windowMs)
    await this.onInit(config)
  }

  async search(query: string): Promise<ProviderResult> {
    if (!this.rateLimiter!.tryConsume()) {
      return {
        streams: [],
        error: { type: 'rate_limited', message: 'Rate limit exceeded', retryAfter: this.rateLimiter!.msUntilRefill() },
      }
    }
    try {
      return await this.onSearch(query)
    } catch (err) {
      return {
        streams: [],
        error: { type: 'network_error', message: String(err) },
      }
    }
  }

  async destroy(): Promise<void> {
    await this.onDestroy()
  }

  protected abstract onInit(config: Record<string, unknown>): Promise<void>
  protected abstract onSearch(query: string): Promise<ProviderResult>
  protected abstract onDestroy(): Promise<void>
}
```

### Anti-Patterns to Avoid
- **Importing electron-store in the utility process:** electron-store requires `app.getPath()` which is only available in the main process. Settings must be sent to the utility process via MessagePort.
- **Using `worker_threads` instead of `utilityProcess`:** worker_threads share the main process memory space and a crash in a worker can corrupt shared memory. `utilityProcess` provides full process isolation.
- **Making `DiscoveredStream` extend `StreamData`:** These are fundamentally different types -- DiscoveredStream is platform-native data, StreamData is the grid's internal format. Keep them separate with an explicit mapper.
- **Blocking main thread with synchronous safeStorage calls:** `safeStorage.encryptString()` and `decryptString()` are synchronous. On macOS and Linux they can block for user input. Call them during startup or settings changes, not on every poll cycle.
- **Using `child.on('message')` instead of MessagePort:** The `message` event on the UtilityProcess instance is for `process.parentPort.postMessage()`. For structured bidirectional communication, transfer a `MessageChannelMain` port.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom JSON file read/write | electron-store | Handles atomic writes, file watching, schema validation, migrations, dot-notation access |
| Credential encryption | Custom crypto wrapper | safeStorage + electron-store | OS-level keychain integration (DPAPI/Keychain/libsecret); battle-tested |
| Async generator combination | Custom Promise.race loop | Repeater.latest() via combineDataSources | Already proven in the codebase; handles backpressure correctly |
| Data source tagging | Manual _dataSource assignment | markDataSource() | Existing utility, consistent pattern |

**Key insight:** The existing data pipeline (`combineDataSources`, `markDataSource`, `Repeater`, `StreamIDGenerator`) already solves the hard problems. Discovery infrastructure just needs to produce an `AsyncGenerator<StreamData[]>` and plug into the existing array.

## Common Pitfalls

### Pitfall 1: electron-store ESM Import in CJS Context
**What goes wrong:** `electron-store` v11+ is a pure ESM package. Importing it with `require()` fails.
**Why it happens:** The streamwall package uses `"module": "commonjs"` in tsconfig.
**How to avoid:** Vite bundles the main process code, so it handles ESM-to-CJS conversion transparently. Use standard `import Store from 'electron-store'` in source code. Vite will resolve it.
**Warning signs:** `ERR_REQUIRE_ESM` errors at runtime. If this happens, verify Vite is actually bundling the main process entry.

### Pitfall 2: safeStorage Not Available Before app.ready
**What goes wrong:** Calling `safeStorage.isEncryptionAvailable()` before the `ready` event returns `false` on Windows/Linux.
**Why it happens:** The encryption backend isn't initialized until Electron finishes startup.
**How to avoid:** Initialize the settings store (including decrypting API keys) inside or after `app.whenReady()`. The current code already does this -- `main()` runs after `app.whenReady()`.
**Warning signs:** API keys appearing as null on first launch despite being saved.

### Pitfall 3: MessagePort Serialization Limits
**What goes wrong:** Sending non-serializable objects (class instances, functions, circular refs) via `postMessage` silently drops data or throws.
**Why it happens:** MessagePort uses the structured clone algorithm, not JSON.
**How to avoid:** Define a plain-object message protocol. Use discriminated unions (`{ type: string, payload: ... }`). Test serialization roundtrips.
**Warning signs:** Undefined fields in received messages, or `DataCloneError` exceptions.

### Pitfall 4: Utility Process Path Resolution in Packaged App
**What goes wrong:** `utilityProcess.fork(path.join(__dirname, 'discovery-worker.js'))` works in dev but fails in packaged app because paths differ inside asar.
**Why it happens:** Electron Forge + Vite outputs built files to `.vite/build/`. The utility process entry needs to be in the build output.
**How to avoid:** Add the utility process as a separate build entry in `forge.config.ts` with `target: 'main'` (not `target: 'preload'`). Use `__dirname` to resolve the built file path, which Vite will handle correctly for both dev and production.
**Warning signs:** `MODULE_NOT_FOUND` errors only when running the packaged app.

### Pitfall 5: Repeater Backpressure with Fast Polling
**What goes wrong:** If the utility process sends updates faster than `combineDataSources` consumes them, Repeater buffers grow.
**Why it happens:** `Repeater.latest()` drops intermediate values (good), but individual Repeater instances buffer pushes.
**How to avoid:** The discovery bridge Repeater should use the same pattern as `LocalStreamData.gen()` -- just push and let `Repeater.latest()` in `combineDataSources` handle the coalescing. Don't buffer in the bridge.
**Warning signs:** Memory growth over time in the main process.

### Pitfall 6: electron-store onDidChange Not Firing for Nested Keys
**What goes wrong:** `store.onDidChange('providers.twitch.apiKey', cb)` may not fire if the entire `providers` object is replaced.
**Why it happens:** `onDidChange` uses strict equality comparison on the specific key path.
**How to avoid:** Watch at the top-level key (`providers`) or use `onDidAnyChange` for settings that affect the utility process, then diff and forward only changed settings.
**Warning signs:** Settings changes not reaching the utility process after a "reset to defaults" operation.

## Code Examples

### Integration Point: Adding Discovery to dataSources Array
```typescript
// Source: packages/streamwall/src/main/index.ts lines 412-423
// Current code:
const dataSources = [
  ...argv.data['json-url'].map((url) => markDataSource(pollDataURL(url, argv.data.interval), 'json-url')),
  ...argv.data['toml-file'].map((path) => markDataSource(watchDataFile(path), 'toml-file')),
  markDataSource(localStreamData.gen(), 'custom'),
  overlayStreamData.gen(),
]

// After Phase 1, add discovery:
// const discoveryBridge = createDiscoveryBridge(port2)  // from utility process
// dataSources.push(markDataSource(discoveryBridge, 'discovery'))
// Note: markDataSource will be overridden per-stream by the mapper setting _dataSource: 'discovery:{platform}'
```

### Forge Config: Adding Utility Process Entry
```typescript
// Source: packages/streamwall/forge.config.ts
// Add to the VitePlugin build array:
{
  entry: 'src/main/discovery-worker.ts',
  config: 'vite.main.config.ts',  // Same config as main process (Node target)
  target: 'main',                 // Not 'preload' -- this runs as a full Node process
}
```

### Token Bucket Rate Limiter
```typescript
// src/main/discovery/rate-limiter.ts
export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private maxTokens: number,
    private refillIntervalMs: number,
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs) * this.maxTokens
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  tryConsume(): boolean {
    this.refill()
    if (this.tokens > 0) {
      this.tokens--
      return true
    }
    return false
  }

  msUntilRefill(): number {
    const elapsed = Date.now() - this.lastRefill
    return Math.max(0, this.refillIntervalMs - elapsed)
  }
}
```

### Message Protocol Types
```typescript
// src/main/discovery/types.ts (partial)

// Messages from main -> utility process
export type WorkerInMessage =
  | { type: 'configure'; settings: DiscoveryWorkerSettings }
  | { type: 'search'; query: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'destroy' }

// Messages from utility process -> main
export type WorkerOutMessage =
  | { type: 'streams'; platform: string; payload: DiscoveredStream[] }
  | { type: 'error'; platform: string; error: ProviderError }
  | { type: 'status'; platform: string; status: ProviderStatus }
  | { type: 'ready' }

export type ProviderStatus = 'running' | 'paused' | 'error' | 'stopped'

export interface ProviderError {
  type: 'auth_failed' | 'rate_limited' | 'network_error' | 'unavailable'
  message: string
  retryAfter?: number
}

export interface ProviderCapabilities {
  requiresCredentials: boolean
  supportsLanguageFilter: boolean
  isExperimental: boolean
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}
```

### StreamData Extension
```typescript
// Extending packages/streamwall-shared/src/types.ts
export interface StreamData extends ContentDisplayOptions {
  kind: ContentKind
  link: string
  label: string
  labelPosition?: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
  source?: string
  notes?: string
  status?: string
  _id: string
  _dataSource: string
  // Discovery extensions (optional)
  thumbnailUrl?: string
  viewerCount?: number
  platform?: string
  channelName?: string
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| worker_threads for Electron background work | utilityProcess (Electron 22+) | Electron 22 (2022) | Full crash isolation, MessagePort support |
| keytar for credential storage | safeStorage (Electron 15+) | Electron 15 (2021), keytar deprecated | No native module compilation needed |
| electron-store CJS import | electron-store ESM-only (v9+) | 2023 | Must use ESM imports; Vite handles bundling |
| Custom file-based config | electron-store with migrations | Stable | Atomic writes, schema validation out of box |

**Deprecated/outdated:**
- `keytar`: Deprecated in favor of `safeStorage`. Do not use.
- `electron-store` < v9: CJS versions are outdated. Use v11.x.
- `BrowserWindow` hidden windows for background work: Use `utilityProcess` instead.

## Open Questions

1. **Utility process entry in Electron Forge Vite plugin**
   - What we know: The `build` array in `forge.config.ts` VitePlugin accepts entries with `target: 'main'`. The utility process script needs to be compiled alongside the main process.
   - What's unclear: Whether `target: 'main'` produces the correct output path for `utilityProcess.fork()` to find. Electron Forge docs don't explicitly document utility process builds.
   - Recommendation: Add entry with `target: 'main'` and use `__dirname` for path resolution. Test in both dev and packaged modes early. If path issues arise, the build output can be located via `app.getAppPath()`.

2. **electron-store Buffer Serialization for Encrypted Keys**
   - What we know: `safeStorage.encryptString()` returns a `Buffer`. electron-store uses JSON serialization.
   - What's unclear: Whether electron-store handles Buffer serialization natively or needs base64 encoding.
   - Recommendation: Convert encrypted Buffer to base64 string before storing, decode back to Buffer before decrypting. This is safe and portable.

3. **Thumbnail LRU Cache Sizing**
   - What we know: INFR-04 requires LRU eviction to prevent memory leaks.
   - What's unclear: Optimal cache size depends on usage patterns (number of platforms, streams per page).
   - Recommendation: Default to 500 entries (URLs are small strings, ~100 bytes each). Make configurable in settings. Phase 1 just needs the mechanism; tuning can happen with real data.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured (CLAUDE.md: "There is no test suite configured") |
| Config file | none -- see Wave 0 |
| Quick run command | `npm -w streamwall test` (after setup) |
| Full suite command | `npm -w streamwall test` (after setup) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-08 | BaseProvider interface enforces init/search/destroy lifecycle | unit | `npx vitest run src/main/discovery/__tests__/base.test.ts` | No -- Wave 0 |
| DISC-09 | Broken provider doesn't crash DiscoveryManager | unit | `npx vitest run src/main/discovery/__tests__/manager.test.ts` | No -- Wave 0 |
| INFR-01 | DiscoveryManager merges results from multiple providers | unit | `npx vitest run src/main/discovery/__tests__/manager.test.ts` | No -- Wave 0 |
| INFR-02 | Discovery runs in utility process (smoke test: fork and message) | manual-only | Manual: start app, verify utility process in Task Manager | n/a |
| INFR-03 | Rate limiter prevents excess requests | unit | `npx vitest run src/main/discovery/__tests__/rate-limiter.test.ts` | No -- Wave 0 |
| INFR-04 | LRU cache evicts beyond max size | unit | `npx vitest run src/main/discovery/__tests__/lru-cache.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/main/discovery/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** All unit tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest` dev dependency installation: `npm install -w streamwall -D vitest`
- [ ] `vitest.config.ts` or vitest config in `vite.main.config.ts`
- [ ] `src/main/discovery/__tests__/base.test.ts` -- covers DISC-08
- [ ] `src/main/discovery/__tests__/manager.test.ts` -- covers DISC-09, INFR-01
- [ ] `src/main/discovery/__tests__/rate-limiter.test.ts` -- covers INFR-03
- [ ] `src/main/discovery/__tests__/lru-cache.test.ts` -- covers INFR-04
- [ ] Test for mapper function: `src/main/discovery/__tests__/mapper.test.ts`

Note: INFR-02 (utility process) is inherently integration/manual -- `utilityProcess.fork()` requires Electron runtime. Unit tests can verify the message protocol types and handler logic in isolation.

## Sources

### Primary (HIGH confidence)
- [Electron 33 utilityProcess API](https://www.electronjs.org/docs/latest/api/utility-process) - fork, MessagePort, lifecycle events, stdio options
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) - encryptString, decryptString, platform behavior
- [electron-store GitHub README](https://github.com/sindresorhus/electron-store/blob/main/readme.md) - full API: schema, migrations, onDidChange, defaults
- Existing codebase: `data.ts` (LocalStreamData.gen(), combineDataSources, markDataSource, Repeater patterns)
- Existing codebase: `types.ts` (StreamData, ControlCommand union patterns)
- Existing codebase: `forge.config.ts` (VitePlugin build array structure)

### Secondary (MEDIUM confidence)
- [Electron Forge Vite Plugin docs](https://www.electronforge.io/config/plugins/vite) - build entry configuration (utility process target not explicitly documented)
- [electron-store npm](https://www.npmjs.com/package/electron-store) - v11.x, requires Electron 30+, pure ESM

### Tertiary (LOW confidence)
- Utility process Vite build path resolution in packaged apps -- needs empirical validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - electron-store and utilityProcess are well-documented, mature APIs
- Architecture: HIGH - follows existing codebase patterns (Repeater, combineDataSources, EventEmitter)
- Pitfalls: HIGH - verified against official docs and existing code patterns
- Forge build config for utility process: MEDIUM - not explicitly documented in Electron Forge, but follows the same pattern as other entries

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable APIs, 30-day validity)
