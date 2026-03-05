# Roadmap: Streamwall Live Stream Discovery

## Overview

This roadmap delivers a live stream discovery system for Streamwall across 6 phases. The journey starts with the discovery infrastructure (provider interface, orchestrator, rate limiting), then adds stable platform providers (YouTube, Twitch, Kick), builds the operator-facing discovery UI, layers in filtering and polling controls, adds a settings page for configuration, and finally tackles the fragile platforms (TikTok, Instagram, Facebook). Each phase delivers a coherent, verifiable capability that builds on the previous one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Discovery Infrastructure** - Provider interface, discovery manager, settings store, rate limiting, and data pipeline integration
- [ ] **Phase 2: Stable Platform Providers** - YouTube, Twitch, and Kick provider implementations
- [ ] **Phase 3: Discovery UI** - Platform tabs, stream cards, Watch/Link actions, and grid assignment
- [ ] **Phase 4: Filtering and Polling** - Global/per-platform keyword filters, language filter, configurable polling intervals, liveness checking
- [ ] **Phase 5: Settings UI** - Operator configuration page for API keys, intervals, filters, and language
- [ ] **Phase 6: Fragile Platform Providers** - TikTok, Instagram, and Facebook discovery (experimental)

## Phase Details

### Phase 1: Discovery Infrastructure
**Goal**: The discovery system's backbone exists -- provider interface, orchestrator, settings persistence, IPC channels, and data pipeline integration are wired up and ready for platform implementations
**Depends on**: Nothing (first phase)
**Requirements**: DISC-08, DISC-09, INFR-01, INFR-02, INFR-03, INFR-04
**Success Criteria** (what must be TRUE):
  1. A new platform provider can be added by implementing the BaseProvider interface without modifying the orchestrator
  2. The DiscoveryManager produces an async generator that feeds into the existing combineDataSources pipeline
  3. API polling runs in a worker thread or utility process, not blocking the main Electron process
  4. Per-platform rate limiting is enforced by the infrastructure (not left to individual providers)
  5. Settings (API keys, intervals) persist to disk across app restarts, with credentials encrypted via safeStorage
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md -- Types, utilities (rate limiter, LRU cache, mapper), vitest setup, and tests
- [ ] 01-02-PLAN.md -- BaseProvider, DiscoveryManager, settings store, utility process worker, bridge, and pipeline integration

### Phase 2: Stable Platform Providers
**Goal**: Operators can discover live streams from YouTube, Twitch, and Kick -- the three platforms with stable APIs
**Depends on**: Phase 1
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04
**Success Criteria** (what must be TRUE):
  1. User can search YouTube live streams by keyword using youtubei.js with no API key required
  2. User can optionally enter a YouTube Data API v3 key for higher rate limits, and the provider switches to use it
  3. User can search Twitch live streams after entering app credentials in settings
  4. User can search Kick live streams by keyword with no credentials required
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Discovery UI
**Goal**: Operators can browse discovered streams in the control panel and add them to the grid with one click
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Control panel shows platform tabs with recognizable platform icons, and switching tabs filters the stream list
  2. Each discovered stream displays a thumbnail, title, channel name, and current viewer count
  3. User can click "Watch" on a stream and it appears in the first empty grid slot
  4. User can click "Link" on a stream and the URL opens in their default browser
  5. User can drag a stream to reposition it on the grid after auto-assignment
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Filtering and Polling
**Goal**: Operators can control what streams appear through keyword/language filters and tune how frequently discovery polls platforms
**Depends on**: Phase 3
**Requirements**: FILT-01, FILT-02, FILT-03, POLL-01, POLL-02, POLL-03
**Success Criteria** (what must be TRUE):
  1. User can set global keyword filters and see only matching streams across all platforms
  2. User can set per-platform filter overrides that combine with (or replace) global defaults
  3. User can set a language filter and only see streams broadcast in that language
  4. User can adjust the discovery fetch interval via a slider (5s to 10m range) and the polling rate changes accordingly
  5. Streams that go offline are automatically removed from the discovery list and freed from the grid
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Settings UI
**Goal**: Operators have a dedicated settings page to configure all discovery parameters in one place
**Depends on**: Phase 4
**Requirements**: UI-06
**Success Criteria** (what must be TRUE):
  1. Settings page provides fields for API keys (YouTube Data API v3, Twitch app credentials) with save/clear actions
  2. Settings page exposes polling interval sliders (discovery and liveness) and filter configuration
  3. Settings page provides a language filter dropdown
  4. Changes in settings take effect without restarting the app
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Fragile Platform Providers
**Goal**: Operators can discover live streams from TikTok, Instagram, and Facebook, with clear "experimental" labeling and graceful degradation when scrapers break
**Depends on**: Phase 2
**Requirements**: DISC-05, DISC-06, DISC-07
**Success Criteria** (what must be TRUE):
  1. User can discover TikTok live streams by keyword, with the platform tab marked "Experimental"
  2. User can discover Instagram live streams, with the platform tab marked "Experimental"
  3. User can discover Facebook live streams, with the platform tab marked "Experimental"
  4. When any fragile provider fails, the UI shows a clear error state for that platform while other platforms continue working
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 > 2 > 3 > 4 > 5 > 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Discovery Infrastructure | 0/2 | Not started | - |
| 2. Stable Platform Providers | 0/2 | Not started | - |
| 3. Discovery UI | 0/2 | Not started | - |
| 4. Filtering and Polling | 0/2 | Not started | - |
| 5. Settings UI | 0/1 | Not started | - |
| 6. Fragile Platform Providers | 0/2 | Not started | - |
