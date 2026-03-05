# Project Research Summary

**Project:** MultiStreamWall -- Live Stream Discovery
**Domain:** Multi-platform live stream discovery and aggregation for an Electron mosaic viewer
**Researched:** 2026-03-05
**Confidence:** MEDIUM

## Executive Summary

Streamwall is an Electron app that composes multiple livestreams into a mosaic grid. The discovery feature adds the ability to search for live streams across six platforms (YouTube, Twitch, Kick, TikTok, Instagram, Facebook) and add them to the grid with one click. This fills a genuine market gap: no existing tool combines multi-platform stream *discovery* with a native mosaic *display*. Web-based multi-viewers require manual URL entry, and broadcast monitoring tools require professional hardware.

The recommended approach is to build discovery as a new data source that feeds into the existing `combineDataSources` pipeline via async generators. This means zero changes to the existing stream rendering, view assignment, and audio control systems. The architecture adds a `DiscoveryManager` in the main process that orchestrates per-platform provider modules, each implementing a common `BaseProvider` interface with built-in rate limiting and graceful degradation. The UI is a new tab in the existing control panel, not a separate window.

The primary risk is a reliability gradient across platforms. YouTube and Twitch have stable APIs and mature client libraries. Kick has a new but official API. TikTok, Instagram, and Facebook have no viable official APIs -- all require fragile unofficial scraping that will break periodically. The mitigation strategy is to treat these as independent, isolatable modules: when one breaks, the others keep working, and the UI clearly communicates which platforms are available. A secondary risk is the PROJECT.md's incorrect claim that Twitch and Kick require "no auth" -- both require free app registration for client credentials, and this must be addressed in the first-run experience.

## Key Findings

### Recommended Stack

The stack splits into three reliability tiers. Tier 1 (ship with confidence) includes `youtubei.js` for YouTube Innertube access and `@twurple/api` + `@twurple/auth` for Twitch Helix. Tier 2 (workable, monitor) includes Kick via direct HTTP to their new public API. Tier 3 (fragile, expect breakage) covers TikTok, Instagram, and Facebook via unofficial scraping. Supporting libraries include `p-throttle` and `p-retry` for resilience, and `zod` for runtime validation of unpredictable API responses.

**Core technologies:**
- `youtubei.js` (^16.0.1): YouTube live stream search via Innertube -- no API key needed, 11k+ stars, actively maintained
- `@twurple/api` + `@twurple/auth` (^8.0.3): Twitch stream search -- typed, well-documented, client credentials flow
- Direct HTTP (fetch): Kick livestream search -- official API launched 2025, no mature SDK exists
- `zod` (^3.24): Runtime validation of all API responses -- essential for unofficial APIs returning unpredictable shapes
- `p-throttle` / `p-retry` (^6.2): Rate limiting and retry with backoff -- wrap every platform client

### Expected Features

**Must have (table stakes):**
- Multi-platform search across YouTube, Twitch, Kick (stable platforms first)
- Keyword/title filtering with global defaults
- Stream metadata display: thumbnails, titles, channel names, viewer counts
- Platform tabs in control panel to organize results
- One-click "Watch" button to add stream to grid
- Auto-refresh polling with configurable interval
- Liveness checking with auto-removal of offline streams

**Should have (differentiators):**
- Per-platform filter overrides (global keyword + Twitch-specific tags)
- Language-based filtering across platforms
- Graceful platform degradation with per-platform health indicators
- Optional API key upgrade path (YouTube Data API v3 for higher rate limits)
- Configurable dual-interval polling (discovery vs. liveness)

**Defer (v2+):**
- TikTok, Instagram, Facebook discovery (fragile, add after stable pipeline proven)
- Multi-operator collaborative discovery
- Saved filter presets
- Chat integration, stream recording, AI recommendations (anti-features)

### Architecture Approach

Discovery integrates into the existing Electron app as a new data source, not a parallel system. The `DiscoveryManager` produces an `AsyncGenerator<StreamData[]>` that plugs directly into the existing `dataSources` array. Discovery state (found streams, platform health, filters) travels over a dedicated `discovery-state` IPC channel, separate from the existing `StreamwallState` and Yjs view assignment channels. Commands flow through the existing `control:command` channel with new `discovery:*` discriminated union members.

**Major components:**
1. **DiscoveryManager** -- orchestrates all platform providers, owns polling intervals, aggregates results, feeds data pipeline
2. **BaseProvider (abstract)** + platform implementations -- one per platform, handles search/liveness/rate-limiting/error-isolation
3. **LivenessChecker** -- periodic verification that streams are still live, signals removal with grace period
4. **SettingsStore** -- persists API keys, filters, intervals to disk (encrypted via `safeStorage` for keys)
5. **DiscoveryPanel (renderer)** -- platform tabs, filter bar, stream cards with Watch/Link buttons

### Critical Pitfalls

1. **Unofficial API breakage cascade** -- TikTok/Instagram/Facebook scrapers will break. Each platform provider must be independently isolatable with health status indicators. Never let one platform's failure propagate to others.
2. **Main process blocking** -- Polling 6 platforms from Electron's main process risks event loop blocks. Use `Promise.allSettled()` with per-request timeouts, stagger polls in round-robin, consider utility process for polling.
3. **Thumbnail memory leaks** -- Hundreds of thumbnails in long sessions cause unbounded memory growth. Use virtual lists, LRU cache (max 200 entries), and periodic `session.clearCache()`.
4. **Rate limit miscalculation** -- A single "poll interval" slider applied uniformly across platforms will exhaust Twitch's 800 req/min budget. Enforce per-platform floor intervals (YouTube 60s, Twitch 30s, TikTok 120s).
5. **Twitch/Kick auth assumption** -- PROJECT.md claims "no auth required" but Twitch Helix requires app registration for client credentials. Must be addressed in requirements and first-run UX.
6. **Polling storms on filter changes** -- Typing triggers re-polls per keystroke. Debounce by 500ms, cancel in-flight requests via AbortController.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation -- Types, Provider Interface, Settings

**Rationale:** Everything depends on shared types and the provider abstraction. The BaseProvider pattern with rate limiting and graceful degradation must be established before any platform integration. Settings storage is needed for API keys (Twitch requires credentials from day one).
**Delivers:** Shared types (`DiscoveryStream`, `DiscoveryState`, `FilterConfig`, extended `ControlCommand`), `BaseProvider` abstract class, `SettingsStore`, discovery IPC channel definitions.
**Addresses:** Architectural foundation, auth requirement correction (Pitfall 5)
**Avoids:** Pitfall 1 (API breakage cascade -- isolation pattern is foundational), Pitfall 4 (rate limits built into adapter interface)

### Phase 2: Stable Platform Providers

**Rationale:** YouTube, Twitch, and Kick are the three stable platforms with official or semi-official APIs. Building these first validates the provider pattern with reliable backends before tackling fragile ones.
**Delivers:** YouTubeProvider (youtubei.js Innertube), TwitchProvider (@twurple/api with client credentials), KickProvider (direct HTTP).
**Uses:** `youtubei.js`, `@twurple/api`, `@twurple/auth`, `p-throttle`, `p-retry`, `zod`
**Implements:** BaseProvider concrete implementations with per-platform rate limiting

### Phase 3: Discovery Manager and Data Pipeline Integration

**Rationale:** With providers working, the orchestrator can aggregate results and feed them into the existing data pipeline. This is the core integration point -- discovery streams become first-class citizens alongside TOML/JSON sources.
**Delivers:** `DiscoveryManager` (async generator output), `LivenessChecker`, main process wiring (index.ts adds discovery to dataSources), ControlWindow IPC for discovery state, controlPreload extensions.
**Addresses:** Auto-refresh polling, liveness checking, offline stream removal
**Avoids:** Pitfall 2 (main process blocking -- staggered polling, timeouts), Pitfall 3 (anti-pattern: separate data pipeline)

### Phase 4: Discovery UI

**Rationale:** With the backend pipeline working, the control panel UI can consume discovery state and send commands. This is where operators interact with discovery.
**Delivers:** DiscoveryPanel with platform tabs, StreamCard components (thumbnail, title, viewers, Watch/Link buttons), FilterBar with debounced input, platform health indicators.
**Addresses:** Platform tabs, keyword filtering, one-click add to grid, stream metadata display, open stream externally
**Avoids:** Pitfall 3 (thumbnail memory -- virtual list and LRU cache from day one), Pitfall 6 (polling storms -- debounce in UI layer)

### Phase 5: Settings UI and Advanced Filtering

**Rationale:** Once core discovery works, add operator configuration: API key entry (YouTube Data API v3 fallback), polling interval tuning, language filtering, per-platform filter overrides.
**Delivers:** Settings panel for API keys, polling intervals, language defaults, per-platform filter overrides. Optional YouTube Data API v3 upgrade path.
**Addresses:** Optional API key support, language filtering, per-platform filter overrides, configurable dual-interval polling

### Phase 6: Fragile Platform Providers (Experimental)

**Rationale:** TikTok, Instagram, and Facebook have no stable APIs. Build these last after the provider pattern is proven. Label them "Experimental" in the UI. Expect maintenance burden.
**Delivers:** TikTokProvider, InstagramProvider, FacebookProvider -- all with explicit "experimental" status and graceful degradation.
**Uses:** Direct HTTP scraping (NOT Playwright inside Electron -- resource disaster per Pitfalls research)
**Avoids:** Pitfall 1 (breakage cascade -- these platforms can fail independently without affecting Tier 1)

### Phase 7: Hardening and Long-Session Stability

**Rationale:** After all features work, validate long-running stability: 8-hour soak tests, memory profiling, rate limit budget verification, platform failure isolation testing.
**Delivers:** Verified stability under real-world operator conditions. Memory flat within 50MB over 4 hours. All platforms independently isolatable.
**Addresses:** "Looks Done But Isn't" checklist from PITFALLS.md

### Phase Ordering Rationale

- Phases 1-3 are strictly sequential: types before providers, providers before orchestrator, orchestrator before UI.
- Phase 4 (UI) can partially overlap with Phase 3 once IPC types are defined.
- Phase 5 (settings) depends on Phase 4 (settings panel is part of the UI).
- Phase 6 (fragile platforms) is intentionally last and optional -- the product is fully viable with just YouTube, Twitch, and Kick.
- Phase 7 (hardening) is a verification phase, not a feature phase.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Stable Providers):** YouTube Innertube rate limits are undocumented; Kick API is new and may have changed since research. Verify current endpoints before implementation.
- **Phase 6 (Fragile Providers):** TikTok/Instagram/Facebook scraping approaches are inherently unstable. Research current working methods immediately before implementation, not in advance.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Standard TypeScript types, abstract class pattern, settings persistence -- well-documented.
- **Phase 3 (Pipeline Integration):** Follows existing `combineDataSources` pattern exactly. Codebase analysis provides clear integration points.
- **Phase 4 (Discovery UI):** Standard Preact component architecture. Existing control panel provides the pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Tier 1 platforms (YouTube, Twitch) are HIGH confidence with official docs and mature libraries. Tier 3 platforms (TikTok, Instagram, Facebook) are LOW -- no stable APIs exist. Blended assessment is MEDIUM. |
| Features | MEDIUM-HIGH | Feature landscape is well-defined by competitor analysis. Table stakes are clear. The gap in the market (discovery + mosaic) is validated by absence in competitors. |
| Architecture | HIGH | Architecture maps directly onto existing Streamwall patterns (async generators, IPC, XState, Preact). Integration points are minimal and well-understood from codebase analysis. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls are well-sourced (Electron docs, GitHub issues, real-world case studies). Rate limit specifics for unofficial platforms are less certain. |

**Overall confidence:** MEDIUM

The high-confidence core (YouTube + Twitch + Kick + existing architecture patterns) is sufficient to build a viable product. The low-confidence periphery (TikTok/Instagram/Facebook) is correctly deferred to Phase 6.

### Gaps to Address

- **Twitch auth requirement vs. PROJECT.md:** PROJECT.md says "no auth required" but Twitch Helix requires app registration. Clarify this in requirements before Phase 1 -- it affects the "works out of the box" constraint and first-run UX.
- **Kick API current state:** Kick's API launched recently and is expanding. Verify current endpoints, auth requirements, and rate limits against docs.kick.com at the start of Phase 2.
- **YouTube Innertube rate limits:** Undocumented. The 60-second polling floor is a conservative guess. Validate empirically during Phase 2 development.
- **TikTok scraping viability:** At research time, no reliable Node.js approach exists. This may change by the time Phase 6 is reached. Re-research immediately before implementation.
- **Electron `safeStorage` for API keys:** Recommended for encrypting stored credentials. Verify it works correctly on all target platforms (Windows, macOS, Linux) during Phase 1.

## Sources

### Primary (HIGH confidence)
- [LuanRT/YouTube.js GitHub](https://github.com/LuanRT/YouTube.js) -- Innertube client library, v16.0.1
- [Twitch API Reference](https://dev.twitch.tv/docs/api/reference) -- Helix endpoints, rate limits
- [Twitch Authentication Docs](https://dev.twitch.tv/docs/authentication/) -- Client credentials flow
- [@twurple/api npm](https://www.npmjs.com/package/@twurple/api) -- v8.0.3
- [Electron Performance Guide](https://www.electronjs.org/docs/latest/tutorial/performance) -- Main process blocking

### Secondary (MEDIUM confidence)
- [Kick Dev Docs](https://docs.kick.com) -- Public API, livestreams endpoint
- [Kick Dev Docs GitHub](https://github.com/KickEngineering/KickDevDocs) -- API changelog
- [Electron Issue #43186](https://github.com/electron/electron/issues/43186) -- Event loop blocking causes ECONNRESET
- [Electron Issue #27071](https://github.com/electron/electron/issues/27071) -- WebContents memory leaks
- [Actual Budget blog](https://medium.com/actualbudget/the-horror-of-blocking-electrons-main-process-351bf11a763c) -- Main process blocking case study

### Tertiary (LOW confidence)
- TikTok scraping approaches -- no stable method documented, re-verify before implementation
- Instagram private API (`instagram-private-api`) -- last published 2+ years ago, high ban risk
- Facebook scraping -- no viable programmatic path confirmed

---
*Research completed: 2026-03-05*
*Ready for roadmap: yes*
