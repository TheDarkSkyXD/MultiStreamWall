# Stack Research: Live Stream Discovery

**Domain:** Multi-platform live stream discovery for Electron desktop app
**Researched:** 2026-03-05
**Confidence:** MEDIUM (official APIs are HIGH, unofficial platforms are LOW)

## Recommended Stack

### Platform SDKs / API Clients

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `youtubei.js` | ^16.0.1 | YouTube live stream search via Innertube API | Most actively maintained Innertube wrapper (LuanRT/YouTube.js). No API key required. Supports search with type filters, live chat, live stats. 11k+ GitHub stars, releases every few weeks. The PROJECT.md references `youtubei` (different package) but `youtubei.js` is superior in every dimension: maintenance, features, community. | HIGH |
| `@twurple/api` + `@twurple/auth` | ^8.0.3 | Twitch stream search and metadata | De facto standard Node.js Twitch API client. Typed, well-documented, actively maintained (released 21 days ago). Provides `streams.getStreams()` and `search.searchChannels()` with language/game filters. Requires app registration (free) for client credentials -- NOT truly "no auth" but the client credentials flow is automated (no user login). | HIGH |
| Direct HTTP (fetch) | N/A | Kick livestream search | Kick launched a public API (docs.kick.com) in 2025 with a `/livestreams` endpoint. Requires app registration for OAuth client credentials (same pattern as Twitch). No mature Node.js SDK exists -- use native `fetch` with a thin wrapper. The API is new and still expanding; check docs.kick.com for current endpoints. | MEDIUM |
| Direct HTTP (fetch) | N/A | TikTok live stream discovery | No reliable npm package exists for *discovering* TikTok live streams by keyword. `tiktok-live-connector` only connects to a known username's stream -- it cannot search. TikTok has aggressive anti-scraping. Best approach: reverse-engineer TikTok's web search endpoint (`/api/search/live/`) with appropriate headers, or use Playwright for rendering. This is the most fragile integration. | LOW |
| `instagram-private-api` | ^1.46.1 | Instagram live stream discovery | The only Node.js Instagram private API with live broadcast support. Written in TypeScript. However: last published 2+ years ago, requires Instagram login credentials (risk of account ban), and the FeedFactory does NOT expose a dedicated live discovery feed -- you would need to use the discover/explore feed and filter for live content. Fragile and legally gray. | LOW |
| Direct HTTP (fetch) | N/A | Facebook live video discovery | No viable npm package exists. `facebook-unofficial-api` has 0 weekly downloads and no live video features. Facebook Graph API requires app review for public content search. Best approach: scrape Facebook's public search (`facebook.com/search/videos/?q=...&filters=live`) via headless browser. Extremely fragile. | LOW |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `youtubei.js` | ^16.0.1 | YouTube Data API v3 fallback | When user provides an API key for higher rate limits. `youtubei.js` supports both Innertube (default) and authenticated requests. Alternatively, use direct fetch to `googleapis.com/youtube/v3/search?type=video&eventType=live` with API key. |
| `playwright` | ^1.50 | Headless browser for scraping TikTok/Facebook | When direct HTTP reverse-engineering fails due to anti-bot measures. Playwright has 96% success rate vs Puppeteer's 75% on JS-heavy sites. Use `playwright-core` to avoid bundling browsers (Electron already has Chromium). |
| `p-throttle` | ^6.2 | Rate limiting outbound API calls | Always -- wrap every platform client to respect rate limits. Configurable per-platform. |
| `p-retry` | ^6.2 | Retry failed API calls with backoff | Always -- network requests to 6 platforms will intermittently fail. |
| `zod` | ^3.24 | Runtime validation of API responses | Always -- unofficial APIs return unpredictable shapes. Validate before passing to the app. |

### YouTube Data API v3 (Optional Fallback)

No additional package needed. When the user provides a YouTube Data API v3 key in settings, make direct fetch calls:

```
GET https://www.googleapis.com/youtube/v3/search
  ?part=snippet
  &type=video
  &eventType=live
  &q={query}
  &key={API_KEY}
  &relevanceLanguage={lang}
  &maxResults=50
```

This avoids Innertube rate limits and is more reliable for high-frequency polling. The `youtubei.js` Innertube path remains the zero-config default.

## Installation

```bash
# Core platform clients
npm install youtubei.js@latest @twurple/api@latest @twurple/auth@latest

# Resilience utilities
npm install p-throttle p-retry zod

# Optional: headless browser for TikTok/Facebook scraping
npm install playwright-core
```

## Platform-by-Platform Details

### YouTube (HIGH confidence)

**Package:** `youtubei.js` (npm: `youtubei.js`, GitHub: LuanRT/YouTube.js)
**Auth required:** No (Innertube) / Yes, API key (Data API v3 fallback)
**How discovery works:**

```typescript
import { Innertube } from 'youtubei.js';
const yt = await Innertube.create();
const results = await yt.search('keyword', { type: 'video', features: ['live'] });
// Returns titles, channel names, view counts, thumbnails, video IDs
```

**Rate limits:** Innertube has undocumented rate limits. Polling every 60s is safe. Every 5s risks temporary blocks.
**Reliability:** HIGH -- Innertube is YouTube's own internal API, unlikely to disappear. `youtubei.js` tracks changes actively.

### Twitch (HIGH confidence)

**Package:** `@twurple/api` + `@twurple/auth`
**Auth required:** Yes -- free app registration at dev.twitch.tv for client_id + client_secret. Uses client credentials flow (no user login).
**How discovery works:**

```typescript
import { ApiClient } from '@twurple/api';
import { AppTokenAuthProvider } from '@twurple/auth';

const auth = new AppTokenAuthProvider(clientId, clientSecret);
const api = new ApiClient({ authProvider: auth });

// Search channels by query
const channels = await api.search.searchChannels('keyword');

// Get live streams with filters
const streams = await api.streams.getStreams({
  language: 'en',
  game: '509658', // optional game/category ID
});
```

**Rate limits:** 800 requests per minute with app access token. Generous.
**Reliability:** HIGH -- official API, stable, well-documented.
**Note:** The PROJECT.md says "no auth required" but Twitch requires a registered app (free). The client credentials flow is fully automated with no user interaction -- functionally similar to "no auth" from the operator's perspective, but the app must be registered once.

### Kick (MEDIUM confidence)

**Package:** None (direct HTTP fetch)
**Auth required:** Yes -- app registration at kick.com for OAuth client credentials. Same pattern as Twitch.
**How discovery works:**

```typescript
// Get app access token
const tokenRes = await fetch('https://id.kick.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: KICK_CLIENT_ID,
    client_secret: KICK_CLIENT_SECRET,
  }),
});
const { access_token } = await tokenRes.json();

// Fetch livestreams
const streams = await fetch('https://api.kick.com/public/v1/livestreams', {
  headers: { Authorization: `Bearer ${access_token}` },
});
```

**Rate limits:** Not well documented. Be conservative (poll every 60s+).
**Reliability:** MEDIUM -- API launched April 2025, still expanding. Endpoints may change. No search/filter endpoint confirmed yet (may need to fetch all and filter client-side).

### TikTok (LOW confidence)

**Package:** None suitable for discovery. `tiktok-live-connector` only connects to known usernames.
**Auth required:** N/A (reverse-engineered endpoints)
**How discovery works:**

Option A -- Reverse-engineer TikTok's web API:
```typescript
// TikTok's web search has an internal API endpoint
// URL pattern: https://www.tiktok.com/api/search/live/full/
// Requires specific headers (device_id, browser fingerprint cookies)
// EXTREMELY fragile -- changes frequently
```

Option B -- Playwright scraping:
```typescript
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.tiktok.com/search/live?q=keyword');
// Extract stream cards from DOM
```

**Rate limits:** Aggressive anti-bot. Expect CAPTCHAs and IP blocks.
**Reliability:** LOW -- TikTok actively fights scraping. This integration WILL break periodically. Must implement graceful degradation.

### Instagram (LOW confidence)

**Package:** `instagram-private-api` (npm, TypeScript, by dilame)
**Auth required:** Yes -- Instagram username + password (simulates mobile app login)
**How discovery works:**

```typescript
import { IgApiClient } from 'instagram-private-api';
const ig = new IgApiClient();
ig.state.generateDevice(username);
await ig.account.login(username, password);

// No dedicated live discovery feed exists
// Workaround: use discover/explore feed and filter for live items
const discoverFeed = ig.feed.discover();
const items = await discoverFeed.items();
// Filter for live broadcast items
```

**Rate limits:** Instagram aggressively rate-limits and bans accounts that make too many API calls. Use a dedicated burner account.
**Reliability:** LOW -- Package unmaintained (last publish 2+ years ago). Instagram frequently changes their private API. Account ban risk. No live-specific discovery endpoint.
**Legal risk:** Violates Instagram ToS.

### Facebook (LOW confidence)

**Package:** None viable
**Auth required:** N/A (scraping) or Yes (Graph API requires app review)
**How discovery works:**

Option A -- Playwright scraping:
```typescript
// Navigate to facebook.com/search/videos/?q=keyword&filters={"rp_video_live":"{\"name\":\"live\",...}"}
// Extract video cards from DOM
// Requires login for most results
```

Option B -- Graph API (requires business app approval):
```typescript
// GET /search?type=video&q=keyword -- DEPRECATED for public search
// Facebook has progressively locked down public content search
// Not viable without business verification
```

**Rate limits:** Facebook blocks scrapers aggressively.
**Reliability:** LOW -- No good programmatic path exists. Facebook has the most locked-down ecosystem of all 6 platforms.

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `youtubei.js` | `youtubei` (npm) | `youtubei` at v1.8.4 has far fewer features, smaller community, less frequent updates. `youtubei.js` at v16 is the clear winner. |
| `youtubei.js` | YouTube Data API v3 only | Requires API key, has quota limits (10,000 units/day). Use as optional fallback, not primary. |
| `@twurple/api` | Direct HTTP to Twitch Helix API | Twurple handles token refresh, pagination, types automatically. Raw HTTP adds unnecessary complexity. |
| Direct HTTP for Kick | `kick.js` community packages | No mature, maintained Node.js Kick SDK exists. Community packages are abandoned or wrapper-thin. Direct HTTP is more maintainable. |
| Playwright for TikTok | `tiktok-live-connector` | Only connects to known usernames. Cannot search/discover streams. Wrong tool for this job. |
| `instagram-private-api` | Instagram Graph API | Graph API only allows access to content you own/manage. Cannot discover other users' live streams. |
| Playwright for Facebook | `facebook-unofficial-api` | Has 0 downloads, no live video features. Non-starter. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `youtubei` (npm) | Much less maintained than `youtubei.js`, fewer features, smaller community | `youtubei.js` |
| `tiktok-live-connector` for discovery | Only connects to known usernames, cannot search for live streams | Direct HTTP or Playwright scraping |
| `facebook-unofficial-api` | Zero downloads, no live features, likely abandoned | Playwright scraping |
| `node-instagram` | Deprecated, uses old Instagram API that no longer works | `instagram-private-api` |
| `tiktok-scraper` (drawrowbot) | Original package abandoned since 2021, TikTok changed their API | Custom scraping with Playwright |
| Puppeteer | Playwright has better success rate (96% vs 75%), better API, multi-browser support | `playwright-core` |
| Any paid scraping service (Apify, Bright Data, etc.) | PROJECT.md explicitly excludes paid API tiers and proxy services | Self-hosted scraping |

## Platform Reliability Tiers

**Tier 1 -- Stable, ship with confidence:**
- YouTube via `youtubei.js` (Innertube)
- Twitch via `@twurple/api`

**Tier 2 -- Workable, monitor for changes:**
- Kick via direct HTTP (new but official API)
- YouTube via Data API v3 (official, quota-limited)

**Tier 3 -- Fragile, expect breakage:**
- TikTok (no official API, anti-scraping)
- Instagram (unmaintained package, account ban risk)
- Facebook (no viable API, aggressive anti-scraping)

Build Tier 1 first. Tier 3 platforms need graceful degradation: when discovery fails, show an error state per-platform tab rather than crashing the app.

## Architecture Implications

All API calls MUST go through the Electron main process (per existing security model). The pattern:

1. Main process runs platform-specific fetcher modules
2. Each fetcher is an async generator yielding `StreamData[]` (fits existing `combineDataSources` pipeline)
3. Fetchers are wrapped with `p-throttle` for rate limiting
4. Results are validated with `zod` schemas before passing to renderer via IPC
5. Control panel renderer displays results in platform tabs

For Tier 3 platforms that need Playwright: launch a separate browser context (NOT Electron's built-in Chromium) to avoid security/fingerprinting conflicts. `playwright-core` lets you specify an external browser binary.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `youtubei.js@^16` | Node.js >= 16 | Uses ESM. Electron's Node.js version is fine. |
| `@twurple/api@^8` | `@twurple/auth@^8` | Must use matching major versions. |
| `playwright-core@^1.50` | Separate Chromium download | Do NOT use Electron's Chromium -- use `playwright-core` with its own browser. |
| `instagram-private-api@^1.46` | Node.js >= 12 | Old package, CommonJS. May need ESM interop. |
| `p-throttle@^6` | ESM only | Requires `import`, not `require`. Fine for Electron + Vite. |
| `zod@^3.24` | Universal | No compatibility concerns. |

## Sources

- [LuanRT/YouTube.js GitHub](https://github.com/LuanRT/YouTube.js) -- v16.0.1, releases page verified (HIGH confidence)
- [YouTube.js docs](https://ytjs.dev/guide/getting-started) -- Getting started, search API (HIGH confidence)
- [Twitch API Reference](https://dev.twitch.tv/docs/api/reference) -- Get Streams, Search Channels endpoints verified (HIGH confidence)
- [Twitch Authentication docs](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) -- Client credentials flow (HIGH confidence)
- [@twurple/api npm](https://www.npmjs.com/package/@twurple/api) -- v8.0.3, actively maintained (HIGH confidence)
- [Twurple docs](https://twurple.js.org/) -- API reference and calling guide (HIGH confidence)
- [Kick Dev Docs GitHub](https://github.com/KickEngineering/KickDevDocs) -- OAuth flow, livestreams endpoint (MEDIUM confidence)
- [Kick API docs](https://docs.kick.com) -- Changelog confirming livestreams endpoint April 2025 (MEDIUM confidence)
- [TikTok-Live-Connector GitHub](https://github.com/zerodytrash/TikTok-Live-Connector) -- Confirmed: connects to known users only, no search (HIGH confidence on limitation)
- [instagram-private-api npm](https://www.npmjs.com/package/instagram-private-api) -- v1.46.1, last published 2+ years ago (HIGH confidence on staleness)
- [instagram-private-api FeedFactory docs](https://github.com/dilame/instagram-private-api/blob/master/docs/classes/index/FeedFactory.md) -- No live discovery feed (HIGH confidence on limitation)
- [facebook-unofficial-api GitHub](https://github.com/cy4udev/Facebook-Unofficial-API) -- No live video features, 0 downloads (HIGH confidence on unsuitability)
- [Twitch Developer Forums](https://discuss.dev.twitch.com/t/is-there-a-way-to-check-if-a-stream-is-live-without-using-tokens/35639) -- Confirms auth required (MEDIUM confidence)

---
*Stack research for: Multi-platform live stream discovery*
*Researched: 2026-03-05*
