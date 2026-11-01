---
id: TASK-559.38
title: Make Explain say what it does and show its work
status: Done
assignee: []
created_date: '2026-11-01T03:01:00Z'
updated_date: '2026-11-01T05:40:00Z'
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
- [x] #1 The action reads Explain with Codex with icons, and its menu says what happens
- [x] #2 A delivered request never reports a failure
- [x] #3 The panel shows what Codex is doing and the answer as it arrives
- [x] #4 The answer renders as markdown
- [x] #5 The context line names subjects, not identifiers
- [x] #6 The conversation and explanation panels stand off the canvas
- [x] #7 Hidden parts stand apart from the interface in the right panel, About and Measures
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Explain is Explain with Codex with icons and a line that says what happens. A delivered request no longer reports a failure, the panel streams what Codex does and the answer as markdown, and the context line names subjects. Hidden parts stand under Implementation in the Right panel, About and Measures. Verified with a real Codex turn and the full gate. The conversation still shows the prompt's captureFile line, because the prompt's last line is a contract.
<!-- SECTION:FINAL_SUMMARY:END -->
