---
id: TASK-012
title: Sync to Backend button performs a silent replace-all
status: To Do
assignee: []
created_date: '2026-08-19 16:51'
updated_date: '2026-08-19 16:59'
labels:
  - needs-triage
dependencies: []
ordinal: 12000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision recorded: remove the button, or make its replace-all semantics explicit
- [ ] #2 A stale or partially-loaded tab cannot silently truncate server state
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 16:51
---
POST /api/elements/sync clears the server's element map and replaces it wholesale with whatever the tab sends. Auto-sync already covers the legitimate case, so the button's remaining effect is mostly the dangerous one: a tab whose scene is stale or partially loaded can truncate server state in one click. Related to TASK-011 — both are header buttons that can destroy work.
---

author: @claude
created: 2026-08-19 16:59
---
Superseded by TASK-016 (build the archboard shell). The shell rebuilds the header and hosting layer, so fixing these separately would be work thrown away — they are acceptance criteria there instead.
---
<!-- COMMENTS:END -->
