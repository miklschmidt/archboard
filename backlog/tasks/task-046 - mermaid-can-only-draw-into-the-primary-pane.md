---
id: TASK-046
title: mermaid can only draw into the primary pane
status: To Do
assignee: []
created_date: '2026-08-20 03:55'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/panes.ts
  - src/cli/commands/scene.ts
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Left named but unfixed by TASK-033, which gave viewport, screenshot and image export a --pane argument and did not reach mermaid.

mermaid still resolves its target with primaryPane(), so you cannot convert a diagram into the right pane. The refusal tells you to move the board into the primary pane first, which means taking the current architecture off screen to draw a proposal, in a tool whose point is having both up at once.

The TASK-033 agent named the honest fix rather than doing the quick one: resolve the pane from the board mermaid already requires, rather than adding another --pane argument. Every mermaid call names a board, and a board is in at most one pane, so the pane is already determined and asking for it again would be a second way to say the same thing. That changes documented behaviour, which is why it was left.

Worth checking whether any other route still resolves through primaryPane() once this lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mermaid draws into the pane holding the board it was given
- [ ] #2 No route resolves a target through primaryPane() where the board already determines the pane
- [ ] #3 The skill and TESTING.md no longer tell anyone to move a board into the primary pane first
<!-- AC:END -->
