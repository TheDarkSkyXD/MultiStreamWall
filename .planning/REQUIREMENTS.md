# Requirements: Streamwall Live Stream Discovery

**Defined:** 2026-03-05
**Core Value:** Operators can discover live streams across 6 platforms by keyword/tag filters and add them to the grid with one click

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Discovery

- [x] **DISC-01**: User can search YouTube live streams by keyword via youtubei.js (no API key required)
- [x] **DISC-02**: User can optionally provide YouTube Data API v3 key for higher rate limits
- [ ] **DISC-03**: User can search Twitch live streams via @twurple/api (app credentials in settings)
- [ ] **DISC-04**: User can search Kick live streams via direct API fetch (app credentials in settings)
- [ ] **DISC-05**: User can discover TikTok live streams via scraping/unofficial approach
- [ ] **DISC-06**: User can discover Instagram live streams via scraping/unofficial approach
- [ ] **DISC-07**: User can discover Facebook live streams via scraping/unofficial approach
- [x] **DISC-08**: All platform providers implement a consistent adapter interface
- [x] **DISC-09**: A broken/unavailable platform degrades gracefully without affecting other platforms

### Filtering

- [ ] **FILT-01**: User can set global keyword/tag filters that apply across all platforms
- [ ] **FILT-02**: User can set per-platform filter overrides on top of global defaults
- [ ] **FILT-03**: User can set a default stream language filter in settings

### UI

- [ ] **UI-01**: Discovery panel shows platform tabs with platform icons in the control panel
- [ ] **UI-02**: Each discovered stream shows thumbnail, title, channel name, and viewer count
- [ ] **UI-03**: User can click "Watch" to add a stream to the grid (auto-assigns to first empty slot)
- [ ] **UI-04**: User can click "Link" to open the stream URL in their default browser
- [ ] **UI-05**: User can drag-to-reposition streams on the grid after auto-assignment
- [ ] **UI-06**: Settings page provides fields for API keys, polling intervals, filter config, and language

### Polling

- [ ] **POLL-01**: User can configure discovery fetch interval via slider (5s, 1m, 5m, 10m)
- [ ] **POLL-02**: User can configure liveness check interval independently (default 30s)
- [ ] **POLL-03**: Streams that go offline are automatically removed from the discovery list and grid

### Infrastructure

- [x] **INFR-01**: Discovery manager orchestrates all platform providers and merges results
- [x] **INFR-02**: API polling runs in a worker thread or utility process to avoid blocking main process
- [x] **INFR-03**: Per-platform rate limiting prevents API throttling/bans
- [x] **INFR-04**: Thumbnail caching with LRU eviction prevents memory leaks in long sessions

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Localization

- **LOC-01**: UI localization / multi-language interface for Streamwall itself

### Collaboration

- **COLLAB-01**: Multi-operator collaborative discovery via Yjs

### Advanced

- **ADV-01**: Saved filter presets (e.g., "Protest streams", "Gaming streams")
- **ADV-02**: Stream health metrics (buffering, quality indicators)
- **ADV-03**: New stream highlight/badge notification in discovery list

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Chat integration | Massive scope -- each platform has different chat APIs, auth, rate limits |
| Stream recording/DVR | Different product domain -- use OBS/yt-dlp alongside Streamwall |
| AI-powered recommendations | Over-engineered for operator tool -- keyword filtering covers 90% |
| Real-time viewer analytics/charts | Analytics is a separate product -- show current count only |
| Automatic stream quality selection | Platforms auto-select; HLS uses hls.js adaptive bitrate |
| Desktop notifications for new streams | Noisy for always-on monitoring -- new streams appear in list |
| Follow/favorite channels | Use existing TOML/JSON sources for known channels |
| Bundled API keys | Users provide their own credentials for Twitch/Kick |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 2 | Complete |
| DISC-02 | Phase 2 | Complete |
| DISC-03 | Phase 2 | Pending |
| DISC-04 | Phase 2 | Pending |
| DISC-05 | Phase 6 | Pending |
| DISC-06 | Phase 6 | Pending |
| DISC-07 | Phase 6 | Pending |
| DISC-08 | Phase 1 | Complete |
| DISC-09 | Phase 1 | Complete |
| FILT-01 | Phase 4 | Pending |
| FILT-02 | Phase 4 | Pending |
| FILT-03 | Phase 4 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 5 | Pending |
| POLL-01 | Phase 4 | Pending |
| POLL-02 | Phase 4 | Pending |
| POLL-03 | Phase 4 | Pending |
| INFR-01 | Phase 1 | Complete |
| INFR-02 | Phase 1 | Complete |
| INFR-03 | Phase 1 | Complete |
| INFR-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation*
