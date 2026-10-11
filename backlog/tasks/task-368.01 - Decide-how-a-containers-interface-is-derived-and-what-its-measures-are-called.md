---
id: TASK-368.01
title: Decide how a container's interface is derived and what its measures are called
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:05'
labels:
  - interfaces
  - semantic-model
dependencies: []
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: high
type: docs
ordinal: 694000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposal 2 of docs/design/design-checks.md derives a container's interface from reach: the children that relationships reach from outside it. Several questions need an answer first. What counts as outside, when containers nest? Does a relationship that ends on the container itself (allowed for a whole-module dependency) make an entry point? How does a pass-through entry point look on a board? The measures also need a name that is not "scorecard", which already means how readable a drawing is (CONTEXT.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An ADR records the derivation: what counts as outside, how nesting and relationships to the container itself count, and what a pass-through entry point is
- [x] #2 The ADR records that the interface is derived and never authored (ADR 0031), and how drafts, comparison and history use it
- [x] #3 `CONTEXT.md` defines the new terms, each with an _Avoid_ line, and the measure name does not collide with Scorecard
- [x] #4 The codebase-design vocabulary (module, interface, seam, depth) maps onto the terms, and the ADR says where they differ
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draft ADR 0044 from the task's open questions and the subtasks it serves. 2. Add the glossary entries to CONTEXT.md. 3. An independent reviewer verifies every claim against the code, settles the open points and fixes the text. 4. Accept and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drafted by one agent and reviewed by an independent one on 2026-10-06 (the user delegated acceptance to that review). The reviewer recounted both vaults, fixed a measurement scope, a false claim about relationship kinds and the Container glossary entry, and settled eight open points in the ADR. The full list of choices goes to the user for the final review.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ADR 0044 decides that a container's interface is derived from the relationships that reach its children from outside, never authored. It names entry points, hidden parts, callers, pass-through entry points and the five interface measures, and it maps the codebase-design vocabulary onto them. CONTEXT.md defines each term with an Avoid line. Verified by an independent review against groups.ts, the renderer's tree code and recounts of both vaults.
<!-- SECTION:FINAL_SUMMARY:END -->
