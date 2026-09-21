---
id: TASK-293.02
title: A pane says which parts of its reading the hand of the user changed
status: Done
assignee:
  - '@claude'
created_date: '2026-09-21 02:08'
updated_date: '2026-09-21 02:41'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-293
priority: high
ordinal: 509000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A pane posts its whole reading as one debounced snapshot (pane-reading.ts, 150 ms) and its focus on its registration; neither says what changed or who caused it, and every kept report publishes the same selection event. The only cause evidence today is presentation.answering, which tells a driven walkthrough step from one chosen by hand. Pane news needs the same for board, variant, view, selection and focus. Only the pane can tell a click from a change that arrived over its socket (pane_present, pane_board, a reload for a new version), and one snapshot can mix the two, so the mark is per part. Deny by default: a part nobody marked is told to nobody, so forgetting a mark produces silence, never the 2026-09-20 feedback loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reading report names which of board, variant, view and selection the user changed by hand since the last report; focus needs no mark because nothing the server sends moves the active pane, which ADR 0034 records
- [x] #2 A change that reached the pane over its socket or followed a new board version is never marked, including when it shares a report with a change made by hand
- [x] #3 A driven walkthrough step, whose selection changes with it, marks nothing
- [x] #4 The wire schema owns the shape, and a report without marks is accepted and means nobody is told
- [x] #5 A focused owner in the pane proves a click marks and a socket-driven change does not
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wire shape (src/shared/semantic-pane-context): an optional byUser list of parts (board, variant, view, selection) on the reading report; absent or empty means nobody is told. The pane registration gains the same for focus.
2. pane-session reading publisher: mark(part) records that the user asked for that part to change; a flush of a drawn reading reports the marked parts that actually differ from the last drawn reading it sent and consumes them. An undrawn reading (NOTHING_READ between two boards) neither reports nor consumes. A republish after a reconnect reports none. Pane core exposes it as userChanged(part).
3. Gesture boundary, the only places that mark: paneElement handlers (pick, view, variant) when the value really changes; the stage drill-down and back (board); a routing operation started for a pane (user or restore, both the user: board and variant), unmarked again when it ends without the pane moving. Everything else is unmarked by construction: boardChanged clearing a pick, a walkthrough beat reading through its own view, pane_present, pane_board from browser show, a reload for a new version.
4. Focus: mark where the active pane is changed by a click or key, not where a pane opening or closing moves it.
5. Server: schemas accept and keep the marks; nothing consumes them yet (TASK-293.03).
6. Owners: publisher unit tests (a marked change is reported once, an unmarked one never, a mixed snapshot reports only the marked part, an undrawn reading keeps the mark, republish reports none); a rendered owner that a click on the stage marks selection and a driven presentation step marks nothing; schema tests for the optional field.
7. ADR: the pane states the cause per part and unmarked parts are told to nobody.
8. Verify lint, fmt, type-checks, modules, system, serial browser lane; commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found while researching: a walkthrough step never changed the selection; it changes the view the beat reads through and the presentation position, and every kept report published the same selection event whatever changed. A board the user opens from the picker reaches the pane as the same pane_board message as an agent browser show, so the shell marks board and variant before it asks (user-moves.ts) and withdraws them when the server refuses. Focus got no wire field: nothing the server sends moves the active pane, so a field would always be true; ADR 0034 says a message that could move focus must carry a cause first. AC 1 was reworded to match. For TASK-293.06: the server cannot tell the user show request from an agent one either; the request will have to say.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The reading report carries byUser: the parts (board, variant, view, selection) a gesture marked and this report really changed. Marks live in pane-session/lib/user-marks.ts: a pick or view mark is dropped by the next drawn report if unused, a board or variant mark waits across the moment the pane reads nothing and is withdrawn on refusal; a resend or a republish carries none. Marked at the gesture boundary only: the stage pick and view callbacks in ApplicationPane, drill-down, back and choices inside a drilled board through a stage onUserChanged prop, the picker and variant choice in shell-actions, the address bar in workspace-port. ADR 0034 records the decision. Verified: six publisher tests (marked once, mixed snapshot, unused gesture, board across nothing-read, refused open, republish), a rendered test that a driven step raises neither callback, the picker test owning the board mark, and in real Chrome a driven step reporting no byUser while a real pointer pick reports ["selection"]; lint, fmt, both type-checks, modules 3445 pass, system 169 pass, serial browser lane with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
