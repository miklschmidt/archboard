---
id: TASK-066
title: >-
  Timing constants are scattered, and two of them are in tension with nothing
  saying so
status: To Do
assignee: []
created_date: '2026-08-20 20:02'
labels: []
dependencies: []
references:
  - frontend/src/canvas/useCanvasSession.ts
  - src/core/change-feed.ts
  - docs/adr/0016-one-writer-at-a-time-per-board.md
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follows from ADR 0016.

The constants that govern flushing, settling, retrying and locking live in different files and cannot be read together:

  frontend/src/canvas/useCanvasSession.ts:34   REPORT_DEBOUNCE_MS = 400
  frontend/src/canvas/useCanvasSession.ts:35   REPORT_RETRY_MS = 2000
  frontend/src/canvas/useCanvasSession.ts:40   SELECTION_DEBOUNCE_MS = 150
  frontend/src/canvas/useCanvasSession.ts:47   PANE_DEBOUNCE_MS = 300
  src/core/change-feed.ts:62                   SETTLE_MS = 1200 (ARCHBOARD_SETTLE_MS)

plus the injection debounce and minimum interval, which are read from the environment and documented only in TESTING.md.

They are not independent. Under ADR 0016 the report debounce decides both how often the vault is written and how long an agent waits for a human who is mid-gesture, and those pull in opposite directions: shortening it releases the lock sooner and writes more often, and under ADR 0015 every write costs an fsync. Somebody tuning it for responsiveness will silently make the canvas write to the vault twice as often, and nothing in the file they are editing says so.

The frontend already imports src/core/labels and src/core/appearance directly, so a shared module is an established pattern here rather than a new one.

What belongs in it: the report debounce, the retry, the selection and pane debounces, the change feed settle, the lock lease and renewal interval, and the agent's wait cap. What belongs beside them: the relationships, so the next person to change one knows what else moves.

The environment overrides should keep working. ARCHBOARD_SETTLE_MS is documented and used.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Flush, settle, retry, lease and wait-cap constants live in one module imported by frontend, server and CLI
- [ ] #2 The relationship between the report debounce and the lock hold is written down beside them
- [ ] #3 Existing environment overrides still work
<!-- AC:END -->
