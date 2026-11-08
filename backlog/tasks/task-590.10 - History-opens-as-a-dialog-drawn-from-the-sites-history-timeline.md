---
id: TASK-590.10
title: History opens as a dialog drawn from the site's history timeline
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:06:00Z'
updated_date: '2026-11-07T16:34:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
ordinal: 1053000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner said that even the 448 px column is too narrow for History, and that History must become a dialog that draws heavily on the history demo of the marketing site (site/src/components/demos/HistoryTimeline.astro).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 History opens in a dialog with the current state on a gold-ringed card and the other states as nodes on a rail, each with its date and reason
- [x] #2 Everything the History tab does today is reachable in the dialog
- [x] #3 The dialog is a shadcn dialog of the ui-kit and is checked by screenshots in both themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ModelHistoryDialog: a ui-kit Dialog that holds the record of the model, opened from the History key of the column and from the state chip of the header.
2. The record draws the site's history: the current state on a gold-ringed card, the other states as nodes on one rail with the lifecycle word, the name, the date and the reason. Each state folds its saved checkpoints; a checkpoint opens on a click and offers Compare.
3. Choosing a state, a checkpoint or Compare closes the dialog and reads it in the pane. The rows load only while the dialog is open.
4. A reading that failed shows the History key alone in the column, with the same dialog.
5. Screenshots in both themes; the browser owners of History open the dialog.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence, 2026-11-07, at 1920x1080 on an own server (port 13459, own XDG_STATE_HOME and ARCHBOARD_REPOS):
- AC 1: the captures history-dark.png and history-light.png show the current state on a gold-ringed card and the other states as nodes on one rail, each with its lifecycle word, name and reason. A state shows its date when the record holds one.
- AC 2: the browser owners choose states, saved readings and Compare in the dialog, and pass: canonical-model-structure, -lifecycle, -comparison, -publication, -reconciliation, -code, -import, -planning, -proposals, -explanations, -navigation, -references, -viewer, canonical-model-agent-navigation and workspace-address. The header's state chip opens the same dialog.
- AC 3: ModelHistoryDialog is the ui-kit Dialog (Dialog.Content, Header, Title, Description). Captures in both themes.
- A reading that failed shows the History key alone, with the same dialog. Captures failed-dark.png and failed-history-dark.png. Choosing Current in it recovers the reading.
- A choice closes the dialog. The browser helpers wait for the dialog to close before the next click, because its fade covers the page for 100 ms.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
History opens in a ui-kit Dialog drawn from the site's history timeline. The current state stands on a gold-ringed card, and the other states stand as nodes on one rail with their lifecycle word, name, reason and date. Each state folds its saved readings, and each saved reading offers Compare. A choice of a state, a saved reading or a comparison closes the dialog and reads it in the pane. The History key of the column and the state chip of the header open the dialog, so its open state lives in useReader. The rows load only while the dialog is open. A reading that failed shows the History key alone.

Verification: tsc exit 0, lint:all exit 0, the unit tests 1029 pass, test:core exit 0, and 23 browser files with 35 tests pass. Captures in both themes were read.

Commits: e14c9858e (column and dialog), e9cee70b2 (docs).
<!-- SECTION:FINAL_SUMMARY:END -->
