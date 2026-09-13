---
id: TASK-190
title: Nest same-destination routes with coordinated lanes and ports
status: Done
assignee:
  - '@codex'
created_date: '2026-09-12 23:41'
updated_date: '2026-09-12 23:53'
labels: []
dependencies: []
ordinal: 349000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current renderer Architecture drawing view crosses literal colors and placed architecture despite both routes entering SVG painters on the same side. Earlier source must take outer lane and lower arrival port, later source inner lane and upper arrival port. Lane-only swapping moves the crossing rather than removing it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Routes sharing a destination and side nest longer spans outside shorter spans with coordinated destination ports, removing the reported crossing.
- [x] #2 Rendered regression covers edge ordering, mirrored sides and direction where applicable, preserving obstacle routing, badge attachment and12-unit card whitespace.
- [x] #3 Verify current living Architecture drawing in the browser and pass the complete repository check.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the real route crossing and minimize a rendered fixture. 2. Coordinate geometric nesting order in track and port allocation without authored hints. 3. Verify renderer regressions and living vault spacing/labels. 4. Restart final server, verify the original view, then run the full gate with server stable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The initial coordinated grouping correctly fixed the target but applied too broadly to multi-channel approaches, increasing strict crossings149->162. Narrowed to the geometric case where nesting is valid: single-channel U-shaped routes with the same departure/arrival side. Audit now149->148 across22 dark architecture renders, only reported Architecture drawing changes1->0; no render increases. No global crossing optimizer or board hints introduced.

Final implementation uses the same stable group-slot reorder for lane and port allocations. Four rendered nesting cases cover forward-left, forced forward-right, returning-right, and an unrelated same-corridor route, each with reversed edge order and both themes.112 renderer tests pass. Parent verified live Architecture drawing after final server restart: literal colors outer/lower and placed architecture inner/upper, visibly no crossing. Independent audits:149->148 strict crossings,44 renders/380labels with0 detached, all22 dark views >=12 badge-card clearance. Full gate initially caught test-file length limit; split cohesive nesting tests and shared drawn-label measurements without removing assertions, baseline lint now passes; complete rerun pending.

Complete bun run check passed exit0 after tests-only split: lint, formatting, types, build, module/system/repository suites and serial browser tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Coordinated lane nesting and destination ports for single-channel same-side U-shaped routes, removing literal colors/placed architecture crossing on current Architecture drawing. Verified112 renderer tests, live browser, full bun run check exit0 and22-view pair audit where the reported crossing is the only changed pair (1->0). Badge spacing >=12 and zero detached labels retained across vault audits.
<!-- SECTION:FINAL_SUMMARY:END -->
