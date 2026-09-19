---
id: TASK-280
title: Wrap long branching chains into automatic downward columns
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-19 14:10'
updated_date: '2026-09-19 15:08'
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
- [ ] #1 Column count is selected dynamically; the accepted seven-card and branching mTLS examples choose two downward columns without board-specific rules
- [ ] #2 Small branches and semantic containers remain intact, every relationship retains identity and labels, and wrapping does not conceal oversized rank gaps
- [ ] #3 One-column and wrapped alternatives are visually compared, the prototype is preserved separately, and production behavior passes focused tests and full check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Probe native placement constraints for linear stretches, render comparable examples, inspect continuation routes, and capture the result on a throwaway branch before deciding production adoption.

Integrate the user-approved multi-relationship cut approach behind one automatic layout decision, preserving the unwrapped candidate and choosing column count by usable pane fit; validate exact branching board after spacing and route correctness fixes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User prefers B (two columns) for the seven-card example, but requests dynamic column count. Slightly branching chains are required for usefulness: current-cloud-infrastructure@vib1439P should wrap into two downward columns. Extend real-board comparison and show alternatives before adopting or discarding them.

User approved full branching mTLS two-column split after Portal API hostname, conditional on fixing excessive gaps and arrow defects. This becomes an accepted example for automatic column selection, not a hardcoded board rule.

User compared Phone one/two-column images and explicitly chose one column, rejecting marginal fit gains that lengthen routes. Require meaningful fit improvement for wrapping; preserve accepted branching mTLS two-column result.

The approved Phone A reading places its host above the frame rather than sharing its rows. The shared-container regression retains completeness, containment, label and card clearance, fit, route-length and crossing checks for Phone; row-sharing remains required for Public API, while automatic-columns owns the approved one-column Phone shape. The rasterizer full-page fixture now encloses its 24-stage chain in one semantic frame so it stays taller than 1080 with automatic wrapping enabled.
<!-- SECTION:NOTES:END -->
