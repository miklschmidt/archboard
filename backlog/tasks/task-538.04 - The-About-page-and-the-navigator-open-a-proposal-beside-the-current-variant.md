---
id: TASK-538.04
title: The About page and the navigator open a proposal beside the current variant
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T04:21:00Z'
labels:
  - compare
  - ui
dependencies:
  - TASK-538.02
parent_task_id: TASK-538
type: feature
ordinal: 945000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided on 2026-10-25 to keep TASK-388: the Board tab lists no variants. The About page already lists every variant with its record and shelving reason, and opens one in the same pane. Alt on a navigator row already opens a board beside. Neither keeps the view, and the About page cannot open beside.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The variant timeline of the About page offers to open a draft or a shelved variant beside the variant that the board's name opens
- [ ] #2 Opening beside from the About page or the navigator keeps the view of the pane it came from
- [ ] #3 With one pane, the second pane opens, and a third proposal replaces the pane beside and never adds a pane
- [ ] #4 The Board tab still lists no variants
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Open beside from the About page, keeping the view.

1. components/semantic-board-canvas/AboutVariants.tsx: while the pane reads the variant the board's name opens (reading.opens), each draft and shelved row ends with an Open beside control (IconButton, RiLayoutColumnLine, as the About part rows end with Show on the diagram). It opens that variant of the board on screen in the pane beside (criterion 1). Historical rows and the row on screen offer none.
2. Plumbing: AboutPage onBeside, SemanticStageView, SemanticBoardStage onOpenBeside(key), ApplicationPane, use-pane-views paneElement, to the shell's openBeside. The key is the board on screen with the variant's id.
3. hooks/application/use-beside-opening.ts: openBeside(key, repository?) defaults to the repository of the pane it came from. When the board opened beside has the name of the board on screen in that pane, the pane beside reads it through that pane's view (criterion 2, About and the navigator alike). Unchanged: with two panes it replaces the other pane, with one it adds the second (criterion 3).
4. hooks/application/use-pane-reading.ts: arriveThrough(paneId, arrival or null) holds the view a pane is to read the board it is about to be shown through. boardChanged applies it when the adopted board has that name, and forgets it either way. A pane whose own board already has that name reads the view at once, because an adoption of the same board keeps its view. A refused show forgets the arrival.
5. The Board tab is untouched and still lists no variants (criterion 4).
6. Tests: an application test (one pane: About, Open beside on a draft opens the second pane on it through the view; a second Open beside replaces that pane and adds none), and one for the navigator's Alt keeping the view.
7. docs/design/operator-canvas-shell.md: the About page's variants and the navigator's Alt say what opening beside does.

Proposals: Browser application@TASK-538.04 adds a part Beside opening (use-beside-opening.ts, in Application composition) with the navigator and the About page calling it. Board viewer@TASK-538.04 says on Render stage states that a draft or shelved variant opens beside.
<!-- SECTION:PLAN:END -->
