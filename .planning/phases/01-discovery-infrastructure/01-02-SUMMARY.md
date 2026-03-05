---
phase: 01-discovery-infrastructure
plan: 02
subsystem: infra
tags: [typescript, electron-store, utility-process, repeater, discovery, base-provider]

# Dependency graph
requires:
  - phase: 01-discovery-infrastructure-plan-01
    provides: Discovery type contracts, TokenBucket rate limiter, toStreamData mapper, vitest infra
provides:
  - BaseProvider abstract class with rate limiting and error wrapping
  - DiscoveryManager orchestrator with per-provider error isolation
  - electron-store settings with safeStorage encryption for API keys
  - Utility process worker for off-main-thread polling
  - Repeater-based bridge converting MessagePort to AsyncGenerator
  - Pipeline integration with discovery generator in dataSources
  - Crash recovery with exponential backoff
  - Empty provider registry ready for Phase 2
affects: [02-youtube-kick-providers, 03-platform-providers, discovery-settings-ui]

# Tech tracking
tech-stack:
  added: [electron-store]
  patterns: [base-provider-subclass, utility-process-fork, messageport-bridge, exponential-backoff-restart]

key-files:
  created:
    - packages/streamwall/src/main/discovery/base.ts
    - packages/streamwall/src/main/discovery/manager.ts
    - packages/streamwall/src/main/discovery/settings.ts
    - packages/streamwall/src/main/discovery/bridge.ts
    - packages/streamwall/src/main/discovery/providers/index.ts
    - packages/streamwall/src/main/discovery-worker.ts
  modified:
    - packages/streamwall/forge.config.ts
    - packages/streamwall/src/main/index.ts
    - packages/streamwall/package.json

key-decisions:
  - "BaseProvider uses TokenBucket from Plan 01 for built-in rate limiting per provider"
  - "DiscoveryManager uses Promise.allSettled for parallel search with per-provider error isolation"
  - "electron-store with safeStorage encryption for API keys, plain text fallback when unavailable"
  - "Utility process uses MessagePort for bidirectional communication with main process"

patterns-established:
  - "Provider subclassing: extend BaseProvider, implement onInit/onSearch/onDestroy"
  - "Utility process pattern: fork with MessagePort, exponential backoff restart"
  - "Discovery bridge: Repeater wrapping MessagePort events into AsyncGenerator"

requirements-completed: [DISC-08, DISC-09, INFR-01, INFR-02]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 1 Plan 02: Discovery Infrastructure Summary

**BaseProvider abstract class, DiscoveryManager orchestrator, electron-store settings with safeStorage encryption, utility process worker with crash recovery, and Repeater-based pipeline integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-05T19:15:04Z
- **Completed:** 2026-03-05T19:18:26Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- BaseProvider abstract class enforces init/search/destroy lifecycle with built-in rate limiting via TokenBucket
- DiscoveryManager orchestrates multiple providers with Promise.allSettled for per-provider error isolation (DISC-09)
- electron-store persists discovery settings with safeStorage encryption for API keys
- Utility process runs discovery polling off the main Electron thread with MessagePort communication
- Repeater-based bridge converts MessagePort events to AsyncGenerator compatible with combineDataSources
- Pipeline fully wired: discovery generator added to dataSources array in main/index.ts
- Crash recovery: utility process auto-restarts with exponential backoff (1s, 2s, 4s, max 5 retries)
- 11 new tests, 46 total passing

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for BaseProvider and DiscoveryManager** - `c62acc7` (test)
2. **Task 1 GREEN: BaseProvider, DiscoveryManager, settings, provider registry** - `4d2ec93` (feat)
3. **Task 2: Utility process worker, bridge, forge config, pipeline integration** - `65858ac` (feat)

## Files Created/Modified
- `packages/streamwall/src/main/discovery/base.ts` - BaseProvider abstract class with rate limiting and error wrapping
- `packages/streamwall/src/main/discovery/manager.ts` - DiscoveryManager orchestrator with per-provider error isolation
- `packages/streamwall/src/main/discovery/settings.ts` - electron-store with safeStorage encryption for API keys
- `packages/streamwall/src/main/discovery/bridge.ts` - Repeater-based MessagePort to AsyncGenerator bridge
- `packages/streamwall/src/main/discovery/providers/index.ts` - Empty provider registry for Phase 2
- `packages/streamwall/src/main/discovery-worker.ts` - Utility process entry point with polling loop
- `packages/streamwall/forge.config.ts` - Added discovery-worker build entry
- `packages/streamwall/src/main/index.ts` - Wired discovery into data pipeline with crash recovery
- `packages/streamwall/package.json` - Added electron-store dependency

## Decisions Made
- BaseProvider wraps onSearch in try/catch returning network_error -- subclasses don't need error handling boilerplate
- DiscoveryManager uses Promise.allSettled so one slow/failing provider never blocks others
- electron-store with safeStorage.encryptString for API keys, base64 encoding for storage, plain text fallback
- Utility process receives MessagePort via initial postMessage, enabling bidirectional async communication
- Exponential backoff uses named function reference (not arguments.callee) for clean re-registration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript 4.5 still cannot run `tsc --noEmit` (pre-existing from Plan 01). Verification done via vitest which compiles through Vite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete discovery infrastructure is in place and integrated into the Electron app
- Phase 2 can add platform providers by simply subclassing BaseProvider and adding to providers/index.ts
- Settings store is ready for UI integration (discoveryStore.onDidChange for reactive settings)
- Utility process starts on app launch, currently produces no streams (empty provider registry)

---
*Phase: 01-discovery-infrastructure*
*Completed: 2026-03-05*
