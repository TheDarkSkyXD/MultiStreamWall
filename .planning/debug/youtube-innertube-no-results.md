---
status: diagnosed
trigger: "Investigate why the YouTube Innertube search returns no results in the Streamwall app"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:00:00Z
---

## Current Focus

hypothesis: Invalid API key "test123" forces Data API path, which fails with 400, returning empty streams
test: Traced full code path from config -> worker -> provider -> search mode selection
expecting: Confirmed via code analysis and live Innertube test
next_action: Report findings

## Symptoms

expected: YouTube live streams returned via Innertube search
actual: No YouTube results returned; only Twitch results come through
errors: "Failed to extract signature decipher function", "Failed to extract n decipher function", Data API 400 Bad Request
reproduction: Run app with youtube-api-key=test123 and a discovery query
started: Since implementation

## Eliminated

- hypothesis: Innertube search itself is broken or returns empty results
  evidence: Direct Node.js test of Innertube.search('news', { features: ['live'] }) returns 20 results successfully
  timestamp: 2026-03-05

- hypothesis: youtubei.js cipher warnings cause search failure
  evidence: Warnings are about video playback URL deciphering (Player.js), not search. Search works fine despite warnings.
  timestamp: 2026-03-05

- hypothesis: Bug in mapResults type handling (id vs video_id mismatch)
  evidence: Video class has deprecated `get id()` getter that returns video_id. The 'id' in item check works correctly.
  timestamp: 2026-03-05

- hypothesis: Search filter features: ['live'] is invalid for youtubei.js v16
  evidence: SearchFilters type confirms Feature type includes 'live'. Live test returns valid results.
  timestamp: 2026-03-05

## Evidence

- timestamp: 2026-03-05
  checked: youtubei.js v16.0.1 Innertube.search() with features: ['live']
  found: Returns 20 Video results with valid video_id, title, author, view_count
  implication: Innertube search works; problem is elsewhere in pipeline

- timestamp: 2026-03-05
  checked: Player.js source for cipher warning origin
  found: Warnings at lines 71-74 of Player.js are about signature/n decipher for video playback, not search
  implication: Cipher warnings are red herring for search functionality

- timestamp: 2026-03-05
  checked: YouTube onSearch() mode selection logic (youtube.ts lines 64-66)
  found: apiKey is checked as truthy; if set, Data API path is taken instead of Innertube
  implication: With apiKey="test123", code never uses Innertube -- goes straight to Data API

- timestamp: 2026-03-05
  checked: setApiKey() in settings.ts (line 41)
  found: Creates provider entry with { enabled: false } as base, stores key via safeStorage or plain text
  implication: electron-store persists the invalid key across app restarts

- timestamp: 2026-03-05
  checked: getDiscoverySettings() (settings.ts lines 72-87)
  found: Only providers already in store are included in settings; apiKey is decrypted/retrieved for each
  implication: Once test123 is stored, it's always sent to the worker

- timestamp: 2026-03-05
  checked: discovery-worker.ts runSearch() (lines 44-49)
  found: Streams message only sent if result.streams.length > 0; errors are sent separately
  implication: Data API 400 error returns empty streams array, so no streams message is ever sent for YouTube

## Resolution

root_cause: |
  The YouTube provider has an invalid API key ("test123") persisted in electron-store.
  This causes the provider to use the Data API path instead of Innertube (youtube.ts line 64-66:
  `apiKey ? searchViaDataApi() : searchViaInnertube()`). The Data API returns 400 Bad Request
  with an invalid key, producing { streams: [], error: {...} }. The onSearch method returns
  this error early (line 68-69), and the worker only sends 'streams' messages when streams.length > 0
  (discovery-worker.ts line 44), so YouTube effectively produces nothing.

  Secondary issue: There is no fallback from Data API to Innertube when the API key is invalid.
  The provider treats the API key as an either/or switch with no graceful degradation.

  Tertiary issue: The persisted invalid key in electron-store means even running the app
  WITHOUT --youtube-api-key still uses the previously stored bad key.

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
