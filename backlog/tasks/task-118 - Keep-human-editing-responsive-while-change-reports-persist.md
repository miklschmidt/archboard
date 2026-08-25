---
id: TASK-118
title: Keep human editing responsive while change reports persist
status: To Do
assignee: []
created_date: '2026-08-25 11:34'
labels: []
dependencies: []
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - frontend/src/canvas/change-reporting.ts
  - frontend/src/canvas/useCanvasSession.ts
  - src/core/timing.ts
priority: high
type: bug
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Manual Excalidraw edits periodically stall even when no agent is interacting with the board. Diagnose the human-only path from Excalidraw onChange through the board hold, change report, synchronous note write, response document, and scene reconciliation. Human input must apply locally without waiting for server persistence. Keep the existing board mutex, leases, claims, renewal, version checks, and serialized agent writes. Agent writes must not become optimistic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A repeatable browser performance check reproduces the human-only stall with no agent writes and records which stage causes the main-thread pause before a fix is chosen
- [ ] #2 Dragging, resizing, and typing remain locally responsive while human change reports and note writes are in flight
- [ ] #3 Continuous human edits use a bounded reporting cadence with periodic progress and one final trailing report after a longer idle settle; the cadence does not create visible report-time stalls
- [ ] #4 The browser does not fan out duplicate board-hold or change-report requests during one continuous human gesture
- [ ] #5 A successful human report converges the canvas and canonical note without replacing or disrupting a newer local edit
- [ ] #6 A human can begin editing while an agent holds or claims the board; the local edit remains visible while the existing mutex orders persistence, and a content edit takes the board back under the existing claim rules
- [ ] #7 Agent writes remain mutex-serialized and non-optimistic, and existing multi-process lock, lease, renewal, claim, and version-conflict tests still pass
- [ ] #8 Panning and zooming do not count as content edits and do not revoke an agent claim
<!-- AC:END -->
