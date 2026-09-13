---
id: TASK-191
title: Explain the readable layout proposal with before-and-after sequences
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 00:01'
updated_date: '2026-09-13 00:08'
labels: []
dependencies: []
ordinal: 350000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer proposal changes boxes but does not show the internal calls, data contracts or responsibility shifts. The user needs sequence diagrams to review it and suggested Pretext for card measurement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Linked detail board compares current rendering with the proposed call sequence and shows what moves between measurement, placement/routing and painting.
- [x] #2 Pretext preparation and line-layout APIs appear in a focused sizing sequence with the server Canvas/font compatibility question stated accurately.
- [x] #3 Updated proposal sequences render and are opened in the frontend; existing identities and current architecture meaning are preserved.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current code and official Pretext runtime/API contract. 2. Author a linked renderer-layout detail board with current/proposed sequences and a focused measurement exchange. 3. Add an overview sequence and drill-downs to the existing renderer proposal. 4. Render and inspect the views, verify links and source facts, show the proposed sequence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored linked archboard/modules/renderer-layout: current Today sequence, draft Proposed render, Pretext sizing and Inside layout sequences, plus contextual responsibility views and walkthroughs. Added Render sequence and detail links to the existing renderer proposal; original current renderer variant object verified unchanged. Official Pretext source5ac3fd17 requires Canvas2D and exposes no measurement injection API; diagram states preferred supported-adapter direction and native Canvas alternative as open integration work. No dependency installed and no renderer implementation changed. Five sequence views rendered through production CLI, detailed views visually checked in Browser; current/proposed back-links and no remaining reconciliation verified. Updated vault README.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added before/after and focused internal sequence diagrams to review the readable layout proposal, linked from the original renderer board. Pretext preparation/wrapping and our card-sizing policy are separated; server font-host compatibility is explicitly unimplemented. Production renders and live browser views verified; original current renderer preserved.
<!-- SECTION:FINAL_SUMMARY:END -->
