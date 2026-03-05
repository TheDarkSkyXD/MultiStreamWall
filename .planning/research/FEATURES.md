# Feature Research

**Domain:** Live stream discovery and aggregation for a multi-stream mosaic wall
**Researched:** 2026-03-05
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-platform search | Every stream aggregator covers at least Twitch + YouTube; single-platform defeats the purpose | HIGH | 6 platforms with different APIs/scraping approaches. YouTube (youtubei), Twitch, Kick have clean paths; TikTok/Instagram/Facebook are fragile |
| Keyword/title filtering | Twitch browse, YouTube search -- users expect text-based filtering as baseline | LOW | Simple string matching on title/tags. Global defaults + per-platform overrides add minor complexity |
| Live stream thumbnails | Every platform's browse page shows thumbnails; text-only lists feel broken | MEDIUM | Thumbnails come from platform APIs. Need to handle missing/stale thumbnails gracefully |
| Viewer count display | Universal metric across all platforms; primary sort signal for discovery | LOW | Available from all platform APIs. Display as formatted number with platform-appropriate icons |
| Stream metadata (title, channel, platform) | Basic information users need to decide what to watch | LOW | Already exists in `StreamData` type; extend with discovery-specific fields |
| One-click add to grid | Core value proposition -- discovery without this is just a browser | LOW | Map to existing `combineDataSources` pipeline; auto-assign to first empty view slot |
| Auto-refresh / polling | Live streams change constantly; stale results are useless | MEDIUM | Configurable interval (5s to 10m). Must respect platform rate limits. Separate discovery poll from liveness check |
| Offline stream removal | Streams end; keeping dead streams in grid wastes slots and confuses operators | MEDIUM | Separate liveness check interval (default 30s). Remove from grid, mark in discovery list |
| Platform tabs/sections | Users think in platforms ("show me Twitch streams"); mixed lists are disorienting | LOW | Tab UI with platform icons. Each tab shows results from one platform with platform-specific metadata |
| Open stream externally | Sometimes operators need to check a stream in browser before adding to grid | LOW | "Link" button launching default browser. Already exists as `browse` command type |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Integrated mosaic preview | Unlike web-based multi-viewers (multistream.me, streamscharts), Streamwall renders streams in native Electron views with proper video extraction -- no iframe jank | LOW | Already exists in Streamwall core. Discovery just needs to feed streams into existing pipeline |
| Per-platform filter overrides | Global "protest" keyword + Twitch-specific "IRL" tag + YouTube-specific category. No competitor does per-platform filter customization in a mosaic tool | MEDIUM | UI for global defaults with platform-level overrides. Store in settings alongside existing TOML config |
| Language-based filtering | Twitch users have complained about poor language filtering for years (UserVoice thread from 2015 still open). Cross-platform language filtering is genuinely useful for international monitoring | LOW | Most APIs return language metadata. Filter at aggregation layer. Default language setting in preferences |
| Drag-to-reposition after auto-assign | Auto-assign gets streams on screen fast; drag lets operators curate layout. Broadcast monitoring tools (Actus MV, DVBMosaic) have this but web multi-viewers don't | LOW | Already exists in Streamwall. Discovery auto-assigns; existing drag-and-drop handles repositioning |
| Graceful platform degradation | If TikTok scraping breaks, other platforms keep working. No competitor handles this well -- they either work or don't | MEDIUM | Per-platform health status indicator. Disabled platforms shown as greyed-out tabs with error message. No crash propagation |
| Configurable dual-interval polling | Separate discovery interval (find new streams) from liveness interval (check if existing streams are still live). Reduces API load while keeping grid fresh | LOW | Two sliders in settings. Discovery poll can be slow (5m); liveness check stays fast (30s) |
| Unified audio control across discovered streams | Broadcast monitoring tools have per-channel audio; web multi-viewers only unmute one at a time. Streamwall already has muted/listening/background audio states | LOW | Already exists. XState audio states (muted/listening/background) apply to discovered streams automatically |
| Optional API key upgrade path | Works without keys (youtubei, public APIs) but accepts optional keys for higher rate limits. No other mosaic tool offers this progressive enhancement | LOW | Settings UI for optional YouTube Data API v3 key. Graceful fallback if key is invalid or quota exceeded |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Chat integration | "I want to see chat alongside streams" | Massive scope expansion. Each platform has different chat APIs, authentication requirements, and rate limits. Chat rendering is a full product in itself | Open stream in browser via "Link" button for chat access. Defer to future milestone if demand is clear |
| Stream recording/DVR | "Record interesting streams for later" | Storage management, encoding complexity, legal concerns with rebroadcasting. Completely different product domain | Use existing tools (OBS, yt-dlp) alongside Streamwall. Out of scope per PROJECT.md |
| AI-powered recommendations | "Suggest streams I might like" | Requires viewing history, ML infrastructure, and meaningful training data. Over-engineered for an operator tool | Good keyword/tag filtering covers 90% of the use case. Operator judgment is the "recommendation engine" |
| Real-time viewer analytics | "Show me viewer count trends and charts" | Analytics is a separate product (Streams Charts exists for this). Adds database requirements, charting libraries, historical data storage | Show current viewer count. Link to Streams Charts or SullyGnome for deep analytics |
| Multi-operator collaborative discovery | "Multiple operators browse and curate together" | Yjs infrastructure exists but discovery state sync adds significant complexity: conflict resolution for filters, shared vs personal views, permission models | Single-operator discovery for v1. Yjs foundation makes future collaboration possible. Out of scope per PROJECT.md |
| Automatic stream quality selection | "Always pick the best quality" | Platform-specific quality APIs differ wildly. HLS quality selection is already handled by hls.js. WebContentsView streams use platform default | Let platforms auto-select quality. HLS streams already use hls.js adaptive bitrate |
| Notification system for new streams | "Alert me when a stream matching my filters goes live" | Desktop notifications are noisy for an always-on monitoring tool. Operator is already watching the discovery panel | New streams appear at top of discovery list with visual highlight (new badge). No system notifications |
| Follow/favorite channels across platforms | "Track specific channels I care about" | Requires persistent storage, platform-specific channel resolution, and essentially building a cross-platform follow system | Use TOML/JSON stream sources for known channels (already supported). Discovery is for finding NEW streams |

## Feature Dependencies

```
[Multi-platform API integration]
    |-- requires --> [Platform-specific adapters (YouTube, Twitch, Kick, TikTok, Instagram, Facebook)]
    |                   |-- requires --> [Rate limiting infrastructure]
    |                   |-- requires --> [Error handling / graceful degradation]
    |
    |-- feeds --> [Discovery results list]
                    |-- requires --> [Keyword/tag filtering]
                    |-- requires --> [Stream metadata display (thumbnail, title, viewer count)]
                    |-- enables --> [One-click add to grid]
                    |                   |-- requires --> [Auto-assign to empty view slot]
                    |                   |-- enhances --> [Drag-to-reposition (existing)]
                    |
                    |-- enables --> [Platform tabs UI]
                    |                   |-- enhances --> [Per-platform filter overrides]
                    |
                    |-- enables --> [Auto-refresh polling]
                                      |-- enables --> [Liveness checking]
                                                        |-- enables --> [Offline stream removal]

[Settings UI]
    |-- enables --> [Configurable polling intervals]
    |-- enables --> [Optional API key entry]
    |-- enables --> [Language filter defaults]
    |-- enables --> [Global + per-platform filter config]

[Platform tabs UI] -- conflicts -- [Mixed unified list]
    (Pick one paradigm: tabs won per PROJECT.md requirements)
```

### Dependency Notes

- **Discovery results require platform adapters:** Each platform is an independent data source. Start with the three stable platforms (YouTube, Twitch, Kick) before tackling fragile ones (TikTok, Instagram, Facebook).
- **One-click add requires auto-assign logic:** Need to find empty view slots in the existing Yjs `views` map and assign the discovered stream. Leverages existing `combineDataSources` pipeline.
- **Liveness checking requires polling infrastructure:** Built on the same polling mechanism as discovery, but with a separate interval. Can reuse the same timer/scheduler architecture.
- **Settings UI enables progressive configuration:** API keys, intervals, filters, and language all live in settings. This is a horizontal dependency -- build settings UI early so each feature can plug into it.
- **Per-platform filter overrides enhance keyword filtering:** Base filtering must work before per-platform overrides make sense. Build global filters first, then add override layer.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept.

- [ ] YouTube discovery via youtubei (no API key required) -- highest-value platform, proves the pipeline
- [ ] Twitch discovery via public API -- second-highest value, stable API
- [ ] Kick discovery via public API -- third stable platform, rounds out the "big three"
- [ ] Keyword filtering (global) -- basic discovery requires filtering by topic
- [ ] Stream metadata display (thumbnail, title, channel, viewer count) -- users need info to choose streams
- [ ] Platform tabs in control panel -- organize results by platform
- [ ] One-click "Watch" button to add stream to grid -- core value proposition
- [ ] Auto-refresh polling with configurable interval -- live data must stay fresh
- [ ] Liveness checking with auto-removal -- dead streams must not persist in grid
- [ ] "Link" button to open stream URL externally -- escape hatch for checking streams

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] TikTok live discovery -- add once stable platform pipeline is proven; fragile scraping approach needs careful error handling
- [ ] Instagram live discovery -- same fragility concerns as TikTok; add in same phase
- [ ] Facebook live discovery -- same fragility concerns; add in same phase
- [ ] Per-platform filter overrides -- add once users are actively using global filters and want more control
- [ ] Language-based filtering -- add once metadata availability is confirmed across platforms
- [ ] Optional YouTube Data API v3 key support -- add when users hit youtubei rate limits
- [ ] Settings persistence (save/load filter configs) -- add once settings UI is stable

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Multi-operator collaborative discovery -- Yjs foundation exists but scope is large
- [ ] Stream health metrics (buffering, quality indicators) -- useful for broadcast monitoring use cases
- [ ] Saved filter presets (e.g., "Protest streams", "Gaming streams") -- convenience feature once patterns emerge
- [ ] UI localization / multi-language interface -- important for international users but not blocking

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| YouTube discovery (youtubei) | HIGH | MEDIUM | P1 |
| Twitch discovery (public API) | HIGH | LOW | P1 |
| Kick discovery (public API) | HIGH | LOW | P1 |
| Keyword filtering (global) | HIGH | LOW | P1 |
| Stream metadata display | HIGH | LOW | P1 |
| Platform tabs UI | HIGH | MEDIUM | P1 |
| One-click add to grid | HIGH | LOW | P1 |
| Auto-refresh polling | HIGH | MEDIUM | P1 |
| Liveness checking + auto-removal | HIGH | MEDIUM | P1 |
| Open stream externally | MEDIUM | LOW | P1 |
| TikTok discovery | MEDIUM | HIGH | P2 |
| Instagram discovery | MEDIUM | HIGH | P2 |
| Facebook discovery | MEDIUM | HIGH | P2 |
| Per-platform filter overrides | MEDIUM | MEDIUM | P2 |
| Language filtering | MEDIUM | LOW | P2 |
| Optional API key support | MEDIUM | LOW | P2 |
| Settings persistence | MEDIUM | LOW | P2 |
| Multi-operator discovery | LOW | HIGH | P3 |
| Saved filter presets | LOW | LOW | P3 |
| UI localization | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- the three stable platforms, filtering, grid integration, polling
- P2: Should have, add when possible -- fragile platforms, advanced filtering, API key upgrades
- P3: Nice to have, future consideration -- collaboration, presets, localization

## Competitor Feature Analysis

| Feature | Multistream.me / Multiwatch.net | Streams Charts Multi-View | StreamPulse Extension | Actus MV (Broadcast) | Streamwall + Discovery |
|---------|-------------------------------|--------------------------|----------------------|---------------------|----------------------|
| Multi-platform streams | Yes (embed iframes) | Yes (up to 9) | Twitch/Kick/DLive only | Professional broadcast inputs | Yes (6 platforms, native views) |
| Stream discovery/search | No (manual URL entry) | No (manual URL entry) | Follow notifications only | No (configured inputs) | Yes (keyword search across platforms) |
| Filtering by keyword/tag | No | No | No | No | Yes (global + per-platform) |
| Language filtering | No | No | No | No | Yes |
| Thumbnails in browse | N/A | N/A | Channel list only | N/A | Yes |
| Auto-remove offline | No | No | Notification when offline | Alert only | Yes (auto-remove from grid) |
| Audio control | One stream at a time | First stream only | N/A | VU meters per channel | Per-view mute/listen/background |
| Grid layout | Auto 2x2 to 3x3 | Auto grid | N/A | Configurable mosaic | Configurable grid with drag |
| Desktop native | No (web) | No (web) | Browser extension | Yes (professional hardware) | Yes (Electron) |
| No API key required | N/A | N/A | N/A | N/A | Yes (YouTube/Twitch/Kick) |

**Key insight:** No existing tool combines multi-platform stream *discovery* with a native mosaic *display*. Web multi-viewers require manual URL entry. Broadcast monitoring tools require professional setup. StreamPulse only notifies about followed channels. Streamwall with discovery fills a genuine gap: find streams across platforms and watch them in a grid, all in one tool.

## Sources

- [Streams Charts Multi-View](https://streamscharts.com/tools/multistream-viewer) -- web-based multi-stream viewer features
- [Multistream.me](https://multistream.me/) -- web multi-platform stream viewer
- [StreamPulse Chrome Extension](https://chromewebstore.google.com/detail/streampulse-twitch-kick-d/ipfhbfabadbpkjimhdcjadopnahdpddh) -- cross-platform stream monitoring extension
- [Actus Digital Multiviewer](https://actusdigital.com/multiviewer-mosaic-and-technical-monitoring/) -- professional broadcast mosaic monitoring
- [Twitch Tags and Categories blog post](https://blog.twitch.tv/en/2018/09/26/introducing-tags-and-new-categories-new-ways-to-discover-streamers-on-twitch-33744ef7b04f/) -- Twitch discovery features
- [Twitch Language Filter UserVoice](https://twitch.uservoice.com/forums/310210-discover/suggestions/9483939-language-filter) -- long-standing user request for language filtering
- [Restream Features Guide](https://restream.io/blog/restream-tools-and-features/) -- multistreaming platform feature reference
- [Multiwatch.net](https://multiwatch.net/) -- web multi-stream viewer
- [Streamer.Guide Multiwatch](https://streamer.guide/tools/multiwatch) -- web multi-stream viewer tool

---
*Feature research for: Live stream discovery and aggregation*
*Researched: 2026-03-05*
