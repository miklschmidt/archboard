---
id: TASK-559.28
title: End each relationship on the part that makes or answers it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T04:16:00Z'
updated_date: '2026-10-31T06:29:00Z'
labels:
  - model
dependencies: []
parent_task_id: TASK-559
priority: high
ordinal: 1000000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A relationship that ends on a module with parts makes a caller and no entry point, so the interface measures read wrong. On this repository 70 of 114 modules with parts hold such an end, and 9 read as no entry points with all parts hidden although callers reach them (for example Pane session and Browser gateway, 6 each). The owner decided that a module cannot point at anything when the view is only that module: its entry points can, and those need a card. Moving each relationship to the part that makes the call: owner comment excellent. Delegated decision: do the full repair. It includes the 26 own-part relationships of TASK-559.24 and the 12 parts they need.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every relationship with an end on a module with parts moves to an existing part that makes or answers the call, read from source, or stays on the frame because no part stands for the call
- [ ] #2 The 26 own-part relationships of TASK-559.24 are repaired, with the parts they need
- [x] #3 archboard check reports a relationship with an end on a module with parts as information, and the frame line stays drawn
- [x] #4 The consumer skill tells an author to prefer the part that makes or answers a call, and that a frame end stays acceptable when no part stands for the call
- [x] #5 No module with parts reads as no entry points when callers reach it, except where the report gives the reason
- [x] #6 Flows and walkthroughs still resolve, and no proposal is adopted or lost
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move each end to an existing part that makes or answers the call, read from source, with the identity kept. 2. Add a new part only for an own-part relationship with no other repair, or for a module with parts that would read as no entry points although callers reach it. 3. Leave everything else on the frame. 4. Add a new relationship only where a new part forces it. 5. Report a frame end as information in the code check, and correct ADR 0044 and the skill. 6. Replay from a script, then measure, check drafts and flows, and run the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full repair held back, not merged. Measured on every reading against the model at 6a910327b: drawn lines 1694 to 2605, area 148.5 M to 243.5 M, readings that pass the fit gate 107 to 94 of 115, readings below 0.4 from 1 to 7, slowest drawing 509 ms to 767 ms. Canonical checkpoint operations went from 3 parts and 23 lines to 13 parts and 90 lines, and most new lines are file imports named after symbols. That is an import map and not architecture, so it fails the purpose. feat/relationship-ends at b58c99db9 stays as an option. Next: a smaller repair that adds a part only where it must.

Smaller repair on feat/relationship-ends-small, from 736b1273c. It replaces the full repair, which stays on feat/relationship-ends as an option. Result: the repair meets the owner's target. Across all readings, lines drawn rose 4.2 percent and total area rose 5.1 percent, and no reading left the fit gate.

Measures on every reading, /tmp/integrate/slice-words/measure2.ts, before then after: lines drawn 1,694, 1,765. Total area 148.5 M, 156.0 M. Readings that pass at fit 0.6: 107, 109 of 115. Readings below 0.4: 1, 1 (Workspace packages, 0.39 then 0.34). Slowest drawing 509 ms, 585 ms, which depends on machine load. Canonical architecture and Architecture runtime API rose from 0.46 to 0.66. Canonical checkpoint operations went from 3 parts and 23 lines to 4 parts and 24 lines.

Measures of /tmp/integrate/measure-truth.ts, before then after: modules 524, 539. Relationships 1,097, 1,074. Modules with a frame end 70, 54. All entering on the frame 9, 0. Entering 1,327, 1,334, of which on the frame 276, 191. Leaving 1,429, 1,459, of which from the frame 325, 210. Relationships with an end on a module with parts 479, 339. Drawn frame lines 322, 251.

Moves: 202 relationships moved an end to an existing or new part and kept identity, kind, label and description. 193 moved as the evidence said, and 9 moved one end or stopped at a holder that keeps every call drawn. 28 were removed because a kept relationship states the same call. 4 stale anchors were repaired where the relationship stays.

New parts, 15, each with its cost in new relationships: Session composition 0, Read entry 2 (Foreign revision pins and Legacy migration now state their calls to Canonical model read, because the container's file moved to the part), Archive objects 0, Edit entry 0, Durable installation 0, Model contract 1, Catalogue hook 0, Stage view 0, Recorder 0, Voice controls 1, Archive publication 0, Bun render 1, Voice session state 0, Binding contract 0, Agent actions 0. New relationships: 5. No part costs more than 5. Canonical model contracts and Canonical archive objects gave up their file binding to their part, and Canonical model read binds its folder now.

Left on the frame by design: 339. No existing part stands for those calls. Four of them have stale anchors, so a repair is removal, which the brief does not ask for: wQBlFEQ3, mTr3mpxi, 9vLmTtXn, tWVYo1RT. The three rule relationships to Workspace packages stay: wImHhbk7, mm4DLsd2, 0ri6Svab.

Own-part relationships: 26 went to 1. IyzXWhR8, Portable model operations to Canonical checkpoint operations, stays. It names historyResult, a small result helper in the folder of the container, and a History result part fails the card test. AC 2 stays open for that reason.

Severity decision: 339 frame ends remain, far above 20, so RELATIONSHIP_ON_CONTAINER is information. It moved from the semantics check to the code check. A vault diagnostic can only be a warning or an error, and the bell labels every non-error as a warning, so information level exists only for a code finding. apps/web is out of scope, and this keeps the bell quiet. ADR 0044, the consumer skill, CONTEXT.md, the check help and ADR 0046 say so.

Warnings: CONTAINER_PASS_THROUGH went from 0 to 6: Thread start, Shared thread policy, Child ownership, Rasterizing, Panes and the workbench, Legacy board documents. Each held its job through a frame relationship that moved, and the repair is a containment change, which this task does not make. RELATIONSHIP_UNDRAWN stays 0. ANCHOR_SYMBOL_MISSING went from 13 to 9. ANCHOR_MISMATCH 1, ANCHOR_PATH_MISSING 2, BINDING_PATH_MISSING 1 and EMBED_OUTDATED 2 come from the baseline. EXPOSED_UNUSED went from 36 to 37.

Drafts: the moves touch none of the 8 drafts. Each batch receipt said reconciliation false, and no proposal, flow or walkthrough file changed. Each draft reads identical in modules, relationships and collections, compared by digest. Only the vault revision differs. Draft 93RlBGLx still shows 49 changes against qdsrL4tY: 38 added, 10 changed, 1 removed. A draft keeps its retained predecessor, so a change to current does not reach it. Four proposal files name relationships that this repair removed from current: 93RlBGLx (11), YkUcKOJ5 (1), yM7DOqT4 (1), zFIdZB1Y (1). All 8 still hold such ids through their predecessors. A later reconciliation with current has to settle them, and conflicts stay explicit until settlement.

Walkthroughs and flows: all 19 walkthroughs read with success. 18 pin checkpoint 6bc124a8, so a change to current does not reach their beats. pcvrNsYC targets state oyXXnyCV and names no removed relationship. Eight of the pinned walkthroughs name a removed relationship, which stays in their checkpoint. All 72 flows name existing participants, and no flow names a removed relationship.

Core bug, not fixed, because crates are out of scope: on_wall in crates/archboard-layout/src/blocks/planned/ports.rs panics when rounding puts the clamp minimum above its maximum (496.3333333333333 and 496.33333333333326). Moving 7plLLcKh, oyurpL2B and ntLLD7Df reached it in the Voice reading, so those three stay on their frames. That avoids the panic and does not fix it. A later model change can reach it again. The proposed fix is /tmp/integrate/relationship-ends/small/on-wall-clamp.patch, with the reproduction in panic-input-voice.json beside it.

Replay: /tmp/integrate/relationship-ends/small/replay.sh with batches.json, on an unrepaired vault. The commits of this branch are run f1. An operation identity cannot repeat, so a new run needs a new suffix.

Gate: bunx vp run --no-cache check:all exit 0 on 94ccbcfe9: 21 of 21 tasks, 48 of 48 browser owners, 5,391 tests passed, 0 failed. Earlier runs stopped four times. Run 1 stopped on max-lines in relationships.ts, so the finding moved to evidence/frame-ends.ts. Run 2 ended with exit code 144 in the browser lane, and its log shows no failed test. I do not know what ended it. Run 3 stopped on a port race in tests/system/server-state/codex-workbench-production-cleanup.test.ts: closedLoopbackEndpoint picked a port that another parallel test then took. Run 4 stopped on reader-measures.test.ts, which passed 5 of 5 alone through its lane, so it looks load dependent. Neither test touches this change.

Smaller repair merged to integrate/pr19, gate 21 of 21 in 144 s. Lines 1694 to 1765, area 148.5 M to 156.0 M, fit gate 107 to 109 of 115, modules with parts that read no entry points 9 to 0, frame ends 276 to 191 entering and 325 to 210 leaving. feat/relationship-ends b58c99db9 stays as the rejected full option. Open: one own-part relationship IyzXWhR8, six new CONTAINER_PASS_THROUGH warnings, four stale relationships wQBlFEQ3 mTr3mpxi 9vLmTtXn tWVYo1RT, and the on_wall clamp panic.
<!-- SECTION:NOTES:END -->
