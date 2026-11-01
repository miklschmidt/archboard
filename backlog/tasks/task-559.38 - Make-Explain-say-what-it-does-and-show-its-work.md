---
id: TASK-559.38
title: Make Explain say what it does and show its work
status: In Progress
assignee: []
created_date: '2026-11-01T03:01:00Z'
labels: []
dependencies: []
parent_task_id: TASK-559
ordinal: 1009000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner found Explain unclear in use: the action does not say that Codex answers it, a false failure message stays on a good answer, nothing shows progress, the panels have no depth, markdown shows as plain text and the context line prints identifiers. The Interface line also puts hidden parts under Interface, which CONTEXT.md and ADR 0044 say are implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The action reads Explain with Codex with icons, and its menu says what happens
- [ ] #2 A delivered request never reports a failure
- [ ] #3 The panel shows what Codex is doing and the answer as it arrives
- [ ] #4 The answer renders as markdown
- [ ] #5 The context line names subjects, not identifiers
- [ ] #6 The conversation and explanation panels stand off the canvas
- [ ] #7 Hidden parts stand apart from the interface in the right panel, About and Measures
<!-- AC:END -->
