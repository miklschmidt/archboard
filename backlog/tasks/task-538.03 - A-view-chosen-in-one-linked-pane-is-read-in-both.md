---
id: TASK-538.03
title: A view chosen in one linked pane is read in both
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T04:18:00Z'
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
- [x] #1 With the panes linked, choosing a view in one pane reads both panes through it, as one history entry
- [x] #2 Back restores both previous views, and a reload restores both
- [x] #3 A walkthrough step's view and a drilled level's view are not linked
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned in c983dddae.

- rules/application/pane-link.ts: each linked pane carries ownBoard, derived from status.opened naming the board on screen. sameLinks compares it through samePartner.
- hooks/application/use-pane-reading.ts: chooseView(paneId, view) reads the view in the pane, and in the linked pane while that pane reads its own board, and returns each pane reached with its view before. showView stays one pane, and only a restore uses it.
- state/board-routing/intent.ts: the view intent names every pane reached and is met when any of them reads another view. The first pane to draw it pushes the entry and the other's report replaces it.
- clients/application/workspace-port.ts: announcingViews announces chooseView. A restore's read through showView is no longer announced, so it leaves no expectation behind after Back or a load.
- A view chosen at a drilled level stays in use-level-reading and never reaches the shell. A presented walkthrough ends the link (TASK-538.02), so a step's view never reaches the other pane.

Tests: linked-panes.test.tsx gained three tests: a choice in A reads both, adds one history entry and Back reads both as before; Back reads each linked pane through its own earlier view, not the other's; a pane that drilled into the board beside it keeps its level's view, and its own board keeps its own view. intent.test.ts gained the two-pane intent. Removing each behavior in turn fails its test: the choice reaching one pane only (2 tests fail), reaching a drilled pane (1), and a restore reading across the link (1).

Browser QA on a copy of examples/web-shop, port 3415, dark, 1920x1080: Web shop (Synchronous checkout) beside Queued fulfilment. Choosing Place an order in pane A read both panes through the sequence, history 2 to 3. Back read both whole, Forward and a reload read both through the sequence again. Inventory service in A beside Web shop drilled into Inventory service in B: A's Reserve an order's items left B's level whole, and B back on Web shop read it whole. Screenshots in /tmp/archboard-brainstorm/linked-view/.

Closing: the code check findings with and without --variant TASK-538.03 are the same 41. Footprint read against base 95351731c (the plan commit, the parent of c983dddae): Linked panes is named and changed. Application composition changed but is not named: workspace-port.ts announces chooseView in place of showView, inside only, and the relationships it draws are unchanged. Skipped parts are drill-downs and unbound containers. use-pane-reading.ts, use-pane-views.ts and intent.ts are bound by no part. The descriptions of Workspace routing, Application composition and Pane session stay true.

Gate: bun run check passed with exit 0 after c983dddae (4932 module, 257 system, 142 repository tests and the browser lane). Adopted on Browser application (version 143). archboard check reports no diagnostics, and archboard check --code puts no board behind for c983dddae.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A view the person chooses in one linked pane is now read in both, while the other pane reads the board it was opened on. The choice is one history entry: the view intent names every pane it reached, and the first pane to draw the view pushes the entry that the second replaces. A restore (Back, Forward, a load) reads each pane through its own addressed view with showView, which is one pane and no longer announced, so it never crosses the link and leaves no expectation behind. A level somebody drilled into keeps its own view in both directions, and a presented walkthrough still ends the link. Verified by three new linked-panes application tests, the two-pane intent test, a check that removing each behavior fails its test, browser QA on the web-shop copy (Place an order read in Synchronous checkout and Queued fulfilment, history grew by one, Back, Forward and reload as expected, and the drilled case), the full gate, and the code check (41 findings either way). Adopted on Browser application.
<!-- SECTION:FINAL_SUMMARY:END -->
