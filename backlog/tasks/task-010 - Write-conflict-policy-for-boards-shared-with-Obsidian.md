---
id: TASK-010
title: Write-conflict policy for boards shared with Obsidian
status: To Do
assignee: []
created_date: '2026-08-19 15:38'
updated_date: '2026-08-19 16:50'
labels:
  - needs-triage
dependencies:
  - TASK-003
ordinal: 10000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board's hash is recorded at load and verified before every write
- [ ] #2 A board changed underneath archboard since load is refused, not overwritten
- [ ] #3 The conflict surfaces to the human with the three outcomes: reload, overwrite, save elsewhere
- [ ] #4 Archboard never resolves a conflict on the human's behalf
- [ ] #5 The single-writer convention is documented alongside the mechanism
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 15:38
---
Split out of TASK-003 so the multi-document work is not blocked on a product decision. The options and my recommendation (optimistic concurrency: hash at load, verify before write, refuse on mismatch) are recorded as a comment on TASK-003. Needs a human call.
---

author: @claude
created: 2026-08-19 16:50
---
APPROVED by the user: optimistic concurrency (hash at load, verify before write, refuse on mismatch) plus the single-writer convention documented. Recorded as ADR 0006. File-watch-and-reload explicitly rejected — it swaps which side silently loses work rather than fixing anything.
---
<!-- COMMENTS:END -->
