---
id: TASK-021
title: 'Panes: give each pane its own board'
status: To Do
assignee: []
created_date: '2026-08-19 19:17'
labels: []
dependencies:
  - TASK-006
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Side-by-side current-vs-proposed is the reason panes exist (CONTEXT.md), but the server holds one active board, so today both panes necessarily show it. TASK-006 built the reporting half — `panes` already reports the board each pane adopted, per pane, so no reporting shape has to change — and deliberately left addressing out, because addressing is a change to authority rather than to reporting.

The hard part is not the second board; it is that `activeBoard()` is what every board-blind caller means today (add, describe, clear, promote, board save, most of the REST surface, every CLI and MCP tool). Once two panes hold different boards, "the board" is ambiguous for all of them, and the task has to decide what an unqualified write targets: the focused pane, the primary pane, or a still-single active board that one pane may deviate from. Board switching is also broadcast to every client at present (`board_switched` goes to all sockets), so a pane has to be able to be addressed individually.

The follow-up is worth it: without it, `panes` can distinguish left from right by viewport and selection but never by subject, and the comparison workflow the shell was built for cannot be done on screen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane can be pointed at a board without changing what the other pane shows
- [ ] #2 It is unambiguous which board an unqualified write (add, clear, promote, save) targets, and that rule is documented
- [ ] #3 A board switch reaches only the pane it was addressed to
- [ ] #4 panes reports the two different boards without any change to its output shape
- [ ] #5 The shell offers the human a way to open a board into a specific pane
<!-- AC:END -->
