---
id: TASK-175
title: Propagate parent edits and expose durable reconciliation issues
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 02:41'
labels:
  - ready-for-agent
dependencies:
  - TASK-173
  - TASK-174
  - TASK-178
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 326000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

When a parent architecture evolves, draft descendants must remain relevant without silently discarding competing design choices.

## Blocked by

TASK-173, TASK-174, TASK-178

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One initiating board edit atomically commits safe parent-before-child propagation, field-level merge results and issues under one board version.
- [x] #2 Independent field edits merge, equal outcomes agree, and incompatible fields, delete/edit, invalid references and incompatible order changes produce actionable conflicts.
- [x] #3 Conflicted variants retain the last coherent state across restart; blocked descendants identify their blocking ancestor while unaffected branches advance.
- [x] #4 The editing command distinguishes rejection from applied-with-reconciliation-required and returns all affected descendants, subjects and repair guidance; the viewer visibly discloses stale coherent content and conflict subjects.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Walkthrough delivery is a prerequisite so reconciliation covers the actual ordered walkthrough contract as well as message flows.

Restored blocking contract after the independent rejection: a draft whose predecessor is unsettled is not merged, its content is left untouched, and it persists `blockedBy` naming the ancestor whose decision it waits for. The retained base (`reconciliation.base`) is what a later merge is decided against and does not advance while the disagreement stands.

Round of fixes since: a branch taken from an unsettled state now records the same standing propagation would give it, naming the decision it waits for rather than the state it came from (owner: propagation.test.ts, mutation-checked); the client's reconciliation report now reads outcome "blocked" — it knew only merged/conflicted, so the CLI refused the answer to exactly the write somebody needed to hear about, and the prose now names the state a blocked draft is waiting for; the render route's `waiting` is now `ToldStandingSchema` (against, atVersion, issues, blockedBy) with the retained base removed, strict, so a reader refuses an answer carrying the store's merge machinery.

Order settlement, from an adjacent review probe (/tmp/archboard-order-partial-review.ts): answering an order disagreement with `mine` wrote the merge's synthetic `position` field into the retained base, which is a step no board may hold, and the next write failed with INVALID_CONTENT. `position` is invented by the merge to describe where the two sides put something; it is not a field a step has.

Fixed in src/runtime/semantic-board-store/lib/settle-order.ts: an answered order moves the base by reordering it into the predecessor's order — the same thing an answered field does by taking the predecessor's value, and for the same reason, so the next merge reads this proposal's own order as its own change and leaves it alone. Nothing synthetic is persisted.

A partial answer is refused by name (ORDER_SETTLED_WHOLE): positions are relative, so answering where one step sits would place the others without anybody saying so. The refusal names the exchange and says what to do instead.

Owned by src/runtime/semantic-board-store/tests/settlement-order.test.ts — the whole order kept and still kept after a later parent edit, the partial answer refused with nothing written, and an order settled while a field stays open leaving a base that validates. Mutation-checked against persisting the synthetic field, against allowing the partial answer, and against reordering into this proposal's order instead of the predecessor's.

Independent store recheck closed all six original findings (partial durability and B's catch-up, blockedBy with no premature settle, issue dedupe and the partial HTTP answer, clearing an optional field, the adoption boundary) and the adjacent order finding as well.

Verification for the criteria, each command by its own exit status: src/runtime/semantic-board-store, src/shared/semantic-board, tests/system/semantic-boards and src/ui/semantic-board-canvas together 279 pass / 0 fail; bun run type-check 0; bun run lint 0.

AC#1 one atomic version: propagation.test.ts proves an edit to a baseline reaches every draft under it in one write and one version, and that a draft the edit does not concern is left byte-identical. AC#2 the merge outcomes: the pure core's own owners cover independent fields merging, equal outcomes agreeing, competing fields, delete-and-edit, lost references and competing order. AC#3 durability across restart: 'what is unsettled survives a restart, because it is on the board' re-reads the file and compares; blocked descendants name the ancestor whose decision they wait for, and a branch taken from an unsettled state records the same blocker at creation. AC#4 the answer and the viewer: tests/system/semantic-boards/lifecycle.test.ts proves a write that blocks a draft still answers and names the state it waits for, and that the render route carries the standing without the retained base; the viewer's own owners prove the disclosure appears with the subject and field named, that a blocked state names its ancestor by the name on the variant bar, and both were read in the running app at 1920x1080.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A parent's edit now reaches every draft under it in one write and one version, and what the two cannot agree about is written on the board rather than guessed at. Each draft is merged against the state it last agreed with — the retained base, kept on the variant and deliberately not advanced while something is unsettled — so nothing that happened during a disagreement is skipped when it is finally settled. A draft whose predecessor is itself in dispute is not merged at all: its content is left untouched and coherent, and it records which ancestor has to decide, because merging it would choose on its behalf which side of the argument to build on. A proposal branched while its predecessor is unsettled is told the same thing the moment it exists.

Every write answers with the same envelope the HTTP route uses — the board, the version it landed at, and either nothing to settle or every draft the change reached with what each of them did and the repair sentence the reconciliation itself wrote. The viewer says it too, above the picture, in the board's own words, naming the state a blocked draft is waiting for. The render answer carries the standing without the retained base, which is merge machinery a reader has no use for.

Verified by 279 passing tests across the store, the pure core, the public command line and the viewer, by both type-checks and lint clean, and by reading both a conflicted and a blocked proposal in the running app. Six independent review findings and one adjacent order finding were closed on the way.
<!-- SECTION:FINAL_SUMMARY:END -->
