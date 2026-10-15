---
id: TASK-482.02
title: >-
  archboard check warns when a board overview is crowded, and the skill teaches
  structure and flows
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 21:05'
updated_date: '2026-10-15 21:39'
labels:
  - semantic-model
  - skill
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
type: feature
ordinal: 843000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Flat boards and calls drawn as relationships made the dogfood drawings unreadable (ADR 0052). Kinds are vault vocabulary, so no check can tell a call from a relationship. A budget on the overview catches both problems.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard check` warns `OVERVIEW_CROWDED` when the overview of a board current variant draws more than 15 parts or more than 25 lines, and names both counts and the fix
- [x] #2 The budget numbers are constants in one place, beside what they hold against
- [x] #3 The archboard skill teaches agents to gather the parts of a subject into a few containers with views that open each one, and to put calls in flows with one relationship per pair of parts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add OVERVIEW_CROWDED to checkSemanticVault in src/runtime/semantic-board-store/lib/diagnostics.ts: the overview of each current variant, against OVERVIEW_MOST_PARTS (15) and OVERVIEW_MOST_LINES (25), constants beside the measurement they come from.
2. A store test: a flat board over the budget warns, the same parts in four containers do not, a small board does not.
3. Two rules in the archboard skill under Keep it true: structure for a subject of more than about a dozen parts, and one relationship per pair with the calls in a flow.
Boards: no board is affected. The check lives inside Vault diagnostics, which Board persistence already draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: bun run check passed lint, fmt and the module lane (4727 pass). The system lane failed once in codex-workbench-production-cleanup (it counted 3 Codex owners while I had restarted the dogfood server during the run); the file passed 8/8 alone. test:repository then passed 27/27 and test:serial-browser 19/19. archboard check on the dogfood vault warns OVERVIEW_CROWDED on 14 boards. archboard check --code reports no finding about Vault diagnostics or diagnostics.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`archboard check` warns OVERVIEW_CROWDED when the overview of a board current variant draws more than 15 parts or 25 lines, naming both counts and the fix. The archboard skill teaches agents to give a subject structure with a view per container, and to draw one relationship per pair with the calls in a flow. Verified with a store test, the full lanes, and a run on the dogfood vault (14 boards warned).
<!-- SECTION:FINAL_SUMMARY:END -->
