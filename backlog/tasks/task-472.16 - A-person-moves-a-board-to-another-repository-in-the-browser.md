---
id: TASK-472.16
title: A person moves a board to another repository in the browser
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 06:33'
labels:
  - frontend
dependencies:
  - TASK-472.15
  - TASK-472.05
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 836000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants a person to move a board without an agent. ADR 0051 makes this the second exception to agents author, users read, beside taking back a claim. Like a take-back, the move is the person's own act and writes no doing line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person can choose a target repository or untracked vault for a board and move it through a guarded loopback route
- [ ] #2 Before the move, the browser lists the drill-downs that it will rewrite
- [ ] #3 After the move, the pane that showed the board shows it in its new repository
- [ ] #4 A refused move says why, in the terms of the refusals of `semantic move`
- [ ] #5 The control is operable from the keyboard and has an accessible name
- [ ] #6 PRODUCT.md's constraints and AGENTS.md's invariants name the move as the second browser write beside a take-back, and the archboard skill mentions it
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preview: previewSemanticMove in the store runs the move's own checks and rewrites against both vaults on disk, holding and writing nothing, and GET /api/semantic-boards/move-preview?vault=&board=&to= answers {version, from, to, rewritten} or the refusal in the move's codes and statuses. Owner: move.test.ts (the preview lists exactly what the move then rewrites, and changes nothing).
2. The move: the browser posts the existing POST /api/semantic-boards/move with origin human (no doing line, ADR 0051 and ADR 0016), the board, the preview's version as expectedVersion and move.to; the browser origin guard already holds every route to the page's own origin, as for a take-back. The server already moves every pane on the board into the target vault, chooses a non-chosen target checkout, and announces.
3. UI module src/ui/board-move: a Move board control beside the pane's present and close controls (PaneControls) that opens a dialog: a radio list of the repositories the board can move to (every ready repository and untracked vault except the pane's own identity), the preview for the one chosen (each drill-down it rewrites: board, part and what it will open), a refusal in the move's terms, and Move and Cancel. Keyboard: the dialog primitive traps focus, the radio group moves with arrows, Escape cancels; the control's accessible name is 'Move <board> to another repository'.
4. Owners: the store test for the preview; a browser owner (in an existing drill or address owner) that moves a board by keyboard, sees the rewrite listed, and finds the pane on the board in its new repository; a refused move (a target that already has the board) says why.
5. Docs: PRODUCT.md's constraints and AGENTS.md's invariants name the move as the second browser write beside a take-back; the archboard skill mentions it; docs/agents/frontend.md if the module needs a line.
6. Boards: proposals named TASK-472.16 on Browser application (the board-move module and its calls) and Archboard server routes (the preview route), drawn after the code lands.
<!-- SECTION:PLAN:END -->
