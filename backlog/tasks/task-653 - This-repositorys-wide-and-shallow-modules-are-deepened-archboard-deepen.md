---
id: TASK-653
title: This repository's wide and shallow modules are deepened (archboard-deepen)
status: To Do
assignee: []
created_date: '2026-11-19T16:20:00Z'
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
- [ ] #1 Every INTERFACE_WIDE and MODULE_SHALLOW finding on this repository clears, and archboard check and check:model pass
- [ ] #2 Each subtask merged with its footprint gate passing or a recorded exception
- [ ] #3 The redesign proposal is adopted, and the sketch proposals are shelved with their reasons
- [ ] #4 Behavior is unchanged: the test lanes pass, and renderer output is identical
<!-- AC:END -->
