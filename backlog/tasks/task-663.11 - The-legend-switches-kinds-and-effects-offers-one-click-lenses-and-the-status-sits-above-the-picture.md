---
id: TASK-663.11
title: >-
  The legend switches kinds and effects, offers one-click lenses, and the status
  sits above the picture
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T14:12:00Z'
updated_date: '2026-11-22T15:10:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Isolating one question took six clicks, and the lens outcome sat at the bottom or in the sidebar (spec section 5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The legend shows lens presets, Kind rows with eyes, Effect rows with eyes, then read-only marks
- [x] #2 Clicking a row's name shows only that row; its eye still toggles it
- [x] #3 Rows the lens leaves out sit dimmed under Left out by this lens, with no switch
- [x] #4 The lens and its outcome show above the picture
- [x] #5 A selected line lists each relationship it joins with its kind and effect
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Address: hideEffects<pane> in search, address and location; a lens and Show all clear both lists; reveal clears the kinds and effects of what it reveals.
2. Legend rows from the whole scope (legend-rows.ts): kinds and effects with hidden, dimmed and left-out-by-lens; solo and toggle as pure rules.
3. Legend Relationships section: lens presets (ToggleGroup trough), kind rows (headless sample in the kind's ink), effect rows (the renderer's sample), Left out by this lens, then marks incl. comparison standings.
4. Status line above the picture in the reading heading (ModelLensStatus), replacing the legend's left-out note.
5. Selected line: head and rows say kind and effect (pairNames).
6. Pointing plays the effect: PictureStage.playEffects -> painter.playEffects, fired from the resting part, skipped under reduced motion.
7. CALL_TIMING_MISMATCH and DEPENDENCY_CALLED names, call timing on evidence.
8. Unit tests (legend rows, lens status, search) and browser tests (legend, filters, surface); screenshots in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: artifacts/t663-evidence/v2 (main, solo, Sync compute lens, selected joined line, legend zooms, pointing frames; light and dark). Checks: tsc frontend clean; tsc source has one error in tests/system/browser/drawn-glyphs.test.ts (renderer fixture, outside this task); lint:policy, lint:tests, lint:css clean (lint:all stops earlier on clippy in archboard-scene, TASK-663.10's crates); format clean; bun test --isolate apps/web/tests/ui 687 pass; browser lane: canonical-model-legend, -filters, -surface, -modes, -inspection pass. Not done here: DESIGN.md's legend and right-panel paragraphs still describe the old legend (whole row is the switch, effect key headless, mixed line, Show all only for kinds); the site's mock PanelLegend.astro still shows the old legend; both belong to the records and site audit after TASK-663.10 and .12 land.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The reader's legend now opens Relationships with the lenses as one-press presets, then kind rows (headless sample in the kind's ink) and effect rows (the renderer's own sample with its head), each with an eye; a row's name shows it alone (again shows all). Rows the lens leaves out sit dimmed under Left out by this lens with no switch, then the marks (emphasis, traffic, comparison standings). The address carries hideEffects beside hideKinds; a lens and Show all clear both. The status line (e.g. Main lines · 5 lines left out, or Main lines has no lines here · Showing all relationships) sits in the reading heading above the picture. A selected line says Kind · Effect for each relationship it joins. Pointing at a line or card calls painter.playEffects once (not under reduced motion). The finding chip names CALL_TIMING_MISMATCH and evidence says how each call runs. Follow-ups: DESIGN.md legend paragraphs and the site's mock legend need the new shape.
<!-- SECTION:FINAL_SUMMARY:END -->
