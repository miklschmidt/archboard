---
id: TASK-538.03
title: A view chosen in one linked pane is read in both
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T03:57:00Z'
labels:
  - compare
  - ui
dependencies:
  - TASK-538.02
parent_task_id: TASK-538
type: feature
ordinal: 944000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordering and error handling show in a sequence or a flowchart view (ADR 0053). To follow one case through two designs, both panes must read the same view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the panes linked, choosing a view in one pane reads both panes through it, as one history entry
- [ ] #2 Back restores both previous views, and a reload restores both
- [ ] #3 A walkthrough step's view and a drilled level's view are not linked
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Linked view: a view the person chooses in one linked pane is read in both, when the linked pane reads the board it was opened on. A restore (a reload, Back or Forward) reads each pane through the view its address names, and it never reaches across the link.

1. rules/application/pane-link.ts: each linked pane carries ownBoard, whether it reads the board the server opened it on (status.opened names the board on screen) and not one it drilled into. sameLinks compares it.
2. hooks/application/use-pane-reading.ts: a new chooseView(paneId, view) shows the view in the pane, and in the linked pane when that pane reads its own board. It returns each pane it reached with the view that pane read before. showView stays one pane, for a restore. A drilled level keeps its view in use-level-reading and never reaches the shell (criterion 3), and a presented walkthrough ends the link (TASK-538.02), so a step's view cannot reach the other pane.
3. state/board-routing/intent.ts: the view intent names every pane the choice reached, each with its view before. It is met when any of them reads another view. The first pane to report pushes one history entry, and the second report replaces it, so the choice is one entry (criterion 1).
4. clients/application/workspace-port.ts: announcingViews announces chooseView, not showView, so the port's read for a restore sets no intent. Back and a reload read each pane through its own addressed view (criterion 2).
5. hooks/application/use-pane-views.ts: the pane's view choice calls chooseView.
6. Tests: linked-panes.test.tsx (a choice in A reads both and adds one history entry; Back restores both; a load of an address with viewA and viewB restores both; a view chosen beside a drilled pane does not reach it). intent.test.ts for the intent over two panes.
7. CONTEXT.md Linked panes and docs/design/operator-canvas-shell.md say that a view chosen in one linked pane is read in both.

Proposal: Browser application@TASK-538.03 (from TASK-538.02) describes the view link on Linked panes. No other board draws the readings or the address intent.
<!-- SECTION:PLAN:END -->
