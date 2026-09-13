---
id: TASK-197
title: Restore the removed place-grid relationship in the renderer proposal
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 10:53'
updated_date: '2026-09-13 10:54'
labels: []
dependencies: []
ordinal: 356000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Renderer layout proposal reused the old place-grid edge ID for a call to the newly introduced Compound layout node. Comparison therefore marked it changed and omitted the obsolete route to Grid placement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The proposal shows place grid as removed and graph and measured sizes as added, with the Initial variant unchanged.
- [x] #2 Both renderer comparison vaults show the corrected relationship distinction in the live browser.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Correct the authored proposal with one CLI batch per comparison vault: remove the misused relationship and add the new relationship without an ID. Verify the saved comparison and rendered SVG in the browser; no renderer code change is needed.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the Renderer layout proposal in both comparison vaults through atomic CLI batches. The reused edge was removed and its replacement created with a fresh identity. HTTP/SVG assertions confirm place grid is removed, graph and measured sizes is added, the old route and label are present, and Initial is unchanged. Refreshed the real comparison browser and verified the deleted arrow is visible. No renderer source changes or additional test machinery were needed.
<!-- SECTION:FINAL_SUMMARY:END -->
