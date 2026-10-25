---
id: TASK-537.01
title: >-
  The Board tab lists the board's pass-through entry points, and a result asks
  the agent the deletion question
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:03:00Z'
updated_date: '2026-10-25T17:11:00Z'
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
- [ ] #1 On a board whose containers have pass-through entry points, the Board tab shows a Design questions region with the question, its count, and each result named by its container and part
- [ ] #2 Choosing a result picks the part on the picture
- [ ] #3 Ask the agent makes the pane's checkout active and sends one message that names the vault, the board, the variant and the part, and tells the agent to change nothing
- [ ] #4 The ask control is absent on a page that has no agent, such as a recording page
- [ ] #5 The answer type holds counts and lists only, so nothing in it can hold a score
- [ ] #6 On Command interface, the region lists the 13 pass-through entry points of Commands
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
