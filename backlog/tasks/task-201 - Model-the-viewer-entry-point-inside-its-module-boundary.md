---
id: TASK-201
title: Model the viewer entry point inside its module boundary
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 11:58'
updated_date: '2026-09-13 12:00'
labels: []
dependencies: []
ordinal: 360000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Board viewer diagram ends the browser mount at a container and begins fetching at an anonymous border point, hiding the actual entry path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Browser mount crosses the Semantic viewer boundary to a code-backed entry point which initiates semantic fetching.
- [x] #2 Existing subject identities are preserved and the updated board is verified in the live viewer.
- [x] #3 The archboard skill explains boundary-crossing connections, real entry-point subjects, and when whole-container endpoints are appropriate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Read the actual mount and query path; add the SemanticBoardStage entry-point responsibility, retarget the two existing connections, clarify the presentation responsibility, and inspect the rendered board.

Add the authoring rule to the tracked archboard skill and sync installed copies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified ApplicationPane mounts SemanticBoardStage, whose useQuery(semanticRenderQuery(...)) initiates fetching. Added one code-backed entry-point subject and retained every existing ID; each retargeted edge changes only one endpoint. CLI accepted version 3 and the live viewer visibly draws Browser client through the module boundary to Viewer entry point, then Fetch semantic reads. Skill rule distinguishes internal receiver calls from whole-module relationships; synced both installed copies and formatting passes. The optional Python skill validator could not start because its runtime lacks PyYAML; frontmatter was unchanged. Simplification: existing containment and edge semantics suffice; no new schema, validator exception, or renderer mode.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the Board viewer entry path and documented the boundary/entry-point authoring rule in the archboard skill. Verified against source, CLI validation, and the live browser; preserved existing subject IDs.
<!-- SECTION:FINAL_SUMMARY:END -->
