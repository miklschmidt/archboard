---
id: TASK-187
title: Propose a readable architecture layout model on the living boards
status: Done
assignee:
  - '@codex'
created_date: '2026-09-12 22:40'
updated_date: '2026-09-12 22:42'
labels: []
dependencies: []
type: docs
ordinal: 346000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The real workbench map exposes wasted space, truncated responsibilities and long routes on a small graph. The user requested a board variant explaining the suggested renderer change before implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A renderer proposal explains measured cards, containment-aware placement, geometric routing and shared paint/atlas geometry
- [x] #2 The server proposal links to the exact renderer proposal while current variants remain unchanged
- [x] #3 Proposal views render and the proposal is displayed in the frontend
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current renderer and server boards plus layout ownership. 2. Branch Readable layout variants and edit the proposed pipeline with stable IDs. 3. Render the views, verify links and unchanged current content, and show the proposal in Browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created Readable layout draft variants on archboard/modules/renderer and archboard/services/server. Preserved existing subject IDs; added Card measurement and folded the old Edge routing responsibility into Compound layout. Added focused pipeline/integration views and a five-beat walkthrough with acceptance evidence and unresolved engine choice. Verified six proposal renders, both exact named cross-board links, and unchanged current variant objects. Displayed the focused pipeline with the walkthrough in Browser; released both claims. No renderer implementation changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Authored and displayed linked Readable layout proposals for the renderer and server. The design measures readable text before layout, replaces the fixed grid and corridor router with one compound placement/routing owner, and shares final geometry between painting and the interaction atlas. All proposal views render; current variants remain unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
