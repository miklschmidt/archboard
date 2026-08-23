---
id: TASK-107
title: >-
  describe and compare disagree on what carries archboard metadata: a flat
  legacy customData is a node to one and not the other
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-23 19:24'
updated_date: '2026-08-23 19:30'
labels: []
dependencies: []
references:
  - src/core/describe.ts
  - src/core/promote.ts
  - src/core/compare.ts
  - src/core/changes.ts
  - docs/adr/0003-element-metadata-is-the-semantic-channel.md
priority: medium
type: bug
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0003 puts archboard's metadata under `customData.archboard`, namespaced, because the Obsidian plugin writes flat top-level keys of its own. Two readers of that channel exist and disagree. `readMeta` in `src/core/describe.ts` (~:84–131) accepts the namespaced block *and* a flat legacy shape (`FLAT_KEYS = kind, binding, path, variant, level`), setting `isNode` from either and printing "(flat customData, not namespaced)" for the latter. `archboardBlock` in `src/core/promote.ts` (~:111) accepts only the namespaced block, and `compare.ts`, `changes.ts` and therefore the change feed import promote's. So an element carrying flat keys is a node to `describe` and not to `compare`, `changes`, the feed, or promotion. Found by the architecture review of 2026-08-23; confirmed present after TASK-101–106 landed.

The decision ADR 0003 already made is that archboard's keys are namespaced and flat names are another tool's. One reader should embody that, and every module that asks "does this element carry archboard metadata" should ask it. If some vault still holds flat legacy metadata from before ADR 0003, say so with evidence and decide once — in the one reader — whether it is read (and then `compare`/`changes` read it too) or not (and then `describe` stops); either way the two surfaces stop disagreeing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One function answers whether an element carries archboard metadata and what it says, and `describe.ts`, `promote.ts`, `compare.ts` and `changes.ts` all use it; `describe.ts` has no private reader of `customData`
- [ ] #2 An element with flat legacy keys and no namespaced block is classified the same way by `describe`, `compare`, `changes` and the change feed — and a check proves it with such an element
- [ ] #3 `test:changes`, `test:branch`, `test:boards` and `bun run test` pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one core metadata reader that recognizes only a plain-object customData.archboard block, returns its contents plus foreign top-level customData, and keep compatibility exports from promote.ts for callers outside this task.
2. Replace describe.ts private customData parsing and route promote.ts, compare.ts, and changes.ts through the shared reader; flat kind, binding, path, variant, and level remain foreign data under ADR 0003.
3. Extend test:changes with one flat-key element and assert describe, compare, the one-board changes engine, and the change feed all treat it as an unpromoted plain element while retaining foreign customData.
4. Run type-check, test:changes, test:branch, test:boards, and test:module-scope; record evidence, finalize all acceptance criteria except the maintainer-owned full bun run test chain, commit explicit TASK-107 paths, and move the task to Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Metadata decision before implementation: flat top-level kind, binding, path, variant, and level are foreign customData, not archboard metadata. ADR 0003 lines 3-11 requires customData.archboard and says flat names can collide with Obsidian keys. Repository search found no board, fixture, or executable check using those flat keys. The only non-code hit is DESIGN.md lines 300-308, a documentation example of the pre-namespace shape; it does not prove a saved board still carries it. Current fixtures and checks place metadata under customData.archboard. Therefore compatibility would preserve an undocumented ambiguity without a board requiring it.

Implemented src/core/metadata.ts as the single reader. It accepts only a plain-object customData.archboard block and returns all other top-level customData as foreign. describe.ts now formats that shared result and contains no customData access; promote.ts, compare.ts, and changes.ts call the same reader. promote.ts re-exports the existing helpers and types so callers outside TASK-107 keep their imports.
Extended scripts/check-changes.mjs with a flat-key element containing kind, binding, path, variant, and level. The check proves describe reports 0 nodes and retains the keys as customData; compare reports nodeCount 0, plainCount 1, no unidentified archboard block, and the foreign keys; changes and the feed report the shape as anonymous with no service kind. Verification passed: bun run type-check; bun run test:changes; bun run test:branch; bun run test:boards; bun run test:module-scope. Per the task scope, the maintainer owns bun run test and browser checks, so neither was run here.
<!-- SECTION:NOTES:END -->
