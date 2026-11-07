---
id: TASK-590.04
title: An explanation answer reads as a reply card under the selection
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T13:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1047000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site Ask your architecture tile: the selection with its kind chip, quiet Explain and Talk keys, and the answer on a plane under a gold Codex label.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The selected subject shows its kind chip and name over quiet Explain with Codex and Talk keys
- [x] #2 An answer shows on a ringed plane with a gold Codex label
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC2 is built and verified: the reply stands on a plate in the tray with a gold Codex label, captured in both themes through the fake Codex of canonical-model-explanations.test.ts. AC1 is open. Explain with Codex is already a quiet key, but the panel has no kind chip beside it and no Talk key. The subject's name already heads the panel and Talk is the dock's key, so both would repeat what is on screen. This needs the owner's decision before more work.
<!-- SECTION:NOTES:END -->
