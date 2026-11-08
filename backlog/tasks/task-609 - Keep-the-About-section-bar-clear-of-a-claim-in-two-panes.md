---
id: TASK-609
title: Keep the About section bar clear of a claim in two panes
status: Done
assignee:
  - '@codex'
created_date: '2026-11-08T17:39:00Z'
updated_date: '2026-11-08T17:52:00Z'
labels: []
dependencies: []
type: bug
ordinal: 1063000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review of 959e65959..50dcd8798 found that the claim card covers Parts, Connections, Groups, and States in the narrow About section bar. The defect occurs with two panes at 1920 pixels. DESIGN.md requires the title tools and section bar to stay reachable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The About section bar and title tools remain reachable beside a live claim, before and after scrolling, in one pane and two panes.
- [x] #2 The claim remains reachable and moves no content when ownership starts or ends.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Put the narrow section bar before the title. 2. Measure the title row for claim clearance, including wrapped names and changes in pane width. 3. Test pointer access and visible title lines in one pane and two panes, including scrolling. 4. Run lint, types, the six focused browser files, and manual theme and site inspections.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Affected model subjects: vKEsyHFk/yejBBUFY#TLCeNkdh and vKEsyHFk/yejBBUFY#n2ONtqdt. The existing module responsibilities and relationships remain accurate. This repair changes placement within About and adds no architectural owner, so no proposal is needed.

The fixed offset also covered a second title line at 900 pixels. A ResizeObserver now derives clearance from the title row, independently of scroll position. The final design keeps ModelControls as the sole claim owner and adds no portal targets or React state. Browser assertions inspect pointer access and each visible text line rather than CSS values.

Validation passed: lint:all with zero warnings or errors, both TypeScript projects, formatting, and all six requested browser files. The claim owner passed again after the observer refinement. Manual agent-browser inspection on port 43819 covered both themes, wrapped titles, About transitions, walkthrough loading and failure, fullscreen take-back by keyboard, two panes, offline transitions, and failed-read recovery. Browser console inspection found no React warnings. The site paintings and diagrams were regenerated for inspection. Only generated subject IDs changed in two SVG files, so those unrelated changes were restored. The site contains no About page mock that needs this repair.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
About places its narrow section bar before the title. The claim uses the measured title row instead of a fixed offset, so wrapped names and section keys remain readable and reachable. Browser tests cover visible title lines, pointer access, scrolling, and separate surfaces in two panes. The claim owner and portal lifecycle stay unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
