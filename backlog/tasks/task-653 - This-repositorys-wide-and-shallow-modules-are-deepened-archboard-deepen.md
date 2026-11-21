---
id: TASK-653
title: This repository's wide and shallow modules are deepened (archboard-deepen)
status: Done
assignee: []
created_date: '2026-11-19T16:20:00Z'
updated_date: '2026-11-21T01:32:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-651
priority: high
type: task
ordinal: 1113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

TASK-651 makes the code check fail on wide interfaces and shallow modules, and the owner decided to narrow everything in this stack. The archboard-deepen run (TASK-652) explored the 17 INTERFACE_WIDE and 2 MODULE_SHALLOW findings, wrote a report of 15 candidates, and had two advisors (docs/agents/advisors.md) choose and grill them in place of the owner. Each subtask is one candidate, with its settled design in the run's decision log.

The run directory (ignored, not tracked) holds the report, the pictures and the decision log: artifacts/archboard-deepen/20261119T144122Z/ at the root of the checkout. The evidence goes into the pull request of the deepen/module-depth layer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every INTERFACE_WIDE and MODULE_SHALLOW finding on this repository clears, and archboard check and check:model pass
- [x] #2 Each subtask merged with its footprint gate passing or a recorded exception
- [x] #3 The redesign proposal is adopted, and the sketch proposals are shelved with their reasons
- [x] #4 Behavior is unchanged: the test lanes pass, and renderer output is identical
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed with TASK-653.22 on deepen/653-22-final: bin/archboard check and the check:model stage (scripts/check-model.ts) pass with 0 semantic errors and 0 code warnings; check code --fail-shallow-modules --base deepen/module-depth passes, with no INTERFACE_WIDE or MODULE_SHALLOW finding. Every subtask is Done; each merged with its gate or a recorded exception (decision log). sL6y1FLr was adopted at c356deb613 and the 14 sketches shelved. All test lanes pass and the render corpus is byte-identical across the final pass (0 of 1116).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The archboard-deepen run deepened the repository's wide and shallow modules in 22 subtasks, under two advisors in place of the owner. Every INTERFACE_WIDE and MODULE_SHALLOW finding cleared, package ceilings only went down, the redesign proposal sL6y1FLr is Current, and the final pass (TASK-653.22) left no code warning, semantic error or outdated embed. Renderer output stayed byte-identical through each crate change, and every test lane passes. Known follow-ups outside the run: TASK-656 (page margins, diagram_margin), the stale README clips and narrated videos, and TASK-653.12's criterion for the landing PR's breaking-change title.
<!-- SECTION:FINAL_SUMMARY:END -->
