---
id: TASK-537.01
title: >-
  The Board tab lists the board's pass-through entry points, and a result asks
  the agent the deletion question
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:03:00Z'
updated_date: '2026-10-25T19:25:00Z'
labels:
  - design-questions
  - ui
dependencies: []
parent_task_id: TASK-537
type: feature
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of TASK-537. It proves the region, the pick and the question to the agent from end to end on the board on screen. It needs no ADR change, because ADR 0044 already names pass-through entry points in words wherever an interface is listed.

It also adds the way a pane asks the agent a question. Today only the diagnostics bell can ask (`Application.tsx`). TASK-539 reuses it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a board whose containers have pass-through entry points, the Board tab shows a Design questions region with the question, its count, and each result named by its container and part
- [x] #2 Choosing a result picks the part on the picture
- [x] #3 Ask the agent makes the pane's checkout active and sends one message that names the vault, the board, the variant and the part, and tells the agent to change nothing
- [x] #4 The ask control is absent on a page that has no agent, such as a recording page
- [x] #5 The answer type holds counts and lists only, so nothing in it can hold a score
- [x] #6 On Command interface, the region lists the 13 pass-through entry points of Commands
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: Board viewer@TASK-537.01 adds List design questions and Pane ask under Stage and reads, with four relationships. Browser application@TASK-537.01 adds Pane ask under Board drawing, two relationships, and widens the activation label of Application composition -> Shown conversation.
2. packages/board: passThroughEntryPoints(content) beside inspectContainer, exported through @archboard/board/container-interface, with a unit test.
3. Pane ask: hooks/application/use-ask-from-pane.ts activates the pane's checkout, refreshes the transport and asks; the diagnostics bell uses it too. PaneViewSources gains ask, null on a recording page. ApplicationPane provides PaneAskContext (state/semantic-board-canvas/pane-ask.ts), and hooks/semantic-board-canvas/use-pane-ask.ts reads it.
4. rules/semantic-board-canvas/board/deletion-question.ts builds the message: -C vault, --url, board, variant, part id and name, change nothing.
5. components/semantic-board-canvas/DesignQuestions.tsx: a Board tab region between the reading region and the key. One question with its count, rows by container and part. Hover lights, choosing shows the part, Ask the agent only where the pane has an ask.
6. Tests: the board rule; a rendered stage-harness test of the region (count, rows, choose picks, ask sends one message naming the ids, no control without an ask); the message builder by ids and flags, not wording.
7. Update the Board tab region lists in docs/design/operator-canvas-shell.md and pane-sidebar-hierarchy.md and in the SemanticBoardPanel header.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned, with these deviations:
- DesignQuestions takes the answers from SemanticBoardPanel, which draws the region only when passThroughEntryPoints(content) has a result.
- No unit test of deletionQuestion: the rendered test sends the message and checks the vault, board, variant, part id and container id, and repair.test.ts already owns the quoting of archboardIn. A hook test (ask-from-pane.test.tsx) holds the order activate, refresh, ask, also when the switch fails. useAskFromPane now takes the transport and the ask, not the whole workbench.
- The real page showed the Ask control pushed past the sidebar edge; the row now uses the walkthrough row grid (4f80740d9).
- Board viewer@TASK-537.01: List design questions binds DesignQuestions.tsx as a whole file, because Render stage states binds the directory and claimed the code outside the bound symbol (RELATIONSHIP_UNDRAWN to Pane ask). It gains List design questions -> Pane vault. Two planned edges are dropped: List design questions -> Ask the picture to show (usePeekControl lives in hooks/use-peek.ts, which no part binds, so ANCHOR_MISMATCH) and Browser client -> Pane ask (PaneAskContext lives in state/pane-ask.ts, unbound on this board; Browser application draws who provides it, as Board viewer already leaves Pane vault).
- Browser application@TASK-537.01: the pane ask edge starts at Pane composition (ApplicationPane.tsx), not Application composition, after the footprint named Pane composition changed and not named. Application composition -> Shown conversation is now anchored at Application.tsx conversationActivation.
- Code check: archboard check --code --variant TASK-537.01 against the same run without --variant shows no difference.
- Footprint read against base 0fa07a5fb (the commit before f50c64dc3). Board viewer: namedAndChanged Render stage states, List design questions, Pane ask; changedNotNamed none; namedNotChanged Pane vault, named only by a relationship. Browser application: namedAndChanged Pane composition, Pane ask; changedNotNamed none; namedNotChanged Application composition and Shown conversation, named only by relationships. Application.tsx, use-pane-views.ts, use-page-recording.ts and use-ask-from-pane.ts are bound by no part of either board.
- Criterion 6: on this checkout Command interface (current TASK-515) has 14 results, the 13 of Commands and runCommand in Command contract; archboard semantic inspect agrees per container. The live page showed 15 because the repository chosen checkout is the feat-reusable-codex-workbench worktree, whose board differs; the rule gives 15 on that file too.

Adopted on Board viewer and Browser application. Behind: Archboard (packages/board in f50c64dc3) stays true: no import between packages was added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Board tab lists the entry points that only pass one call on, each named by its container and part. Choosing one picks it, and Ask the agent activates the pane's checkout and sends one question that names the vault, board, variant and part and says to change nothing. A page with no agent shows no ask control. The answer holds counts and lists only. Verified by semantic-board-design-questions.test.tsx, ask-from-pane.test.tsx and the full gate. Command interface had 13 in Commands at the time; it has 14 since TASK-537.04 added the Questions command, which also passes one call on. Adopted on Board viewer and Browser application.
<!-- SECTION:FINAL_SUMMARY:END -->
