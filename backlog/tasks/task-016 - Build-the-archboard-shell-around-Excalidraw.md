---
id: TASK-016
title: Build the archboard shell around Excalidraw
status: To Do
assignee: []
created_date: '2026-08-19 16:59'
updated_date: '2026-08-19 16:59'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 16000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A shell UI hosts the Excalidraw canvas rather than the canvas being the whole app
- [ ] #2 The Sync to Backend button is gone; sync is automatic and the server is authoritative
- [ ] #3 Clearing a board requires confirmation through a modal, safe against a stray touch
- [ ] #4 The open board, variant and level are visible, and the page title reflects them
- [ ] #5 Shell UI to open a board or variant, and to create a new one
- [ ] #6 The shell can host more than one pane without duplicating canvas logic
- [ ] #7 Upstream POC chrome we do not need is removed; extras we do need live in the shell
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 16:59
---
Design note from the user's direction: 'server is the authority' is not just about deleting a button. Today POST /api/elements/sync lets the frontend CLEAR the server's element map and replace it wholesale — that is frontend-as-authority on every sync, and it is the mechanism behind the stale-tab-truncates-the-board failure mode. Removing the button without addressing the endpoint leaves the hazard reachable by any client. The frontend should report changes and the server should apply them.
---
<!-- COMMENTS:END -->
