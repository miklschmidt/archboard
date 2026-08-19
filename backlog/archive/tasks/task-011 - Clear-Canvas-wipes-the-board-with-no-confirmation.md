---
id: TASK-011
title: Clear Canvas wipes the board with no confirmation
status: To Do
assignee: []
created_date: '2026-08-19 16:51'
updated_date: '2026-08-19 16:59'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 11000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clearing the board requires an explicit confirmation step
- [ ] #2 The confirmation is safe against a stray touch on a large display, not a 4px dismiss target
- [ ] #3 Parity with the CLI, which already requires --yes
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 16:51
---
Grounded, not speculative: clearCanvas in frontend/src/App.tsx fetches every element and DELETEs each from the backend with no prompt, then wipes the scene. The CLI's equivalent requires --yes. With no persistence yet (TASK-003) a misfire is unrecoverable, and the button sits in the header of a display people touch.
---

author: @claude
created: 2026-08-19 16:59
---
Superseded by TASK-016 (build the archboard shell). The shell rebuilds the header and hosting layer, so fixing these separately would be work thrown away — they are acceptance criteria there instead.
---
<!-- COMMENTS:END -->
