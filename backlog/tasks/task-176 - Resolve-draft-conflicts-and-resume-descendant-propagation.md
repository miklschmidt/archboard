---
id: TASK-176
title: Resolve draft conflicts and resume descendant propagation
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 02:44'
labels:
  - ready-for-agent
dependencies:
  - TASK-175
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 327000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Give the same agent that receives parent-edit issues a deterministic way to repair the proposal chain without replaying the already-applied edit.

## Blocked by

TASK-175

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A version-checked resolution command reconciles against the latest persisted parent and validates the resulting semantic content.
- [x] #2 Resolving a parent conflict resumes downstream propagation and reports remaining or newly discovered issues in the same structured contract.
- [x] #3 Stale resolutions cannot overwrite newer parent changes; unresolved drafts cannot masquerade as coherent or be adopted.
- [x] #4 Agent/API and viewer verification covers recovery of a blocked chain, restart, order conflicts and no frontend content-repair action.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Settlement is in place and exercised end to end through the real command line: answering an issue with `mine` or `theirs` clears that issue, advances the retained base for the answered field so the decision is durable, and frees the drafts below — including one branched while the predecessor was unsettled — merged in the same write and the same version. Settling a blocked draft is refused by name: answering there would decide one argument twice.

Defects found by review and fixed this round: a partial resolution left the decision recoverable (the base now moves per answered field); an issue could be reported twice (kept and recomputed issues are deduped); a partial resolve answered `reconciliation: null` (the edited variant is reported in `descendants`); taking a cleared optional field wrote `null` into content and failed validation (the field is removed instead).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settling answers a disagreement one at a time or all at once, under the same board-global lease and expected-version check every other write uses, and against the parent as it now stands rather than as it stood when the disagreement arose. Answering a field takes one side of that field and touches nothing else — a decision about a name is not permission to take everything the predecessor has since decided — and the base moves for exactly the fields answered, which is what makes the decision durable: the next merge sees a settled field instead of finding the same argument again.

Answering an order is different in kind and is treated so: `position` is invented by the merge to describe where two sides put something, so an answered order moves the base by reordering it into the predecessor's order, and a partial answer to one exchange is refused by name because positions are relative and answering half would place the rest.

Once nothing is open, what was waiting underneath moves in the same write and the same version, and reports whatever it finds — which may be a new disagreement, visible only now that its parent has decided. Settling a blocked draft is refused rather than answered, because answering there would decide one argument twice.

Verified through the public command line against a running canvas and by 279 passing tests across the store, the pure core, the system suite and the viewer, with both type-checks and lint clean. Six independent review findings plus the order finding were closed; the recheck reports all of them closed.
<!-- SECTION:FINAL_SUMMARY:END -->
