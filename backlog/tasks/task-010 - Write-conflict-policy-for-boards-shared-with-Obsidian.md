---
id: TASK-010
title: Write-conflict policy for boards shared with Obsidian
status: To Do
assignee: []
created_date: '2026-08-19 15:38'
updated_date: '2026-08-19 15:38'
labels:
  - needs-triage
dependencies: []
ordinal: 10000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision recorded on how archboard and Obsidian avoid eating each other's edits
- [ ] #2 A board changed underneath archboard since load is detected before overwrite
- [ ] #3 The conflict surfaces to the human rather than resolving silently
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 15:38
---
Split out of TASK-003 so the multi-document work is not blocked on a product decision. The options and my recommendation (optimistic concurrency: hash at load, verify before write, refuse on mismatch) are recorded as a comment on TASK-003. Needs a human call.
---
<!-- COMMENTS:END -->
