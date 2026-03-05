---
phase: 2
slug: stable-platform-providers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | packages/streamwall/vitest.config.ts |
| **Quick run command** | `npm -w streamwall run test` |
| **Full suite command** | `npm -w streamwall run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm -w streamwall run test`
- **After every plan wave:** Run `npm -w streamwall run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-XX | 01 | 1 | DISC-01 | integration | `npx vitest run src/main/discovery/providers/__tests__/youtube.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-XX | 01 | 1 | DISC-02 | integration | `npx vitest run src/main/discovery/providers/__tests__/youtube.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-XX | 02 | 1 | DISC-03 | integration | `npx vitest run src/main/discovery/providers/__tests__/twitch.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-XX | 02 | 1 | DISC-04 | integration | `npx vitest run src/main/discovery/providers/__tests__/kick.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/discovery/providers/__tests__/youtube.test.ts` — stubs for DISC-01, DISC-02
- [ ] `src/main/discovery/providers/__tests__/twitch.test.ts` — stubs for DISC-03
- [ ] `src/main/discovery/providers/__tests__/kick.test.ts` — stubs for DISC-04

*Integration tests against real APIs, run locally only (not CI). Tests use hardcoded common search term like 'news' and verify response structure matches `DiscoveredStream` interface.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| YouTube mode auto-swap when API key added | DISC-02 | Requires electron-store interaction + live API | 1. Search without API key, verify results 2. Add API key in settings 3. Search again, verify results still return |
| Twitch GQL search with no credentials | DISC-03 | Unofficial API, needs live verification | 1. Launch app 2. Search for 'news' 3. Verify Twitch results appear with channel names |
| Kick search results display | DISC-04 | Unofficial search endpoint, needs live verification | 1. Search for 'news' 2. Verify Kick results appear with viewer counts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
