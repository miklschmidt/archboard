---
id: TASK-538.04
title: The About page and the navigator open a proposal beside the current variant
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T04:41:00Z'
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
- [x] #1 The variant timeline of the About page offers to open a draft or a shelved variant beside the variant that the board's name opens
- [x] #2 Opening beside from the About page or the navigator keeps the view of the pane it came from
- [x] #3 With one pane, the second pane opens, and a third proposal replaces the pane beside and never adds a pane
- [x] #4 The Board tab still lists no variants
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned in d192ca5f3.

- AboutVariants.tsx: while the pane reads the variant the board's name opens (reading.opens), every row keeps an end column, and a draft or shelved row that is not on screen has Open beside there (IconButton, RiLayoutColumnLine, slot variant-beside). Historical rows and the row on screen have none.
- The pane's openBeside goes ApplicationPane onOpenBeside, SemanticBoardStage, SemanticStageView (the key is the board on screen with the variant's id), AboutPage onBeside. Application.tsx gives each pane a stable function through the actions binding.
- use-beside-opening.ts: openBeside(key, repository?, from?). The repository defaults to the pane it came from. When the board has the name of the board on screen in that pane, the pane beside reads it through that pane's view: at once with showView when its own board has that name (an adoption of the same board keeps the view), else through arriveThrough before the show. A refused show forgets the arrival.
- use-pane-reading.ts: arriveThrough(paneId, arrival or null), held in a Map outside render state. boardChanged reads the arrival's view when the adopted board has its name, else keeps or clears the view as before, and forgets the arrival either way.
- The Board tab is untouched (criterion 4); the dark screenshot 1-board-tab-lists-no-variants.png shows its sections.

Tests: the shop fixture of linked-panes.test.tsx moved to tests/ui/support/application/shop-panes.ts, because the file passed 600 lines. open-beside.test.tsx: the About page opens a proposal beside through the view on screen and a shelved one then replaces the pane beside with no pane added; Alt on a navigator row opens beside through the active pane's view. Removing the view carry fails both, and ignoring the arrival at adoption fails both.

Browser QA on the web-shop copy, port 3415, dark, 1920x1080, screenshots in /tmp/archboard-brainstorm/open-beside/: one pane on Web shop through Place an order; the About page offered Open beside on Queued fulfilment and Event-sourced orders only; Queued fulfilment opened in pane B through Place an order (viewB in the address); Event-sourced orders then replaced pane B, two panes.

Not changed, noted: with one pane, opening beside makes two history entries, from the navigator as from the About page. The added pane first shows the board of the active pane and is active (one entry), then the board opens in it (another). This was so before this task, and no criterion covers it.

Closing: the code check findings with and without --variant TASK-538.04 are the same 41. Footprint read against base 3d3e09880 (the plan commit, the parent of d192ca5f3). Browser application: Board stage and Beside opening named and changed. Application composition changed, not named: Application.tsx composes openBeside with the readings and hands panes a stable function, workspace-port.ts gives NO_READINGS an arriveThrough; inside only. Pane composition changed, not named: ApplicationPane passes onOpenBeside to the stage; the relationship it carries is drawn from Board stage to Beside opening. Shell is named only by its new relationship; Navigator already called openBeside. Board viewer: Render stage states named and changed. Viewer entry point changed, not named: SemanticBoardStage gained the optional onOpenBeside prop, which it hands to the view; inside only.

Adopted Browser application@TASK-538.04 (version 146) and Board viewer@TASK-538.04 (version 157). archboard check reports no diagnostics. bun run check passed to completion (exit 0, no failed test).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A draft or shelved row on the About page now has Open beside while the pane reads the variant the board's name opens. It opens that variant in the pane beside, as Alt on a navigator row does. Both keep the view of the pane they came from when the board is the one on screen there. With one pane the second pane opens; with two the pane beside is replaced and no pane is added. The Board tab is unchanged. Verified by open-beside.test.tsx (both entry points, each fails without the view carry), dark browser QA on the web-shop copy, and the full gate. Follow-up, approved by the owner: opening beside with one pane makes two history entries.
<!-- SECTION:FINAL_SUMMARY:END -->
