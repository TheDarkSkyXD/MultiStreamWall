---
status: diagnosed
phase: 02-stable-platform-providers
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md
started: 2026-03-05T21:15:00Z
updated: 2026-03-05T22:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running Streamwall instance. Start the app from scratch with `npm start`. Electron boots without errors, main window and control window appear. No crash or unhandled exception on startup.
result: pass

### 2. YouTube Innertube Search
expected: Run with `npm start -- --discovery-query="news live"`. The YouTube provider searches via Innertube (no API key needed) and returns live stream results. Check terminal/logs for discovery results or no errors related to YouTube search.
result: issue
reported: "YouTube Innertube returned no results. Logs show 'Failed to extract signature decipher function' and 'Failed to extract n decipher function' from youtubei.js. Data API fallback also failed with 400. Only Twitch returned results (10 streams). Also ERR_CONNECTION_REFUSED for overlay/background/control HTML pages."
severity: major

### 3. YouTube CLI Flags Persistence
expected: Run with `npm start -- --discovery-query="protest" --youtube-api-key="test123"`. Stop the app. Run `npm start` again without flags. The previously set discovery query ("protest") should persist and trigger discovery on launch (check logs). The API key should also persist in electron-store settings.
result: pass

### 4. Twitch GQL Search
expected: With a discovery query set, Twitch provider searches via public GQL endpoint and returns live channel results. Check terminal/logs for Twitch search results showing channel names and viewer counts.
result: pass

### 5. Kick Graceful Degradation
expected: Kick provider attempts search but gracefully degrades when blocked by Cloudflare. No crash or unhandled error. Logs show Kick returning unavailable/empty results while YouTube and Twitch continue working normally.
result: pass

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "YouTube provider searches via Innertube (no API key needed) and returns live stream results"
  status: failed
  reason: "User reported: YouTube Innertube returned no results. Logs show 'Failed to extract signature decipher function' and 'Failed to extract n decipher function' from youtubei.js. Data API fallback also failed with 400. Only Twitch returned results (10 streams)."
  severity: major
  test: 2
  root_cause: "Invalid API key 'test123' persisted in electron-store causes Data API path to be selected (truthy check) instead of Innertube. Data API returns 400, method returns early with empty streams. No fallback from Data API to Innertube on failure. Innertube itself works fine when called directly."
  artifacts:
    - path: "packages/streamwall/src/main/discovery/providers/youtube.ts"
      issue: "Line 64: truthy apiKey check selects Data API with no fallback to Innertube on failure"
    - path: "packages/streamwall/src/main/discovery/providers/youtube.ts"
      issue: "Lines 68-69: early return on Data API error returns zero streams"
  missing:
    - "Add fallback from Data API to Innertube when Data API returns non-quota errors (400, 401)"
    - "Validate API key format before persisting, or allow clearing stored key"
  debug_session: ".planning/debug/youtube-innertube-no-results.md"
