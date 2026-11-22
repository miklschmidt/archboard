---
id: TASK-663.03
title: A picture is read through a lens that says how many lines it left out
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:54:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reading side of TASK-663. Built-in lenses: main (the default: hides dependencies and in-process queries and computes, shows every mutation and all traffic between processes), effects (every mutation however it travels), reads, network, dependencies, all. A vault replaces a built-in in place. A lens never removes a part of its scope. The CLI takes --lens <id> on render and rasterize (ids only; refused on a sequence or flowchart); --hide-kind stays. The picture says how many lines the lens left out, even without a legend; the browser has a lens control and Show all selects the all lens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every built-in lens draws what its definition shows and never removes a part
- [x] #2 model render and model rasterize take --lens, refuse it on a flow grammar, and the recipe records it
- [x] #3 A picture through a lens that left lines out says how many, with and without a legend
- [x] #4 The browser reading chooses a lens, remembers it in the address, and Show all selects all
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model: a lens rule module (selector matching, the lens in effect for a policy and an id); projectModel takes filters.lens, keeps every part of its scope, applies manual kind hides after the lens under their existing stranded rule, and returns the lens in effect and the count of joined lines left out against the all lens.
2. Contract: the render request takes lens; the server refuses an unknown lens (LENS_NOT_FOUND) with the ids it has, and records the lens in effect in the recipe; a recipe from before lenses replays as all.
3. CLI: --lens on model render and rasterize (and browser show), refused with a flow grammar; --hide-kind help says it subtracts from the lens.
4. Renderer core: the export frame takes the left-out note and draws it under the picture with or without a legend.
5. Browser: lens in the address per pane, a lens control at the head of the legend's Relationships section (chosen over the header after screenshots of both), the left-out count beside it, Show all selects all and clears hides, choosing a lens clears hides; bookmarks and beats read through all; a reading with one lens shows no control.
6. Tests through each interface; screenshots in both themes; gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Placement of the lens control (settled point 12): built both, screenshots in artifacts/lens/. The header variant crowded the state chip and stood apart from the kind switches and Show all it works with; the legend variant keeps lens, count, switches and Show all as one group on the legend's two columns, so neither the count nor another lens moves a word of the legend.
A reading with a single lens (an old-format vault, whose only lens is all) shows no lens control. examples/web-shop is old format, so the site's mock legend still matches the app; when TASK-663.04 upgrades web-shop and site/model, the site's PanelLegend mock needs the lens row.
Bookmarks and walkthrough beats keep no lens, so they read through all; adding a lens to beats and bookmarks is not in this task.
Evidence: packages/model/tests/shared/rules/model-projection.test.ts (each built-in lens draws its definition, keeps every part, counts left-out lines; hides subtract; a joined line keeping one member is not left out); tests/system/models/model-render-context.test.ts (render --lens, recipe names the lens, note with and without legend, refused on sequence, LENS_NOT_FOUND lists the ids); tests/system/browser/canonical-model-legend.test.ts (lens control, list of six lenses, lensA in the address survives reload, Show all selects all and clears hideKinds).
Gates: types, lint:all, format:check, format:core, test:modules 5346/0, test:repository pass, test:system 228/0 (one run had a flaky workbench-example socket timing failure that passed alone twice and on the rerun), test:solo 15/0, test:serial-browser pass, cargo test 488/0, clippy pass. check:model: old-format UPGRADE_REQUIRED, 2 ANCHOR_SYMBOL_MISSING, 3 MODULE_SHALLOW, as expected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A picture is read through a lens. The projection reads a structural picture through the lens it names or the vault's default (main), keeps every part of its scope, subtracts hand-hidden kinds afterwards, and counts the joined lines it leaves out against all. model render and rasterize take --lens (ids only; refused on a sequence or flowchart), browser show takes --lens, an unknown lens is refused with the ids the reading has, and the recipe records the lens in effect while a recipe from before lenses replays through all. An export draws 'Main lines: N lines left out' under the picture with or without a legend. In the browser, the legend's Relationships section opens with the lens control and the count; the address keeps the lens per pane; choosing a lens clears hidden kinds; Show all selects all; revealing a relationship the lens hides widens to all; bookmarks and beats read through all. Follow-up for TASK-663.04: the site's mock legend needs the lens row once web-shop is upgraded.
<!-- SECTION:FINAL_SUMMARY:END -->
