# Pitfalls Research

**Domain:** Multi-platform live stream discovery in an Electron app
**Researched:** 2026-03-05
**Confidence:** MEDIUM-HIGH

## Critical Pitfalls

### Pitfall 1: Unofficial API Breakage Cascade

**What goes wrong:**
TikTok, Instagram, and Facebook have no stable public APIs for live stream discovery. Unofficial packages (scrapers, reverse-engineered endpoints) break regularly when platforms update their anti-bot measures or internal APIs. When one breaks, operators lose a third of their discovery surface. When multiple break simultaneously -- which happens when platforms coordinate anti-scraping updates -- the entire discovery feature appears broken.

**Why it happens:**
Developers treat unofficial APIs with the same reliability assumptions as official ones. They build tightly coupled UIs where a failed platform fetch cascades into error states that affect the entire discovery panel. The `youtubei` package (SuspiciousLookingOwl) has had a steady stream of "something isn't working" bugs throughout late 2024 and 2025 as YouTube changes its Innertube API surface. TikTok changes site structure constantly and actively breaks scrapers. Instagram uses canvas/WebGL fingerprinting, header order consistency checks, and TLS handshake analysis to detect non-browser clients. Facebook caps requests at 200/hour and uses aggressive IP monitoring.

**How to avoid:**
- Design a platform adapter interface where each platform is an independent module that can fail gracefully without affecting others. Use a health status enum per platform: `healthy | degraded | unavailable`.
- Show per-platform status indicators in the UI so operators know which platforms are working.
- Never let a single platform's error propagate to the `combineDataSources` pipeline -- catch and log at the adapter boundary.
- For TikTok/Instagram/Facebook, treat them as "best-effort" from day one. The UI should communicate this: "Experimental -- may stop working."
- Pin unofficial package versions and test before upgrading. Do not auto-update.

**Warning signs:**
- HTTP 403/429 responses increasing over time from a single platform
- Unofficial package's GitHub issues page filling with "broken" reports
- Successful responses returning empty or malformed data (silent breakage is worse than errors)
- Package hasn't been updated in 60+ days while the platform has shipped changes

**Phase to address:**
Phase 1 (platform adapter architecture). The adapter isolation pattern must be established before any platform integration begins. This is foundational, not an afterthought.

---

### Pitfall 2: Main Process Blocking from Synchronous Network Operations

**What goes wrong:**
All 6 platform APIs are polled from the Electron main process (per the project constraint that all network requests go through main). If any API call is synchronous or if too many concurrent requests pile up, the main process event loop blocks. This freezes the entire app: stream grid stops rendering, IPC messages queue up, XState machines stall, and the overlay/control windows become unresponsive.

**Why it happens:**
Electron's main process is a single-threaded Node.js event loop that also handles OS window events, GPU process coordination, and IPC routing. A blog post from the Actual Budget team documented how even a single blocking SQLite query made the entire UI unusable. An Electron bug report (issue #43186) showed that blocking the event loop for a few seconds causes subsequent network requests to fail with ECONNRESET.

**How to avoid:**
- Run all platform polling in a dedicated utility process or worker thread, not directly in the main process. Communicate results to the main process via MessagePort or IPC.
- If utility processes are too complex initially, use `Promise.allSettled()` with individual timeouts per platform (never `Promise.all()` -- one slow platform should not block others).
- Set hard per-request timeouts (10 seconds max). Platform APIs that exceed this get marked `degraded`.
- Stagger platform polls rather than firing all 6 simultaneously. Use a round-robin scheduler: poll one platform every N seconds rather than all platforms every 6N seconds.
- Never use synchronous `fs` or `net` operations in the main process polling code.

**Warning signs:**
- UI jank or freezing when discovery is active (especially noticeable in the stream grid overlay)
- IPC message latency increasing (control panel actions feel sluggish)
- `Ratelimit-Reset` headers from Twitch showing you are burning through rate limit budget too fast
- `process.hrtime()` measurements showing event loop delays > 50ms

**Phase to address:**
Phase 1 (architecture). The worker/utility process boundary must be decided before building platform adapters.

---

### Pitfall 3: Thumbnail Memory Leak in Long-Running Sessions

**What goes wrong:**
Discovery polling returns thumbnails for potentially hundreds of live streams across 6 platforms. In a long-running operator session (8-12 hours for event coverage), thumbnail images accumulate in Electron's WebCache. Memory climbs from 300MB to 800MB+ and never comes back down. Eventually the app crashes or becomes unusable.

**Why it happens:**
Electron's Chromium WebCache does not expose `SetCapacity()` to JavaScript. Once images are loaded into a renderer process, the cache holds them even after DOM elements are removed. Electron issue #27071 documents that WebContents objects leak memory even after being destroyed. The existing Streamwall architecture already manages N WebContentsViews for stream grid slots -- adding a discovery panel with constantly refreshing thumbnails multiplies this problem.

**How to avoid:**
- Render thumbnails in the control panel renderer only (not in additional WebContentsViews). The control panel is a single Preact page -- keep it that way.
- Use `<img>` tags with explicit `loading="lazy"` and remove DOM nodes for off-screen streams (virtual list). Only render thumbnails for visible streams in the discovery list.
- Implement a thumbnail cache with an LRU eviction policy at the application level. Store thumbnails as base64 data URLs in a bounded Map (max 200 entries). Fetch new thumbnails through the main process and pass them via IPC.
- Periodically call `webContents.session.clearCache()` on the control panel's session (e.g., every 30 minutes) to flush Chromium's internal cache.
- Set `Content-Security-Policy` to prevent the control renderer from loading images directly from platform CDNs -- force all image loading through the main process cache.

**Warning signs:**
- `process.memoryUsage().rss` climbing steadily over hours without plateau
- Control panel renderer's `performance.memory.usedJSHeapSize` growing
- Task Manager showing Electron helper processes consuming > 500MB each
- Operator reports of sluggishness after 2+ hours of use

**Phase to address:**
Phase 2 (UI implementation). Must be designed into the discovery panel from the start, not bolted on after thumbnails are already rendering via direct URLs.

---

### Pitfall 4: Rate Limit Miscalculation Across Platforms

**What goes wrong:**
Each platform has different rate limiting models. Twitch uses a token-bucket system (800 points/minute). YouTube Innertube has very high implicit limits but can IP-ban aggressive clients. Kick's public API has undocumented limits. TikTok/Instagram/Facebook will silently block or serve empty data. Developers set a single "poll interval" slider and assume it applies uniformly, but a 5-second interval across 6 platforms means 72 requests/minute to Twitch alone (search + pagination + liveness checks), which will quickly exhaust the 800-point bucket.

**Why it happens:**
The project spec calls for a configurable fetch interval (5s-10m slider) and a separate liveness check interval (default 30s). Developers multiply: 6 platforms x 1 search request + N liveness checks per platform = actual request rate far exceeding what the slider suggests. Twitch pagination is particularly tricky: Get Streams orders by viewer count, and if viewership changes between pages, streams can appear on multiple pages or be missed entirely.

**How to avoid:**
- Implement per-platform rate limiters, not a single global interval. Each platform adapter manages its own request budget.
- Display actual requests/minute in the settings UI so operators understand the true cost of their interval settings.
- For Twitch: read `Ratelimit-Remaining` and `Ratelimit-Reset` headers and dynamically back off. Use client credentials flow (required -- Twitch Helix does not work without at least an app access token, despite the PROJECT.md claiming "no auth required").
- For YouTube Innertube: start with 60-second minimum intervals. While Innertube does not have documented rate limits, YouTube has been aggressively blocking third-party clients (Invidious instances have largely been taken down).
- Set floor intervals per platform: Twitch 30s, YouTube 60s, Kick 30s, TikTok 120s, Instagram 120s, Facebook 120s. The UI slider should not go below these floors.
- Separate "discovery polling" from "liveness checking." Liveness checks are cheaper (single stream status) and can run more frequently than full search queries.

**Warning signs:**
- HTTP 429 responses from any platform
- Twitch `Ratelimit-Remaining` header dropping below 100
- Empty result sets from platforms that previously returned data (silent rate limiting)
- YouTube returning CAPTCHA challenges or consent pages instead of API responses

**Phase to address:**
Phase 1 (platform adapters). Rate limiting must be built into the adapter interface, not added per-platform ad hoc.

---

### Pitfall 5: "No Auth Required" Assumption for Twitch and Kick

**What goes wrong:**
The PROJECT.md states "Twitch: public API (no auth required)" and "Kick: public API (no auth required)." This is incorrect for Twitch. All Twitch Helix API endpoints require at minimum an app access token obtained via the client credentials OAuth flow. This requires registering an app on the Twitch Developer Console to get a client ID and client secret. The app will not work out of the box without this step.

**Why it happens:**
Confusion between "no user login required" (true -- client credentials flow does not require a Twitch user to log in) and "no credentials required" (false -- you need a registered app's client ID and secret). Kick's API similarly launched with public access but may require API keys as their developer program matures.

**How to avoid:**
- For Twitch: require a client ID and client secret in the settings UI. Provide clear instructions linking to https://dev.twitch.tv/console/apps for app registration. Use the client credentials grant flow (`grant_type=client_credentials`) to obtain app access tokens.
- For Kick: verify current auth requirements against https://docs.kick.com before implementation. Their API added features like `custom_tags` on livestreams endpoints in November 2025 -- the auth model may have changed.
- Update the project requirements to distinguish "no user login" from "no API credentials." Twitch and Kick should be listed as "requires app registration (free, no user login)."
- Ship the app with a first-run setup wizard that guides operators through obtaining free API credentials for Twitch (and Kick if needed).

**Warning signs:**
- HTTP 401 responses from Twitch Helix endpoints
- Confusion in user bug reports about "it doesn't work without a key"
- Kick API returning 403 after their developer program adds auth requirements

**Phase to address:**
Phase 0 (requirements correction). This must be clarified before architecture work begins, as it affects the settings UI design and the "works out of the box" constraint.

---

### Pitfall 6: Polling Storms During Filter Changes

**What goes wrong:**
When an operator changes search filters (keywords, tags, language), the naive implementation immediately re-polls all platforms with the new filters. If the operator is typing a search term, each keystroke triggers 6 platform API calls. With a 3-character minimum and fast typing, this generates 20-30 requests in seconds.

**Why it happens:**
Developers wire filter changes directly to the polling function without debouncing. The existing Streamwall data pipeline uses async generators (`Repeater`) that emit on every state change -- connecting filter UI state changes to these generators without throttling creates request storms.

**How to avoid:**
- Debounce filter changes by 500ms minimum before triggering any API calls.
- Treat filter changes as "reset and re-poll" rather than "poll additionally." Cancel in-flight requests for the old filter before issuing new ones.
- Show a "Searching..." state in the UI during the debounce period so operators know their input was received.
- Use `AbortController` for all fetch requests so in-flight requests from stale filters can be cancelled.

**Warning signs:**
- Network tab showing rapid-fire duplicate requests to the same platform
- Rate limit exhaustion shortly after filter changes
- Stale results appearing briefly before being replaced (race conditions between old and new filter responses)

**Phase to address:**
Phase 2 (UI integration with polling). Debounce logic belongs in the IPC bridge between the control panel renderer and the main process polling scheduler.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single polling loop for all platforms | Simpler implementation | Cannot tune per-platform intervals, one slow platform blocks others | Never -- per-platform loops from day one |
| Direct CDN thumbnail URLs in `<img>` src | Fast to implement | Memory leaks, CORS issues, broken images when CDN URLs expire | MVP only, replace with cached proxy in phase 2 |
| Hardcoded platform list | Fewer abstractions | Adding platform 7 requires touching every layer | Acceptable if adapter interface is clean |
| Storing discovery state in component state | Quick UI | Lost on window reload, cannot sync across operators later | MVP only, migrate to Yjs in phase 3 |
| Skipping liveness checks (relying only on discovery poll) | Fewer API calls | Stale "live" streams shown for minutes after they end | Never -- liveness checks are core UX |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| YouTube Innertube (`youtubei`) | Assuming it is as stable as an official API | Pin version, wrap in try/catch, have fallback to official Data API v3, monitor GitHub issues weekly |
| Twitch Helix | Assuming no auth is needed | Register app, use client credentials flow, refresh tokens before expiry (tokens are not permanent) |
| Twitch Helix pagination | Iterating all pages to get complete results | Stop after 2-3 pages (top streams by viewer count). Pagination is unreliable as viewer counts shift between requests |
| Kick API | Assuming endpoints are stable (API launched recently) | Check docs.kick.com changelog before each release, version your adapter |
| TikTok scrapers | Using browser automation (Puppeteer/Playwright) in Electron | Avoid -- spawning Chromium inside Chromium is a resource disaster. Use HTTP-based scrapers only |
| Instagram scraper | Making requests that look like an API client | Instagram detects non-browser clients via header order, TLS fingerprint, and missing correlated requests (CSS/images/analytics). Any HTTP-only approach will be fragile |
| Facebook scraper | Expecting public data to be accessible without login | Facebook hides most live stream data behind login walls. Public endpoint access is severely limited (200 req/hour) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling all 6 platforms simultaneously | Event loop spikes, UI jank, burst of network connections | Stagger polls: one platform every 5 seconds in round-robin | Immediately noticeable with 5s poll interval |
| Rendering 200+ stream cards with thumbnails | Scroll jank, memory growth, control panel unresponsive | Virtual list (render only visible items), lazy image loading | Beyond 50 streams in the discovery list |
| Storing full stream metadata for all discovered streams | Memory growth, GC pauses | Cap stored streams at 500, LRU evict oldest. Only store display-critical fields | After 2+ hours of polling with broad filters |
| JSON serialization of large discovery state over IPC | IPC latency, main process blocked during serialization | Send diffs, not full state. Or use SharedArrayBuffer/MessagePort | Beyond 100 streams being synced per update |
| Keeping WebContentsView references for removed streams | Memory leak, process count growth | Explicitly destroy WebContents and null references. Verify with `webContents.getAllWebContents().length` | After 20+ streams cycled through the grid |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing API keys in plain text in config TOML | Keys leaked if config shared or repo committed | Use Electron's `safeStorage` API to encrypt API keys at rest. Decrypt only in main process memory |
| Loading platform thumbnails directly in renderer via CDN URLs | Renderer has network access to arbitrary domains, potential for XSS via crafted image URLs | Proxy all images through main process. Renderer loads only data URLs or local cached files |
| Passing unsanitized stream titles to renderer DOM | XSS via crafted stream titles (platforms allow HTML-like characters) | Sanitize all platform-sourced strings before sending via IPC. Preact's JSX escapes by default, but `dangerouslySetInnerHTML` must never be used for stream metadata |
| Unofficial scraper packages running arbitrary code | Supply chain attack via compromised npm package | Audit unofficial packages before adoption. Pin exact versions. Review changelogs before updating |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback when a platform is down | Operator thinks no one is streaming | Show per-platform health badges (green/yellow/red) with last-successful-fetch timestamp |
| Showing stale "live" streams that have ended | Operator assigns dead stream to grid, sees loading spinner forever | Liveness check before grid assignment. Show "last verified" timestamp on each stream card |
| Single combined stream list across all platforms | Hard to scan, platform-specific context lost | Tabbed interface per platform (as specified in requirements). Also allow an "All" tab with platform icons on each card |
| Aggressive auto-remove of offline streams | Stream that had a brief disconnect disappears from operator's view | Grace period (2-3 failed liveness checks) before removal. Show "may be offline" warning state first |
| Poll interval slider without showing actual request count | Operator sets 5s interval not realizing it generates 720 requests/minute across platforms | Show "~X requests/minute" next to the slider, updating in real-time as the slider moves |

## "Looks Done But Isn't" Checklist

- [ ] **YouTube discovery:** Works without API key -- verify it still works after YouTube's next anti-bot update (test monthly)
- [ ] **Twitch discovery:** Returns results -- verify token refresh logic handles expired tokens without user intervention
- [ ] **Liveness checks:** Streams marked live -- verify they are actually still live (not cached status from discovery poll)
- [ ] **Thumbnail loading:** Images display -- verify memory does not grow unbounded after 4 hours of operation
- [ ] **Filter changes:** New results appear -- verify old stale results are fully cleared (no ghost entries from previous filters)
- [ ] **Platform failure:** One platform errors -- verify other 5 platforms continue operating normally
- [ ] **Rate limiting:** App runs fine for 10 minutes -- verify it runs fine for 8 hours without hitting rate limits
- [ ] **Offline detection:** Streams removed when offline -- verify streams with brief interruptions are not prematurely removed
- [ ] **IPC performance:** Discovery data reaches control panel -- verify no perceptible lag when 200+ streams are being synced

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Unofficial API breaks (TikTok/IG/FB) | LOW | Disable affected platform adapter, show "unavailable" in UI, wait for package update or find alternative package |
| Main process blocking | MEDIUM | Refactor polling into utility process. Requires new IPC channel design but existing adapter code can be reused |
| Memory leak from thumbnails | MEDIUM | Add virtual list + LRU cache. Requires UI refactor of discovery list but does not affect platform adapters |
| Rate limit exhaustion | LOW | Increase per-platform floor intervals, add exponential backoff. Configuration change, minimal code |
| Twitch auth misconfiguration | LOW | Add client credentials flow. Small code change but requires updating docs and first-run UX |
| Polling storm on filter change | LOW | Add debounce + AbortController. Localized fix in IPC bridge layer |
| Supply chain compromise of unofficial package | HIGH | Audit damage, revoke any exposed credentials, pin to last-known-good version, consider removing platform support |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Twitch auth requirement | Phase 0 (requirements) | Confirm Helix endpoints work with app access token before architecture design |
| Unofficial API breakage cascade | Phase 1 (adapter architecture) | Each adapter can be disabled independently; UI shows per-platform status |
| Main process blocking | Phase 1 (architecture) | Polling runs in worker/utility process; main process event loop delay stays < 16ms |
| Rate limit miscalculation | Phase 1 (adapter interface) | Each adapter has independent rate limiter; floor intervals enforced |
| Thumbnail memory leak | Phase 2 (UI implementation) | Memory stays flat (within 50MB variance) over 4-hour test run |
| Polling storm on filter change | Phase 2 (UI integration) | Filter change generates at most 6 API calls (one per platform) regardless of typing speed |
| Stale stream display | Phase 2 (liveness checks) | Streams verified offline within 90 seconds of actually going offline |
| Platform failure isolation | Phase 3 (hardening) | Kill one platform's network (hosts file block) and verify others continue |
| Long-session stability | Phase 3 (hardening) | 8-hour soak test with all 6 platforms active, memory and request rate within bounds |

## Sources

- [Twitch API Rate Limiting Guide](https://dev.twitch.tv/docs/api/guide) -- Official rate limit documentation (token bucket, 800 points/minute)
- [Twitch Developer Forums: Token Expiry and Rate Limits](https://discuss.dev.twitch.com/t/issues-with-twitch-api-token-expiry-rate-limits-and-inconsistent-stream-data/64260) -- Real-world issues with token management
- [Twitch Authentication Docs](https://dev.twitch.tv/docs/authentication/) -- Client credentials flow requirement
- [Electron Performance Guide](https://www.electronjs.org/docs/latest/tutorial/performance) -- Official guidance on main process blocking
- [The Horror of Blocking Electron's Main Process](https://medium.com/actualbudget/the-horror-of-blocking-electrons-main-process-351bf11a763c) -- Real-world case study
- [Electron Issue #43186: Network requests fail after event loop block](https://github.com/electron/electron/issues/43186) -- ECONNRESET regression
- [Electron Issue #27071: WebContents leaks after destroying](https://github.com/electron/electron/issues/27071) -- Memory leak documentation
- [TikTokLive Python Library](https://github.com/isaackogan/TikTokLive) -- Unofficial TikTok live API, documents fragility
- [Instagram Scraping in 2025](https://scrapecreators.com/blog/instagram-scraping-in-2025-the-workarounds-that-still-work) -- Detection mechanisms
- [Kick Developer Docs](https://dev.kick.com/) -- Official public API
- [Kick Dev Docs GitHub](https://github.com/KickEngineering/KickDevDocs) -- API changelog and updates
- [Youtubei GitHub Issues](https://github.com/SuspiciousLookingOwl/youtubei/issues) -- Ongoing breakage reports
- [YouTube.js (LuanRT)](https://github.com/LuanRT/YouTube.js) -- Alternative Innertube client, more actively maintained
- [YouTube IP Ban Guide](https://multilogin.com/blog/youtube-ip-ban/) -- YouTube blocking third-party clients

---
*Pitfalls research for: Multi-platform live stream discovery in Electron*
*Researched: 2026-03-05*
