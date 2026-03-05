# Testing Patterns

**Analysis Date:** 2026-03-05

## Test Framework

**Runner:**
- No test framework is configured
- No test runner, assertion library, or test configuration files exist in the project
- No `test` script is defined in any `package.json`

**CLAUDE.md confirms:** "There is no test suite configured."

## Test File Organization

**Location:**
- No test files exist anywhere in the source packages
- No `__tests__/` directories, no `*.test.*` files, no `*.spec.*` files

## Run Commands

```bash
# No test commands available
# The project has no test infrastructure
```

## Coverage

**Requirements:** None enforced. No coverage tooling configured.

## Test Types

**Unit Tests:**
- Not implemented

**Integration Tests:**
- Not implemented

**E2E Tests:**
- Not implemented

## Recommendations for Adding Tests

If tests are to be added, consider the following based on the codebase structure:

**Testable Pure Logic (no Electron dependencies):**
- `packages/streamwall-shared/src/geometry.ts` - Grid layout math (`boxesFromViewContentMap`, `idxToCoords`, `idxInBox`)
- `packages/streamwall-shared/src/colors.ts` - Color hashing (`hashText`, `idColor`)
- `packages/streamwall-shared/src/roles.ts` - Role permission checks (`roleCan`)
- `packages/streamwall/src/util.ts` - URL validation (`ensureValidURL`)
- `packages/streamwall/src/main/data.ts` - `StreamIDGenerator.process()` (pure ID generation logic)

**Suggested Framework:**
- Vitest would be the natural choice given the project already uses Vite for bundling
- Config file would go at: `packages/streamwall-shared/vitest.config.ts` and/or `packages/streamwall/vitest.config.ts`

**Suggested Test Location:**
- Co-locate test files next to source: `packages/streamwall-shared/src/geometry.test.ts`
- Or use `__tests__/` directories: `packages/streamwall-shared/src/__tests__/geometry.test.ts`

**Suggested Test Structure:**
```typescript
import { describe, expect, it } from 'vitest'
import { idxToCoords, idxInBox } from './geometry'

describe('idxToCoords', () => {
  it('converts grid index to x,y coordinates', () => {
    expect(idxToCoords(3, 0)).toEqual({ x: 0, y: 0 })
    expect(idxToCoords(3, 4)).toEqual({ x: 1, y: 1 })
  })
})
```

**What Would Be Hard to Test:**
- Electron main process code (`StreamWindow.ts`, `ControlWindow.ts`) - requires Electron test harness
- Preload scripts - tightly coupled to Electron IPC
- Renderer components - require Preact rendering context and IPC mocking
- XState machine (`viewStateMachine.ts`) - uses Electron `WebContentsView` in actions; would need significant mocking or refactoring to extract testable logic

**Linting as Quality Gate:**
- The project relies on ESLint + TypeScript strict checks as the primary code quality mechanism
- Run via: `npm -w streamwall run lint`
- TypeScript has `noImplicitAny: true` and `strictNullChecks: true` in the main package
- The shared package has full `strict: true` plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

---

*Testing analysis: 2026-03-05*
