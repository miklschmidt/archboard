---
id: TASK-200
title: Make sidebar pane markers local and clarify the variant tree
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 11:30'
updated_date: '2026-09-13 11:40'
labels: []
dependencies: []
ordinal: 359000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The navigation marks Agent workbench as pane B and the current Renderer layout as pane3 even though the visible workspace has only Initial in A and Readable layout in B. Lifecycle badges occupy separate rows and the ancestry connectors/indentation are unclear.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pane markers reflect only this workspace in A/B order, resolve current and explicit variant aliases, and show both panes when the same variant is open twice.
- [x] #2 Variant names and compact metadata share a readable row, with clear ancestry branches and working disclosure/keyboard navigation.
- [x] #3 Regression reproduces the erroneous global pane inventory behavior; browser QA verifies the supplied two-pane arrangement and the full gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduce local-versus-global pane mismatch with a shell contract test; derive markers from the existing ShellView panes; polish tree rows and connectors; verify the real two-pane workspace and run the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the global-inventory bug with three failing shell regressions before changing the source. Navigator markers now derive from ShellView.panes and share PaneBar lettering; aliases and two panes on one variant are covered. Two visual passes put metadata inline, strengthen board headings, align 21px ancestry gutters, and terminate per-branch guides at the last child. Live browser QA verified Initial A and Readable layout B, no Agent workbench marker, collapse/expand without selection changes, active-pane highlighting, and dark/light contrast. Simplification: reused existing local pane state and alias resolver, removed lifecycle badge chrome and continuous group borders; no new state or rendering mode.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed sidebar pane letters to use only the current workspace, with alias resolution and both-pane markers. Completed two visual polish passes: inline metadata, stronger board headings, consistent ancestry indentation and properly terminating branch guides. Four focused shell regressions pass; live dark/light browser QA verified the supplied A/B arrangement, disclosure and active selection. Full bun run check passed (exit 0).
<!-- SECTION:FINAL_SUMMARY:END -->
