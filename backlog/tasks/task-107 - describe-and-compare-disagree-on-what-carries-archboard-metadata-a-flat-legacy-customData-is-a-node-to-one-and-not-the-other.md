---
id: TASK-107
title: >-
  describe and compare disagree on what carries archboard metadata: a flat
  legacy customData is a node to one and not the other
status: To Do
assignee: []
created_date: '2026-08-23 19:24'
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
