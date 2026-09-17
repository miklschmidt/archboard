---
id: TASK-258
title: Two arrows across a container boundary still cross
status: To Do
assignee: []
created_date: '2026-09-17 20:34'
labels:
  - renderer
dependencies: []
references:
  - src/transformers/semantic-renderer/lib/layout/flank-rules.ts
  - TASK-256.11
  - TASK-239
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
ordinal: 465000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-256.11 seated parallel relationships apart so two arrows between the same pair of cards can be told from each other: each takes its own port index, mirrored between the two faces, and a pair or triple between top-level cards now draws straight. The case it could not reach is a pair whose ends sit at different containment levels — a card inside a frame to a card outside it. Their ends no longer swap, so each label belongs to the arrowhead its order says, but the two routes now meet twice where they met once: their horizontal runs turn in the wrong order relative to each other. Page, route length and bends are identical before and after; only the crossing count moves.

The lever is the frame boundary port, and the engine does not honour its index. The TASK-256.11 worker gave that port the seat and then the seat negated, and both produced a drawing identical to index 0, so this is the hierarchy router rather than the port seating that task owns. It reverted the experiment rather than widen its change.

Nothing in the vault or the wide-board fixtures has a parallel pair, so nothing regresses today and no recorded scorecard moves. This surfaced in the 2026-09-17T16-31-08 evaluation, where three S08 runs drew two signals from one card to another; those runs are fixed, because their boards had no containers. A run that had put the two emitting methods inside a frame and still drawn one arrow each would meet this.

Related: TASK-239 proposes one shared trunk port per face for a hub, which pulls the other way. Its inherited constraint from TASK-256.11 — a shared port must never take two relationships that share both endpoints — applies here too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two relationships sharing both endpoints across a containment boundary are drawn without crossing each other
- [ ] #2 A renderer test owns the case beside the same-level pair in route-nesting.test.ts, sweeping both edge orders
- [ ] #3 The recorded scorecards of the wide-board fixtures and the vault boards do not regress
<!-- AC:END -->
