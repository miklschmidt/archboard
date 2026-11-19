---
id: TASK-645
title: >-
  Redesign the comparison interface: header, change list, resizable column and
  right panel
status: Done
assignee: []
created_date: '2026-11-18T22:56:00Z'
updated_date: '2026-11-19T01:18:00Z'
labels:
  - frontend
  - design
dependencies: []
priority: high
ordinal: 1086000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In a proposal read against its base, the pane header puts the state chip, the comparison select and the change walker beside the breadcrumbs and the code path, so reading controls look like navigation. The Changes section of the left column repeats each owner as a label over one-line rows, restarts its rails at every group so the column looks broken, and cuts most rows short in a fixed 280px column. The right panel sets every section alike, with no icons, so a reader cannot scan it. The user asked for a creative redesign, not a minimal fix (2026-11-18).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pane header holds the location (crumbs and code path) apart from the reading controls (state, comparison, walk)
- [x] #2 The Changes section reads as a tree with continuous rails: an owner is one row, its own change sits on that row, and its other changes stand under it
- [x] #3 The walk of the changes, with its position and keys, stands with the change list it walks
- [x] #4 A reader can drag the left column wider or narrower, and the browser keeps the width
- [x] #5 Each section of the right panel opens with an icon, and a changed field reads as a diff of removed and added words
- [x] #6 DESIGN.md describes the new header, change list, column width and panel sections
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Part the pane header on the picture/panel line: location and the joined state|comparison control over the picture, Diagram | About and the pane keys in a side slot as wide as the panel (min(360px, 46cqw)).
2. Move the change walk into a sticky strip under the Changes head; count changes by standing in the head.
3. Make owners and flow collections real tree rows with chevrons, so rails hang from a row; an owner's own change sits on its row; delete Tree.Section.
4. Make the navigator resizable with react-resizable-panels (240-520px, double-click resets to 280px), sharing width storage with the conversation column.
5. Give every section label an icon from one mapping (SECTION_ICONS); turn Against <state> into a diff card with a standing chip; line rows end with their kind's sample; the code path breaks after slashes.
6. Update DESIGN.md and docs/agents/frontend.md, audit the site mocks, simplify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design advice from an independent advisor shaped the plan: one icon mapping through SectionLabel in both columns, collections converted with owners so Tree.Section goes, line-kind samples on panel rows, was/now kept as accessible names.
Verified in the running app (scratch copy of the main checkout's vault, draft 3nkEfr1W) in both themes with agent-browser: header line at x=1560 matches the panel's left edge; drag to 380px persists across reload; double-click resets to 280px.
Browser tests pass: canonical-model-comparison, reader-column, shell-layout, canonical-model-legend, canonical-model-inspection, canonical-model-selection. bun run lint passes.
The architecture model needs no proposal: no module description states the header, column or panel layout.

After user feedback rounds: the header dropped the code path and keeps 16px at both ends; the panel dropped the kind word, opens each section with a rule and keeps rows on the label's edge; the tree's icon sits 6px from its words, a level steps in by one chevron column, leaves keep no chevron slot and a leaf with no marker starts its words where its parent marker's ink starts; every rail ends in a tick; left-column sections open with a rule; the site's mock list scrolls.
Reviewed with sol-loop: 3 rounds with gpt-6.2-sol (7 reviewers, then 2, then 1). Picked 13 fixes (panel path wrap, panel-part width, panel part only while the panel shows, folds that hold the walk's place or the flow on screen, sticky rows bounded by their owner or collection, owner standing for screen readers, arrow focus clear of sticky rows, owner scroll in normal flow, site phone fade and canvas-only phone view). Replaced one (narrow header: chip and crumb floors, not a scrolling header). Declined one (a fallback for a missing side slot, which ModelFrame never produces). Discarded one duplicate.
Final checks: bun run lint, frontend tsc, site build, browser tests canonical-model-comparison, reader-column, shell-layout, canonical-model-legend, canonical-model-inspection, canonical-model-selection pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The comparison interface is redesigned. The pane header parts where the picture meets the right panel: crumbs and the joined state|comparison control over the picture, Diagram | About and the pane keys over the panel. The change walk is a sticky strip under the Changes head. The change list is a tree of owners with their own change on their row and other changes as leaves on ticked rails; interface changes and flow collections fold as rows. The left column drags between 240px and 520px and keeps its width. Both side columns label sections with icons from one mapping and open sections with a rule; the Against section is a diff card. DESIGN.md, docs/agents/frontend.md and the site's mock window describe the result. Verified in the running app in both themes and with one and two panes, by the browser tests above, lint, type check and the site build.
<!-- SECTION:FINAL_SUMMARY:END -->
