# Streamwall — Live Stream Discovery

## What This Is

Streamwall is an Electron app that composes multiple livestreams into a mosaic grid. This milestone adds a live stream discovery system that automatically finds and displays live streams from YouTube, Twitch, Kick, TikTok, Instagram, and Facebook — letting operators browse, filter, and add streams to the grid without manually entering URLs.

## Core Value

Operators can discover live streams across 6 platforms by keyword/tag filters and add them to the grid with one click — no manual URL hunting.

## Requirements

### Validated

- ✓ Multi-stream mosaic grid display — existing
- ✓ Stream view lifecycle management (XState) — existing
- ✓ Operator control panel with drag-and-drop stream assignment — existing
- ✓ Data pipeline merging multiple stream sources — existing
- ✓ Yjs CRDT view-to-stream state — existing
- ✓ HLS playback support — existing
- ✓ Keyboard hotkeys for stream control — existing
- ✓ Streamdelay integration — existing
- ✓ Background/overlay layer system — existing

### Active

- [ ] Live stream discovery across 6 platforms (YouTube, Twitch, Kick, TikTok, Instagram, Facebook)
- [ ] Platform tabs with icons in the control panel
- [ ] Per-stream display: thumbnail, title, channel name, viewer count
- [ ] Tag/title word filters — global defaults with per-platform overrides
- [ ] Configurable fetch interval (5s, 1m, 5m, 10m slider)
- [ ] Separate liveness check interval (default 30s, independent slider)
- [ ] Auto-remove streams that go offline
- [ ] "Watch" button to add stream to grid (auto-assign to empty slot)
- [ ] "Link" button to open stream URL externally
- [ ] Drag-to-reposition streams after auto-assignment
- [ ] Default language filter setting (filter streams by broadcast language)
- [ ] UI language/localization setting
- [ ] YouTube: `youtubei` package (Innertube, no key required) as default
- [ ] YouTube: optional Data API v3 key for higher rate limits
- [ ] Twitch: public API (no auth required)
- [ ] Kick: public API (no auth required)
- [ ] TikTok: unofficial package/scraping for live discovery
- [ ] Instagram: unofficial package/scraping for live discovery
- [ ] Facebook: unofficial package/scraping for live discovery
- [ ] Settings UI for API keys, language, intervals, filters

### Out of Scope

- Multi-operator collaboration for discovery — complexity, defer to future
- Stream recording/DVR — separate feature domain
- Chat integration — out of scope for discovery milestone
- Paid API tiers or proxy services — users manage their own keys
- Mobile app — desktop Electron only

## Context

- Streamwall already has a data pipeline (`combineDataSources`) that merges async generator sources — the discovery system should integrate as new data sources feeding into this pipeline
- The control panel (`streamwall-control-ui`) is a single large Preact component (~1300 lines) — tabs will be added here
- YouTube Innertube via `youtubei` avoids official API quota limits; optional YouTube Data API v3 key provides a fallback for higher reliability
- Twitch and Kick have public endpoints for live stream search that don't require authentication
- TikTok, Instagram, Facebook have no clean public APIs — will need unofficial packages or scraping approaches (research needed)
- Existing architecture uses Preact (not React), styled-components, and Tailwind CSS 4

## Constraints

- **No required API keys**: YouTube (youtubei), Twitch, and Kick must work without user-provided keys out of the box
- **Rate limiting**: Discovery polling must respect platform rate limits — configurable intervals help users tune this
- **Electron security**: All network requests go through main process; renderer stays sandboxed
- **Existing architecture**: Must integrate with existing IPC bridge pattern, Yjs state, and XState view machines
- **Package fragility**: Unofficial packages for TikTok/Instagram/Facebook may break — need graceful degradation per platform

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| youtubei for YouTube | Avoids API key requirement, uses Innertube API | — Pending |
| Public APIs for Twitch/Kick (no auth) | Simplifies setup, sufficient for stream discovery | — Pending |
| Tabs in existing control panel | Keeps single-window operator experience | — Pending |
| Global + per-platform filters | Flexibility without complexity | — Pending |
| Separate liveness check interval | Prevents excessive API calls while keeping grid fresh | — Pending |
| All 6 platforms in v1 | User wants comprehensive coverage from the start | — Pending |

---
*Last updated: 2026-03-05 after initialization*
