---
id: TASK-653.02
title: Timing owns the waiting
status: To Do
assignee: []
created_date: '2026-11-19T16:23:00Z'
updated_date: '2026-11-19T16:25:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 1 of the archboard-deepen run, first and alone on the TypeScript track. packages/timing is wide (37) and shallow (132 pieces of logic): 26 names only return a stored number, and callers hand-write 15 poll loops and about 24 deadline and age sums. The settled design, every decision and its reason: the "Candidate 1, timing: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md and the tree tree-01-timing.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Owner decision 18 (one keyed getter per package) is in the same log.

## Architecture

- Proposal: the redesign proposal of the deepen/module-depth layer (see TASK-653.01 notes for its id).
- Slice: timing (packages/timing) and the callers that change: the modules of the 142 importing files.
- Gate: `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state <proposal> --model-at checkout --fail-outside` exits 0 or has recorded exceptions, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on timing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 timing exports exactly waitUntil, pause, deadline, durationMs, painterPhasesJson, reachHopDelayMs, columnSlideSettledMs, codexRestartDelayMs and localityDefaultSinceSeconds; INTERFACE_WIDE and MODULE_SHALLOW clear on timing
- [ ] #2 The hand-written poll loops use waitUntil or pause, each keeping its probe order, final sleep, deadline check placement and abort point
- [ ] #3 Deadline and age sums use deadline; callers keep their own comparison operators; no wait bound or cadence is readable through durationMs except the registry lock poll cadence
- [ ] #4 Every duration value, epoch timestamp, painter JSON byte and caller sentence is unchanged, and the voice package bundle and the site build pass
- [ ] #5 Fake-clock seam tests cover sleep-first policies, boundMs, capAtMs, signal before probe, deadline equality, overshoot, cancellation precedence and probe errors; superseded tests are replaced, not layered
- [ ] #6 An ADR records the getter rule, its one exception and the rejected timer, age and retry operations; boundaries.md and the frontend examples follow the new interface
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr (timing's slice is added when the build reports its relationships).
<!-- SECTION:NOTES:END -->
