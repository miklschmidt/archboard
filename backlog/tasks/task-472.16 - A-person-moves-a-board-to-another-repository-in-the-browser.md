---
id: TASK-472.16
title: A person moves a board to another repository in the browser
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 07:13'
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
- [x] #1 A person can choose a target repository or untracked vault for a board and move it through a guarded loopback route
- [x] #2 Before the move, the browser lists the drill-downs that it will rewrite
- [x] #3 After the move, the pane that showed the board shows it in its new repository
- [x] #4 A refused move says why, in the terms of the refusals of `semantic move`
- [x] #5 The control is operable from the keyboard and has an accessible name
- [x] #6 PRODUCT.md's constraints and AGENTS.md's invariants name the move as the second browser write beside a take-back, and the archboard skill mentions it
- [x] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Board close, footprint read against base f628cd778 (parent of the first TASK-472.16 code commit 3319362c8), HEAD e0213259e. Code check: findings diff with and without --variant TASK-472.16 showed one introduced finding (RELATIONSHIP_UNDRAWN, Board move reaches Semantic viewer via boardAddressOf in MoveBoardControl.tsx); drew it with its anchor. Two findings cleared (Archboard server -> Board store, Board store -> Vault checkouts on Board persistence). Corrected descriptions to HEAD: Board move (dialog stays open until the move answers, preview read again after a refusal, name via board key), Move route (usableBoard refusal in the move's codes), Move/Read and validate/Write under lease (optional reader, readSemanticBoardAtAsLeased). Footprint: Browser application, Archboard server routes and Board persistence all namedAndChanged as planned; namedNotChanged are only parts named by a relationship (Board catalog, Server requests, Address and locate, Former names, Vault checkouts), which is normal. changedNotNamed: Board store container (src/runtime/semantic-board-store), 220e9b590 and 3319362c8: bound to a directory, read as changed because Move preview and Read and validate inside it changed, and Move preview is named. Write under lease (write.ts, 220e9b590) is named as changed. Skipped parts: drill-downs of other boards and one unbound part, none from this task. src/server/archboard/lib/semantic-write-requests.ts (860a8f132, usableBoard exported) binds to no part. Adopted: Board persistence v57, Archboard server routes v47, Browser application v66, committed in 6d72677ae. archboard check reports no diagnostics. archboard check --code: 3 ANCHOR_SYMBOL_MISSING warnings on other boards (Archboard, Board rasterizer, Command interface) predate this task. Behind: Archboard server board (src/server/archboard, 14 commits) is still right: the new route is a route of an existing group that drills down to Archboard server routes.

Review: three reviewers (store/route, browser module, browser-server contract). Fixes: 220e9b590 (a preview persists no migration and answers the version the move finds), 860a8f132 (preview refuses in the move's codes; route added to the vault-naming owner), 165eea75c (dialog stays open while a move runs), 675f205f8 (board name through boardAddressOf), 8331838e5 (browser test waits for focus), a8adc9bb9 (skill wording), e0213259e (preview read again after a refused or stopped move; seed helper takes a drill-down). Contract reviewer found no mismatch: a claimed board refuses a person's move at once with BOARD_HELD. Proposals adopted in 6d72677ae on Browser application v66, Archboard server routes v47 and Board persistence v57. Gate: bun run check passed on 6d72677ae (test:modules 4660 pass, test:system 233 pass, test:repository 27 pass, serial browser lane exit 0).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A person moves a board to another repository from the Move board control in its pane's header. The dialog lists the ready repositories and untracked vaults other than the board's own, previews every drill-down the move rewrites through GET /api/semantic-boards/move-preview (the store's previewSemanticMove runs the move's own checks and rewrites on disk, holding and writing nothing), shows a refusal in the move's own words, and posts the existing move route with origin human and the previewed version, so no doing line is written. The server then moves the pane to the board in its new repository. Verified by the store owner in move.test.ts (the preview lists exactly what the move rewrites, writes nothing, and its version is the one the move accepts), the browser owner in semantic-drill-address.test.ts (keyboard move, refusal for a target that has the board, pane follows), move-dialog.test.tsx (dialog held open during a move, board name without its variant), and the full gate on 6d72677ae.
<!-- SECTION:FINAL_SUMMARY:END -->
