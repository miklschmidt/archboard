---
id: TASK-445
title: Export a board without comparison decoration
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 18:29'
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
- [ ] #1 semantic render and semantic rasterize accept --no-comparison and send comparison=off to the existing render endpoint.
- [ ] #2 The default keeps comparison decoration. Raw, file and clipboard destinations honor the selected comparison behavior.
- [ ] #3 Export receipts identify undecorated output without claiming that comparison marks were drawn. Help and consumer guidance explain the flag.
- [ ] #4 Focused tests prove both commands use the existing undecorated render and preserve the default behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add --no-comparison to both command contracts and pass the existing comparison=off choice through the board client.
2. Use null for comparedWith when comparison is disabled so receipts describe the picture. Keep the default receipt unchanged.
3. Extend the existing export tests and update help, audit and skill guidance. Run the combined validation gate with TASK-444.
No architecture board is affected: the commands retain the same renderer and client paths. This task exposes an existing render option without adding, removing or rewiring a part. TASK-354 is a separate existing renderer issue about historical container shape.
<!-- SECTION:PLAN:END -->
