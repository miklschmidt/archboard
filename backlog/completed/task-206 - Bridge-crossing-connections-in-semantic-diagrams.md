---
id: TASK-206
title: Bridge crossing connections in semantic diagrams
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 20:18'
updated_date: '2026-09-13 20:37'
labels: []
dependencies: []
ordinal: 365000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers need to distinguish unavoidable connector crossings from junctions in the semantic renderer. The later-painted connection should visibly arc over earlier connections without changing card placement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Proper crossings show a bridge on the upper connection, with lower ink separated cleanly in light and dark themes.
- [x] #2 Shared endpoints and collinear overlaps do not produce false bridges; labels, traffic, selection and interaction geometry remain consistent.
- [x] #3 Deterministic runtime regressions, live diagram QA and the complete check gate pass.
- [x] #4 Bridges are semicircular with a restrained 1.5 drawing-unit gap on each side of the upper ink.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Detect proper crossings of final routed connections in existing paint order, preserving cards and labels. 2. Shape upper bridges as semicircles with shared crests for nearby crossings; clear lower ink by only 1.5 units on each side of the upper arc. Use the same curves for visible ink, traffic, selection and atlas. 3. Verify rendered geometry, compare the live diagram in both themes, simplify, and run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented deterministic bridges on later-painted straight crossings, with nearby crossings sharing a crest. SVG masks clear only lower connection ink; the bridged curve drives line, halo, traffic and atlas. Proper-crossing regressions cover paint order, deterministic light/dark output, multiple crossings, traffic/halo agreement, atlas coverage and fan-in/fan-out non-crossings. Existing flank-label regression now excludes only emitted bridge segments when checking its original straight lane, retaining card-clearance checks. Actual Semantic renderer proposal produced five lower-edge masks with byte-identical node atlas positions before/after. Live dark/light inspection passed; complete check is running.

User visual refinement: replaced S-shaped shoulders with quarter-circle cubics and removed the masking mechanism entirely so lower lines remain continuous. Regression helpers are being adapted to recognize the round geometry directly.

Final user preference restores a narrow mask: 1.5 drawing units clear on each side of the round upper arc (cutout stroke = upper stroke + 3), instead of the original broad halo clearance.

Final verification: all 3060 tests and every bun run check stage passed (exit 0; /tmp/task206-round-check.log). Twelve focused geometry tests passed with 446 assertions. Browser QA confirmed semicircular bridges and restrained gaps on the actual current/proposal Semantic renderer diagrams; node positions are unchanged. Main canvas restarted with the final renderer and comparison panes restored. Simplification keeps bridge geometry separate from its narrow SVG mask and uses one curve for painting, traffic, selection and atlas.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added deterministic semicircular crossing bridges on later-painted connections with only 1.5 units of clear space on each side. Preserves cards, labels and route corridors; skips cramped and non-crossing contacts. Verified live diagrams, light/dark geometry and 3060 passing tests through bun run check.
<!-- SECTION:FINAL_SUMMARY:END -->
