---
id: TASK-590.04
title: An explanation answer reads as a reply card under the selection
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T15:24:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1047000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site Ask your architecture tile: the selection with its kind chip, quiet Explain and Talk keys, and the answer on a plane under a gold Codex label.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An answer shows on a ringed plane with a gold Codex label
- [x] #2 The selected or open module shows its kind chip before its name, as the site's mock panel does, with no Explain with Codex or Talk key beside it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC2 is built and verified: the reply stands on a plate in the tray with a gold Codex label, captured in both themes through the fake Codex of canonical-model-explanations.test.ts. AC1 is open. Explain with Codex is already a quiet key, but the panel has no kind chip beside it and no Talk key. The subject's name already heads the panel and Talk is the dock's key, so both would repeat what is on screen. This needs the owner's decision before more work.

2026-11-07: the owner chose the site's row with the kind chip and the name, without the Explain with Codex and Talk keys. Built in 376bc55d1 after the site's own mock panel (site/src/components/window/Inspector.astro): chip, display name, and the kind with the code path under it. The chip takes the icon the picture draws the kind with, through the scene's appearances, so it is the picture's icon and not the fallback. Checked by screenshots at 1920x1080, scale 2, in both themes, for the open Checkout API and the selected Timeout guard. Lint, types and the web unit tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An explanation reads as a reply card on a ringed plane with a gold Codex label. The head of the right panel shows the module's kind chip before its name, as the site's mock panel does, with the picture's icon for the kind. At the owner's request it adds no Explain with Codex or Talk key beside the name. Verified by screenshots in both themes and by lint, types and the web unit tests.
<!-- SECTION:FINAL_SUMMARY:END -->
