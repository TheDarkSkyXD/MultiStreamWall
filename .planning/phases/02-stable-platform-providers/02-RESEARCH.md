# Phase 2: Stable Platform Providers - Research

**Researched:** 2026-03-05
**Domain:** Platform API integration (YouTube, Twitch, Kick)
**Confidence:** MEDIUM

## Summary

This phase implements three platform providers that subclass the Phase 1 `BaseProvider` infrastructure. Each provider discovers live streams and returns `DiscoveredStream[]` results. The key technical challenge is that each platform has a fundamentally different API approach: YouTube uses a well-documented npm library (youtubei.js) with an optional official Data API fallback; Twitch uses an undocumented internal GraphQL API; and Kick has a new official public REST API that supports browsing but not keyword search, requiring a dual approach.

The CONTEXT.md decisions simplify implementation significantly: all providers work without credentials (`requiresCredentials: false`), search results use replace-all merge (no incremental diffing), and the 500-result soft cap bounds pagination complexity. The biggest risk is Twitch GQL instability -- Twitch has actively restricted their internal GraphQL API since 2022 and may break it at any time.

**Primary recommendation:** Implement YouTube first (best documented, dual-mode gives resilience), then Twitch (well-known GQL patterns despite being unofficial), then Kick (official API is new and limited, supplement with unofficial search endpoint).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- YouTube: youtubei.js (Innertube) as default, optional Data API v3 key switches to official API
- Twitch: unofficial GQL API (same as twitch.tv website), no auth required, `isExperimental: false`
- Kick: public API endpoints, no credentials needed
- All providers: `requiresCredentials: false`
- URLs: YouTube `https://youtube.com/watch?v={videoId}`, Twitch `https://twitch.tv/{username}`, Kick `https://kick.com/{username}`
- Search: comma-separated keywords, 500 soft cap per platform after dedup, sort by viewer count high-to-low
- Merge strategy: replace-all per search cycle
- Storage: in-memory `Map<string, DiscoveredStream[]>` keyed by platform
- Search query persists in electron-store across restarts
- Grace period: keep offline streams 1-2 cycles before removing
- Console logging with platform prefix: `[YouTube] Rate limited: retry in 60s`
- Rate limits hardcoded per provider, not configurable
- Integration tests against real APIs (local only, not CI)

### Claude's Discretion
- YouTube provider class structure (single class with branching vs two classes)
- YouTube API key input method before Settings UI exists
- Search query input method before Discovery UI/Settings UI exist
- HTTP client vs npm package choice for Twitch GQL and Kick
- Liveness check implementation per platform
- IPC design for exposing discovery results to control panel
- Provider registration pattern (static array vs registry)
- Exact rate limit values per provider

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | User can search YouTube live streams by keyword via youtubei.js (no API key required) | youtubei.js v16+ `search()` with `features: ['live']` filter; `getContinuation()` for pagination |
| DISC-02 | User can optionally provide YouTube Data API v3 key for higher rate limits | YouTube Data API `search.list` with `eventType=live&type=video`; 100 quota units/request, 10,000 units/day default |
| DISC-03 | User can search Twitch live streams (no credentials required via GQL) | Twitch GQL at `gql.twitch.tv/gql` with hardcoded Client-ID; `SearchResultsPage` query with live filter |
| DISC-04 | User can search Kick live streams by keyword (no credentials required) | Dual approach: official `GET /public/v1/livestreams` for browsing + unofficial `GET /api/search` for keyword search |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| youtubei.js | ^16.0.1 | YouTube Innertube API client | Most complete YouTube private API wrapper; TypeScript-native; search with live filter built-in |
| node-fetch | ^3.3.2 | HTTP requests for Twitch GQL and Kick APIs | Already in project dependencies; works in Electron main/utility process |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| electron-store | ^11.0.2 | Persist search query and API keys | Already installed; use `discoveryStore` from Phase 1 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-fetch for Twitch | @twurple/api | Twurple requires OAuth app registration; GQL approach needs no credentials |
| node-fetch for Kick | @kick/sdk or @nekiro/kick-api | Extra dependency for simple REST calls; unofficial packages may lag behind API changes |
| youtubei.js | googleapis (official) | Official client requires API key always; youtubei.js works without one |

**Installation:**
```bash
npm install youtubei.js
```

Only `youtubei.js` needs to be added. `node-fetch` is already a dependency.

## Architecture Patterns

### Recommended Project Structure
```
src/main/discovery/
  providers/
    index.ts              # Provider registry (add instances)
    youtube.ts            # YouTube provider (dual-mode: Innertube + Data API)
    twitch.ts             # Twitch provider (GQL)
    kick.ts               # Kick provider (official API + unofficial search)
    __tests__/
      youtube.test.ts     # Integration tests (real API, local only)
      twitch.test.ts
      kick.test.ts
```

### Pattern 1: Single YouTube Provider with Internal Mode Switching
**What:** One `YouTubeProvider` class that checks for API key on each search call and delegates to the appropriate backend method internally.
**When to use:** When two backends serve the same purpose and the switching logic is simple (check if API key exists).
**Why recommended:** Avoids two-class registration complexity. The `onSearch` method checks `getApiKey('youtube')`, and calls either `searchViaInnertube(query)` or `searchViaDataApi(query, apiKey)`.

```typescript
export class YouTubeProvider extends BaseProvider {
  readonly platform = 'youtube'
  readonly capabilities: ProviderCapabilities = {
    requiresCredentials: false,
    supportsLanguageFilter: true,
    isExperimental: false,
  }
  protected readonly rateLimit: RateLimitConfig = {
    maxRequests: 5,
    windowMs: 60_000,
  }

  private innertube: Innertube | null = null

  protected async onInit(): Promise<void> {
    this.innertube = await Innertube.create()
  }

  protected async onSearch(query: string): Promise<ProviderResult> {
    const apiKey = getApiKey('youtube')
    if (apiKey) {
      return this.searchViaDataApi(query, apiKey)
    }
    return this.searchViaInnertube(query)
  }

  private async searchViaInnertube(query: string): Promise<ProviderResult> {
    const results = await this.innertube!.search(query, {
      features: ['live'],
    })
    // Map results to DiscoveredStream[]
    // Use getContinuation() for pagination up to 500 cap
  }

  private async searchViaDataApi(
    query: string,
    apiKey: string,
  ): Promise<ProviderResult> {
    // GET https://www.googleapis.com/youtube/v3/search
    //   ?part=snippet&type=video&eventType=live&q={query}&key={apiKey}
    //   &maxResults=50&order=viewCount
    // Paginate via pageToken up to 500 cap
  }

  protected async onDestroy(): Promise<void> {
    this.innertube = null
  }
}
```

### Pattern 2: Direct GQL Fetch for Twitch
**What:** Raw `node-fetch` POST to `gql.twitch.tv/gql` with hardcoded Client-ID header and inline GraphQL query.
**When to use:** When the API is unofficial and no maintained npm package exists.
**Why recommended:** Zero extra dependencies; query structure is simple and well-known from community reverse-engineering.

```typescript
const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql'
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

// SearchResultsPage query for live streams
const SEARCH_QUERY = `
  query SearchResultsPage_SearchResults(
    $query: String!
    $first: Int
    $after: String
  ) {
    searchFor(userQuery: $query, options: { targets: [{ index: CHANNEL }] }) {
      channels(first: $first, after: $after) {
        edges {
          node {
            id
            login
            displayName
            broadcastSettings {
              title
            }
            stream {
              id
              viewersCount
              game { name }
              previewImageURL(width: 440, height: 248)
              createdAt
              freeformTags { name }
              broadcastSettings {
                language
              }
            }
          }
        }
        pageInfo {
          hasNextPage
        }
        cursor
      }
    }
  }
`

async function searchTwitch(query: string): Promise<ProviderResult> {
  const response = await fetch(TWITCH_GQL_URL, {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: { query, first: 30 },
    }),
  })
  const data = await response.json()
  // Filter to only channels with active stream (stream !== null)
  // Map to DiscoveredStream[]
}
```

### Pattern 3: Dual-Approach Kick Provider
**What:** Combine official `GET /public/v1/livestreams` (browsing/filtering) with unofficial `GET kick.com/api/search` (keyword search).
**When to use:** When the official API lacks search but an unofficial endpoint exists.
**Why recommended:** Official API gives structured data with language filter and viewer count sorting; unofficial search gives keyword matching.

```typescript
// Official API - browse live streams (no keyword search)
const KICK_API_URL = 'https://api.kick.com/public/v1/livestreams'
// Unofficial - keyword search
const KICK_SEARCH_URL = 'https://kick.com/api/search'

// For keyword search, use unofficial endpoint:
// GET https://kick.com/api/search?searched_word={query}
// Response includes channels with is_live, viewer_count, etc.

// For browsing by category/language, use official:
// GET https://api.kick.com/public/v1/livestreams?language=en&sort=viewer_count&limit=100
```

### Anti-Patterns to Avoid
- **Separate provider classes per YouTube mode:** Creates registration confusion (two providers for one platform) and complicates mode switching logic.
- **Caching search results between cycles:** CONTEXT.md specifies replace-all merge. Don't diff or merge results across cycles.
- **Throwing errors from onSearch:** BaseProvider catches errors, but returning `ProviderResult` with `.error` is cleaner. Only throw for truly unexpected failures.
- **Polling inside providers:** Providers are stateless search functions. The DiscoveryManager handles polling intervals.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YouTube Innertube protocol | Custom protobuf parsing | youtubei.js | Innertube protocol is complex, changes frequently, youtubei.js handles it |
| YouTube Data API client | Custom REST wrapper | node-fetch + direct URL construction | The API is simple enough (one endpoint) that a full client library is overkill |
| Rate limiting | Per-provider rate limit logic | BaseProvider + TokenBucket (Phase 1) | Already built; providers just declare `rateLimit` config |
| API key storage | Custom encryption/storage | `discoveryStore` + `setApiKey/getApiKey` (Phase 1) | Already built with safeStorage encryption |
| Result deduplication | Complex merge logic | Simple `Map` keyed by URL | CONTEXT.md says within-platform dedup by URL only |

**Key insight:** Phase 1 already built the hard infrastructure (rate limiting, error isolation, settings persistence, utility process bridge). Phase 2 providers are relatively thin -- they just call APIs and map results to `DiscoveredStream`.

## Common Pitfalls

### Pitfall 1: Twitch GQL Client-ID Invalidation
**What goes wrong:** Twitch periodically rotates or restricts the hardcoded Client-ID used by their web app. The GQL endpoint returns 400 or empty results.
**Why it happens:** Twitch actively discourages third-party GQL usage.
**How to avoid:** Use the well-known `kimne78kx3ncx6brgo4mv6wki5h1ko` Client-ID (stable since 2019). If it stops working, the provider returns an error status -- other providers continue unaffected (Phase 1 error isolation). Log clearly: `[Twitch] GQL Client-ID rejected`.
**Warning signs:** 401/403 responses, empty `data` field, new `errors` array in response.

### Pitfall 2: YouTube Innertube Rate Limiting
**What goes wrong:** YouTube throttles or blocks requests from Innertube clients making too many requests.
**Why it happens:** Rate limits are undocumented for the internal API.
**How to avoid:** Conservative rate limit: 5 requests per 60 seconds. The `BaseProvider` TokenBucket enforces this automatically. If YouTube returns errors, the grace period keeps existing results visible for 1-2 cycles.
**Warning signs:** HTTP 429 responses, CAPTCHA challenges, empty result sets.

### Pitfall 3: youtubei.js Initialization in Utility Process
**What goes wrong:** `Innertube.create()` makes network requests during initialization (fetches player context). If called in the utility process without proper context, it may fail.
**Why it happens:** Innertube needs to fetch YouTube's player configuration on first use.
**How to avoid:** Call `Innertube.create()` in `onInit()` and handle failure gracefully. If init fails, set provider status to 'error' and retry on next init cycle.
**Warning signs:** Network errors during startup, timeout on `Innertube.create()`.

### Pitfall 4: Kick Official API Requires OAuth for Some Endpoints
**What goes wrong:** Assuming all official Kick API endpoints are public, then getting 401 errors.
**Why it happens:** The official Kick API (`api.kick.com`) requires OAuth 2.1 tokens for most endpoints.
**How to avoid:** Use the `GET /public/v1/livestreams` endpoint which is designed for public access (scoped to public data). For keyword search, fall back to the unofficial `kick.com/api/search` endpoint which doesn't require auth. Document this dual approach clearly.
**Warning signs:** 401/403 from `api.kick.com` endpoints.

### Pitfall 5: YouTube Data API Quota Exhaustion
**What goes wrong:** YouTube Data API v3 has a default quota of 10,000 units/day. Each `search.list` call costs 100 units. With comma-separated keywords and pagination, quota runs out fast (100 searches/day max).
**Why it happens:** Search is the most expensive YouTube API operation.
**How to avoid:** Per CONTEXT.md: "When Data API quota is exhausted (403), let the API error handle it -- no client-side quota tracking." The provider returns an error, and the user can clear the API key to fall back to Innertube.
**Warning signs:** HTTP 403 with `quotaExceeded` error reason.

### Pitfall 6: Comma-Separated Keywords Multiply API Calls
**What goes wrong:** "news, protest, rally" means 3 separate searches per provider per cycle. With pagination, this can mean 15+ API calls per cycle per provider.
**Why it happens:** Each keyword is a separate search query.
**How to avoid:** Rate limiter handles pacing. The 500 soft cap is total across all keywords after dedup, not per keyword. Process keywords sequentially within a single `onSearch` call, stop early once 500 results reached.
**Warning signs:** Rate limit errors when many keywords are configured.

## Code Examples

### YouTube Innertube Search with Pagination
```typescript
// Source: youtubei.js docs (ytjs.dev) + GitHub
import { Innertube } from 'youtubei.js'

const innertube = await Innertube.create()
let search = await innertube.search('news', { features: ['live'] })

const streams: DiscoveredStream[] = []
// Map first page results
for (const video of search.videos) {
  streams.push({
    platform: 'youtube',
    title: video.title?.text ?? '',
    channelName: video.author?.name ?? '',
    url: `https://youtube.com/watch?v=${video.id}`,
    thumbnailUrl: video.thumbnails?.[0]?.url ?? '',
    viewerCount: 0, // Innertube search may not include viewer count
    language: '',
    tags: [],
    startedAt: '',
  })
}

// Paginate
while (search.has_continuation && streams.length < 500) {
  search = await search.getContinuation()
  for (const video of search.videos) {
    streams.push(/* ... */)
  }
}
```

### YouTube Data API v3 Search
```typescript
// Source: developers.google.com/youtube/v3/docs/search/list
const params = new URLSearchParams({
  part: 'snippet',
  type: 'video',
  eventType: 'live',
  q: query,
  key: apiKey,
  maxResults: '50',
  order: 'viewCount',
})

const url = `https://www.googleapis.com/youtube/v3/search?${params}`
const response = await fetch(url)
const data = await response.json()

// data.items[].id.videoId -> video ID
// data.items[].snippet.title -> title
// data.items[].snippet.channelTitle -> channel name
// data.items[].snippet.thumbnails.medium.url -> thumbnail
// data.nextPageToken -> for pagination
```

### Twitch GQL Search
```typescript
// Source: community reverse-engineering (github.com/mauricew/twitch-graphql-api)
const response = await fetch('https://gql.twitch.tv/gql', {
  method: 'POST',
  headers: {
    'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: SEARCH_QUERY, // see Architecture Patterns section
    variables: { query: 'news', first: 30 },
  }),
})

const { data } = await response.json()
const channels = data.searchFor.channels.edges
  .filter((e: any) => e.node.stream !== null) // Only live channels
  .map((e: any) => ({
    platform: 'twitch',
    title: e.node.broadcastSettings.title,
    channelName: e.node.displayName,
    url: `https://twitch.tv/${e.node.login}`,
    thumbnailUrl: e.node.stream.previewImageURL,
    viewerCount: e.node.stream.viewersCount,
    language: e.node.stream.broadcastSettings?.language ?? '',
    tags: e.node.stream.freeformTags?.map((t: any) => t.name) ?? [],
    startedAt: e.node.stream.createdAt,
  }))
```

### Kick Dual-Approach Search
```typescript
// Official API - browse by category/language
const officialUrl = new URL('https://api.kick.com/public/v1/livestreams')
officialUrl.searchParams.set('sort', 'viewer_count')
officialUrl.searchParams.set('limit', '100')
officialUrl.searchParams.set('language', 'en')

const officialRes = await fetch(officialUrl.toString())
const officialData = await officialRes.json()
// officialData[].slug -> channel slug
// officialData[].stream_title -> title
// officialData[].viewer_count -> viewers
// officialData[].thumbnail -> thumbnail URL
// officialData[].started_at -> start time
// officialData[].language -> language code

// Unofficial search - keyword search
const searchUrl = `https://kick.com/api/search?searched_word=${encodeURIComponent(query)}`
const searchRes = await fetch(searchUrl)
const searchData = await searchRes.json()
// Filter to channels where is_live === true
// Map to DiscoveredStream with url = `https://kick.com/${slug}`
```

### Search Query Input (Before Settings UI)
```typescript
// Recommend: CLI flag + electron-store persistence
// In main/index.ts (yargs already used for CLI):
//   --discovery-query "news, protest"
// Stored in discoveryStore, persists across restarts
// Settings UI (Phase 5) will provide GUI for this
```

### YouTube API Key Input (Before Settings UI)
```typescript
// Recommend: CLI flag + electron-store persistence
// In main/index.ts:
//   --youtube-api-key "AIza..."
// Stored via setApiKey('youtube', key) from Phase 1 settings
// Settings UI (Phase 5) will provide GUI for this
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YouTube Data API only | youtubei.js (Innertube) | 2023+ | No API key needed for basic usage |
| Twitch Helix API (OAuth required) | Twitch GQL (no OAuth) | Community pattern since ~2020 | No app registration needed |
| Kick scraping (no API) | Kick official public API | Jan 2025 | Structured endpoints at api.kick.com |
| @twurple/api for Twitch | Direct GQL fetch | Decision for this project | Simpler, no credentials needed |

**Deprecated/outdated:**
- Twitch Kraken API: Fully deprecated since 2021, replaced by Helix
- YouTube v2 API: Long deprecated, v3 is current
- Kick website scraping: Official API now available (though limited)

## Open Questions

1. **Twitch GQL Query Structure**
   - What we know: The endpoint `gql.twitch.tv/gql` accepts GraphQL queries with `Client-ID: kimne78kx3ncx6brgo4mv6wki5h1ko`. The `searchFor` query with `CHANNEL` target index returns live channels.
   - What's unclear: The exact query schema may have changed since community documentation was last updated. Twitch uses Automatic Persisted Queries (APQ) which may be required for some operations.
   - Recommendation: During implementation, intercept Twitch.tv network requests in browser DevTools to verify the current search query structure. The basic non-persisted query approach shown above should work as a starting point. If it fails, fall back to persisted query hashes.

2. **Kick Search Endpoint Stability**
   - What we know: `GET kick.com/api/search?searched_word={query}` exists as an unofficial endpoint. The official API at `api.kick.com` has `GET /public/v1/livestreams` but no keyword search.
   - What's unclear: Whether the unofficial search endpoint requires any special headers (e.g., Cloudflare challenges) or will be removed when Kick adds search to the official API.
   - Recommendation: Try unofficial search first. If blocked by Cloudflare, fall back to official API browsing (no keyword search, but can filter by category/language). Per CONTEXT.md: "Best effort: implement with whatever endpoints work; if they break, return empty results with error status."

3. **YouTube Innertube Viewer Count**
   - What we know: Innertube search results may not include live viewer counts directly in search results.
   - What's unclear: Whether `viewerCount` is available in search results or requires a separate video details request.
   - Recommendation: If viewer count is missing from search results, set to 0 and note that Data API mode provides accurate counts. This is acceptable since sorting by viewer count can use the API's own ordering.

4. **Utility Process Compatibility with youtubei.js**
   - What we know: youtubei.js makes HTTP requests and may use browser-like APIs internally. The discovery code runs in an Electron utility process.
   - What's unclear: Whether youtubei.js works correctly in a Node.js-like utility process context (no DOM, no window).
   - Recommendation: Test early. youtubei.js is designed for Node.js, so it should work. If not, it can be initialized in the main process instead.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | packages/streamwall/vitest.config.ts |
| Quick run command | `npm -w streamwall run test` |
| Full suite command | `npm -w streamwall run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | YouTube Innertube search returns live streams | integration | `npx vitest run src/main/discovery/providers/__tests__/youtube.test.ts -x` | No - Wave 0 |
| DISC-02 | YouTube Data API search with API key returns live streams | integration | `npx vitest run src/main/discovery/providers/__tests__/youtube.test.ts -x` | No - Wave 0 |
| DISC-03 | Twitch GQL search returns live channels with streams | integration | `npx vitest run src/main/discovery/providers/__tests__/twitch.test.ts -x` | No - Wave 0 |
| DISC-04 | Kick search returns live streams | integration | `npx vitest run src/main/discovery/providers/__tests__/kick.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npm -w streamwall run test`
- **Per wave merge:** `npm -w streamwall run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/main/discovery/providers/__tests__/youtube.test.ts` -- covers DISC-01, DISC-02
- [ ] `src/main/discovery/providers/__tests__/twitch.test.ts` -- covers DISC-03
- [ ] `src/main/discovery/providers/__tests__/kick.test.ts` -- covers DISC-04

Note: Per CONTEXT.md, these are integration tests against real APIs, run locally only (not CI). Tests should use a hardcoded common search term like 'news' and verify response structure matches `DiscoveredStream` interface.

## Sources

### Primary (HIGH confidence)
- [YouTube.js GitHub (LuanRT/YouTube.js)](https://github.com/LuanRT/YouTube.js) - v16.0.1, search API with `features: ['live']` filter
- [YouTube.js API Docs (ytjs.dev)](https://www.ytjs.dev/api/classes/Innertube) - Innertube class, search method signature
- [YouTube Data API v3 Search](https://developers.google.com/youtube/v3/docs/search/list) - Official search.list parameters, eventType=live, quota costs
- [Kick Official API Swagger](https://api.kick.com/swagger/doc.yaml) - GET /public/v1/livestreams endpoint, response schema, parameters
- [KickEngineering/KickDevDocs](https://github.com/KickEngineering/KickDevDocs) - Official API documentation repo

### Secondary (MEDIUM confidence)
- [mauricew/twitch-graphql-api](https://github.com/mauricew/twitch-graphql-api) - Twitch GQL endpoint, Client-ID header requirement, request format
- [SuperSonicHub1/twitch-graphql-api](https://github.com/SuperSonicHub1/twitch-graphql-api) - Schema scraping, SearchForItem union type exists
- [kick.py endpoints.json](https://github.com/cibere/kick.py/blob/main/endpoints.json) - Kick unofficial endpoints including api/search
- [Twitch GraphQL blog post (WunderGraph)](https://wundergraph.com/blog/graphql_in_production_analyzing_public_graphql_apis_1_twitch_tv) - GQL patterns, APQ usage

### Tertiary (LOW confidence)
- [gkbrk.com Twitch GraphQL](https://www.gkbrk.com/2020/12/twitch-graphql/) - Client-ID value, basic query examples (2020, may be outdated)
- [mattseabrook/KICK.com-Streaming-REST-API](https://github.com/mattseabrook/KICK.com-Streaming-REST-API) - Kick unofficial API docs (may be outdated since official API launched)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - youtubei.js is well-documented, node-fetch already in project
- YouTube architecture: HIGH - clear API docs for both Innertube and Data API v3
- Twitch architecture: MEDIUM - GQL approach is well-known but unofficial and may change
- Kick architecture: MEDIUM - official API confirmed via Swagger but limited (no search); unofficial search endpoint stability unknown
- Pitfalls: MEDIUM - based on community reports and API documentation

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (30 days; Twitch GQL stability should be re-verified if implementation is delayed)
