---
id: TASK-280
title: Wrap long branching chains into automatic downward columns
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 14:10'
updated_date: '2026-09-19 15:24'
labels:
  - renderer
  - layout
dependencies: []
references:
  - >-
    backlog/tasks/task-245.06 -
    Wrap-a-flat-chain-shaped-board-toward-the-panes-shape.md
priority: medium
type: enhancement
ordinal: 494000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After rejecting automatic horizontal architecture readings, the user asked whether long chains can wrap and chose top-to-bottom columns placed side by side. The former ELK renderer had a limited fold mode (TASK-245.06); the new Graphviz/libavoid renderer needs a fresh feasibility result without restoring its coupled policies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Column count is selected dynamically; the accepted seven-card and branching mTLS examples choose two downward columns without board-specific rules
- [x] #2 Small branches and semantic containers remain intact, every relationship retains identity and labels, and wrapping does not conceal oversized rank gaps
- [x] #3 One-column and wrapped alternatives are visually compared, the prototype is preserved separately, and production behavior passes focused tests and full check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compare one, two and three downward-column readings on real boards; retain every alternative for user choice. Integrate the approved balanced multi-relationship folds with native placement/routing, whole frames, dynamic pane-fit selection and a configurable 5% relative improvement threshold. Verify compact branching and marginal-gain examples, focused tests and the full gate, then preserve authored prototype sources separately from production.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User prefers B (two columns) for the seven-card example, but requests dynamic column count. Slightly branching chains are required for usefulness: current-cloud-infrastructure@vib1439P should wrap into two downward columns. Extend real-board comparison and show alternatives before adopting or discarding them.

User approved full branching mTLS two-column split after Portal API hostname, conditional on fixing excessive gaps and arrow defects. This becomes an accepted example for automatic column selection, not a hardcoded board rule.

User compared Phone one/two-column images and explicitly chose one column, rejecting marginal fit gains that lengthen routes. Require meaningful fit improvement for wrapping; preserve accepted branching mTLS two-column result.

The approved Phone A reading places its host above the frame rather than sharing its rows. The shared-container regression retains completeness, containment, label and card clearance, fit, route-length and crossing checks for Phone; row-sharing remains required for Public API, while automatic-columns owns the approved one-column Phone shape. The rasterizer full-page fixture now encloses its 24-stage chain in one semantic frame so it stays taller than 1080 with automatic wrapping enabled.

Prototype preserved from validated production 260ffd3f on codex/prototype-downward-columns, commit 4c0bd6d3. Source: src/transformers/semantic-renderer/prototype-downward-columns/. Regenerate with bun src/transformers/semantic-renderer/prototype-downward-columns/run.ts. All 21 alternatives and comparison.html regenerated successfully in /tmp/archboard-columns-capture; derived files are ignored. Generated full mTLS two-column and Phone one-column PNGs visually inspected. Fresh CUA interaction with the local HTML was blocked by its file-URL policy; earlier viewer inspection is documented in the prototype README.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Automatic downward wrapping now preserves small branches, whole frames, identity and labels, selects counts by settled pane fit, and requires a configurable 5% relative improvement before adding a column. User-approved examples retain two columns for the command path and full branching mTLS board, three for a 24-stage chain, and one for Phone ownership. Focused fold/reading/automatic tests and 16 rasterizer/shared-container/automatic tests pass; parent verified full bun run check exit 0 and 24 clear corpus drawings on 260ffd3f. The primary-source prototype is separately committed as 4c0bd6d3 with verified regeneration of all 21 alternatives.
<!-- SECTION:FINAL_SUMMARY:END -->
