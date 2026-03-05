---
phase: 1
slug: discovery-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (to be installed in Wave 0) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run src/main/discovery/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/main/discovery/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | DISC-08 | unit | `npx vitest run src/main/discovery/__tests__/base.test.ts` | No — W0 | pending |
| 01-01-02 | 01 | 0 | DISC-09 | unit | `npx vitest run src/main/discovery/__tests__/manager.test.ts` | No — W0 | pending |
| 01-01-03 | 01 | 0 | INFR-01 | unit | `npx vitest run src/main/discovery/__tests__/manager.test.ts` | No — W0 | pending |
| 01-01-04 | 01 | 0 | INFR-03 | unit | `npx vitest run src/main/discovery/__tests__/rate-limiter.test.ts` | No — W0 | pending |
| 01-01-05 | 01 | 0 | INFR-04 | unit | `npx vitest run src/main/discovery/__tests__/lru-cache.test.ts` | No — W0 | pending |
| 01-xx-xx | xx | x | INFR-02 | manual | Manual: start app, verify utility process in Task Manager | n/a | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `vitest` dev dependency: `npm install -w streamwall -D vitest`
- [ ] Vitest config (inline in `vite.main.config.ts` or separate `vitest.config.ts`)
- [ ] `src/main/discovery/__tests__/base.test.ts` — stubs for DISC-08
- [ ] `src/main/discovery/__tests__/manager.test.ts` — stubs for DISC-09, INFR-01
- [ ] `src/main/discovery/__tests__/rate-limiter.test.ts` — stubs for INFR-03
- [ ] `src/main/discovery/__tests__/lru-cache.test.ts` — stubs for INFR-04
- [ ] `src/main/discovery/__tests__/mapper.test.ts` — mapper function coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Discovery runs in utility process | INFR-02 | `utilityProcess.fork()` requires Electron runtime | Start app, open Task Manager, verify child utility process exists; send test message via MessagePort |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
