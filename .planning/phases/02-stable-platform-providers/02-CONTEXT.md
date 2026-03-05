# Phase 2: Stable Platform Providers - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement YouTube, Twitch, and Kick live stream discovery providers that subclass the Phase 1 `BaseProvider` infrastructure. All three platforms work without credentials out of the box. YouTube optionally accepts a Data API v3 key for higher rate limits. Providers return discovered streams to a separate discovery list (not the main data pipeline) until the user explicitly adds them.

</domain>

<decisions>
## Implementation Decisions

### YouTube Dual-Mode
- Automatic swap: if YouTube Data API v3 key is present in settings, use Data API; otherwise use youtubei.js
- Instant revert: clearing the API key immediately switches back to youtubei.js on next search cycle (hot reload, matching Phase 1 decision)
- Live streams only — no upcoming/scheduled streams
- Silent mode switching: no UI feedback about which backend is active
- When Data API quota is exhausted (403), let the API error handle it — no client-side quota tracking
- Construct YouTube URLs from video ID: `https://youtube.com/watch?v={videoId}` (consistent format regardless of backend)

### Credential UX / Auth Strategy
- All three providers work without credentials: `requiresCredentials: false` for all
- YouTube: youtubei.js (Innertube, no key) as default; optional Data API v3 key for higher rate limits
- Twitch: unofficial GQL API (same as twitch.tv website), no auth required. Treated as stable (`isExperimental: false`)
- Kick: public API endpoints, no credentials needed
- No new capability flags — existing `ProviderCapabilities` is sufficient
- YouTube API key input method: Claude's discretion (before Settings UI in Phase 5)
- Update DISC-03 to "no credentials required via GQL" and DISC-04 to "no credentials required"
- HTTP/package choice per platform: Claude's discretion (youtubei.js for YouTube is decided; Twitch/Kick approach decided during research)

### Search Result Handling
- Return all available live streams matching the filter — paginate through all results
- Burst fetch: fetch all pages in quick succession on each search cycle (rate limiter handles pacing)
- Soft cap: 500 results per platform (stop paginating after 500)
- Replace-all merge: each search cycle replaces previous results entirely
- Sort results by viewer count (high to low)
- Single global search query applies to all providers (per-platform overrides in Phase 4)
- Comma-separated keywords: "news, protest, rally" runs separate searches per keyword, results deduped by URL
- 500 cap is total across all keywords per platform (after dedup)
- Search query persists in electron-store across app restarts
- Search query input method: Claude's discretion (before Discovery UI in Phase 3 and Settings UI in Phase 5)
- Language filtering: provider-level when API supports it (per `supportsLanguageFilter` flag), DiscoveryManager does second pass for platforms that don't

### Discovery Data Flow
- Discovered streams go to a separate discovery list, NOT the main data pipeline
- Streams only enter the pipeline when user explicitly adds them (via "Watch" in Phase 3)
- Storage: in-memory `Map<string, DiscoveredStream[]>` keyed by platform in main process
- IPC exposure to control panel: Claude's discretion (new channel vs extending ControlCommand)
- Cross-platform deduplication: none — show the same stream from each platform separately
- Within-platform deduplication: by URL
- URL as sole identifier for DiscoveredStream (no separate ID field needed)

### Stream URLs
- YouTube: `https://youtube.com/watch?v={videoId}` (constructed from video ID)
- Twitch: `https://twitch.tv/{username}` (standard channel URL)
- Kick: `https://kick.com/{username}` (standard channel URL)
- Single `url` field serves both grid embedding and external browser opening
- Thumbnail URLs stored as-is from each platform API

### Discovery Lifecycle
- Discovery starts on app launch (utility process starts immediately, per Phase 1)
- If no search query configured, providers skip silently (no API calls)
- Per-provider enable/disable toggle (respects `DiscoveryWorkerSettings.providers[].enabled`)
- All providers enabled by default in electron-store (no config needed until Settings UI in Phase 5)
- Disabled providers: skip search() but stay initialized (no destroy/re-init cycle)

### Liveness Checking
- Liveness check approach per platform: Claude's discretion (re-search vs per-stream status endpoint)
- Grace period: keep offline streams in discovery list for 1-2 more cycles before removing
- If a discovered stream being watched on the grid goes offline, remove it from the grid too

### Error Handling
- Console logging (platform-prefixed: `[YouTube] Rate limited: retry in 60s`) + IPC status updates
- Rate limit: wait for next polling cycle, no active retry
- Repeated failures: keep retrying every cycle (no auto-pause), provider will recover when API comes back
- Rate limits hardcoded per provider in code, not configurable by operator
- Moderate rate limits for unofficial APIs (normal usage levels, not overly conservative)

### Kick API Approach
- Best effort: implement with whatever endpoints work; if they break, return empty results with error status
- Scraping as fallback: Claude decides during research based on what's available

### Provider Registration
- Registration approach: Claude's discretion (static array vs registry class)
- Toggle behavior: skip search() when disabled, don't destroy/re-init

### Testing
- Integration tests against real APIs (local only, not CI)
- Hardcoded common search term (e.g., 'news') for test queries
- Providers are Electron-only — no standalone Node.js testability requirement

### Claude's Discretion
- YouTube provider class structure (single class with branching vs two classes)
- YouTube API key input method before Settings UI exists
- Search query input method before Discovery UI/Settings UI exist
- HTTP client vs npm package choice for Twitch GQL and Kick
- Liveness check implementation per platform
- IPC design for exposing discovery results to control panel
- Provider registration pattern (static array vs registry)
- Exact rate limit values per provider

</decisions>

<specifics>
## Specific Ideas

- Twitch and Kick streams work the same way as pasting a URL — Streamwall loads the page and finds the `<video>` tag. Discovery just needs to find those URLs.
- The existing `combineDataSources` pipeline is for watched streams, not discovery results. Discovery maintains its own separate in-memory list.
- Phase 1's `providers/index.ts` is an empty array waiting for Phase 2 to populate it with provider instances.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BaseProvider` (discovery/base.ts): Abstract class with `onInit/onSearch/onDestroy` — providers subclass this
- `TokenBucket` (discovery/rate-limiter.ts): Rate limiter used by BaseProvider — providers just declare `rateLimit` config
- `DiscoveredStream` type (discovery/types.ts): Complete interface with platform, title, channelName, url, thumbnailUrl, viewerCount, language, tags, startedAt
- `ProviderCapabilities` (discovery/types.ts): `requiresCredentials`, `supportsLanguageFilter`, `isExperimental` flags
- `discoveryStore` (discovery/settings.ts): electron-store instance with `setApiKey/getApiKey/getDiscoverySettings`
- `WorkerInMessage/WorkerOutMessage` (discovery/types.ts): Message protocol for utility process communication
- `LRUCache` (discovery/lru-cache.ts): Available for thumbnail caching

### Established Patterns
- Providers declare `rateLimit: RateLimitConfig` and base class enforces via TokenBucket
- Provider errors caught by base class and wrapped in `ProviderResult.error`
- `DiscoveryWorkerSettings.providers` has per-provider `enabled` and `apiKey` fields
- Console-only logging (no file logging) — Phase 1 decision

### Integration Points
- `providers/index.ts`: Empty array — add YouTube, Twitch, Kick provider instances here
- `discovery/manager.ts`: DiscoveryManager iterates providers and calls search()
- `discovery/settings.ts`: API key storage/retrieval ready for YouTube Data API key
- `discovery/bridge.ts`: Bridge between utility process and main process
- `discovery/mapper.ts`: `toStreamData()` function for when streams are added to grid

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-stable-platform-providers*
*Context gathered: 2026-03-05*
