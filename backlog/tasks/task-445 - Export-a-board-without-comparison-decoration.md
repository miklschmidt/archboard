---
id: TASK-445
title: Export a board without comparison decoration
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 18:29'
updated_date: '2026-10-07 19:19'
labels: []
dependencies: []
references:
  - TASK-354
ordinal: 728000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user needs plain SVG and PNG exports of a selected variant. The render endpoint already accepts comparison=off, but the CLI does not expose that choice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 semantic render and semantic rasterize accept --no-comparison and send comparison=off to the existing render endpoint.
- [x] #2 The default keeps comparison decoration. Raw, file and clipboard destinations honor the selected comparison behavior.
- [x] #3 Export receipts identify undecorated output without claiming that comparison marks were drawn. Help and consumer guidance explain the flag.
- [x] #4 Focused tests prove both commands use the existing undecorated render and preserve the default behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add --no-comparison to both command contracts and pass the existing comparison=off choice through the board client.
2. Use null for comparedWith when comparison is disabled so receipts describe the picture. Keep the default receipt unchanged.
3. Extend the existing export tests and update help, audit and skill guidance. Run the combined validation gate with TASK-444.
No architecture board is affected: the commands retain the same renderer and client paths. This task exposes an existing render option without adding, removing or rewiring a part. TASK-354 is a separate existing renderer issue about historical container shape.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both commands forward comparison=off through a shared render request mapper. Focused tests compare the undecorated SVG and PNG source digest, prove removed-subject omission, exercise raw/file/clipboard destinations, and require comparedWith:null only when comparison is disabled. Default comparison behavior remains covered. bun run check passed all normal lanes. No architecture rewiring occurred; the combined TASK-444 footprint records the internal Render and Board client changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added --no-comparison to semantic render and semantic rasterize, including clipboard output. Export receipts report comparedWith:null for plain output. Focused export tests and the complete gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
