---
id: TASK-253.04
title: Capture every board view an author made for grading
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 444000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S14 declares only the whole-board capture, so the views the 2026-09-17 candidate made to answer a tangle (TASK-243.02) never reached the grader and readability stayed judged on the tangle, at 60% more tokens. View names are the author's own, so a capture cannot name them in advance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A scenario capture can declare every board view of a board without naming them; the harness takes one capture per view the author made, and a board with no views is not a failed or incomplete capture
- [x] #2 S14 declares it and eval:skill check accepts the inputs
- [x] #3 A fast test owns the expansion and the no-views case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. suite.ts: EveryViewCaptureSchema {label, board, variant?, views: every}; scenario captures accept it but need at least one named capture. 2. captures.ts expandCaptures turns requests into one declaration per board view. 3. author.ts expands in readAfter and partialCaptures. 4. S14 declares flask-view; README and rubric describe it. 5. Tests in captures.test.ts; suite.test.ts narrowed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A scenario capture may be {label, board, variant?, views: "every"}. expandCaptures (captures.ts) turns it into one declaration per board view, in the view grammar, labelled <label>-<view slug> (unique, never ending like a tile file), after the author ran (readAfter) and for failed runs (partialCaptures reads the vault when it can). No views means no captures. The scenario schema refuses captures that are all every-view, so no run can end with zero declared captures and read incomplete. S14 declares flask-view. Tests: captures.test.ts (expansion, no views, no board); suite.test.ts narrowed to named captures. README and rubric describe it.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scenarios can capture every view an author made on a board; S14 does. Verified by captures.test.ts expansion tests (views, none, no board), bun run eval:skill check (suite ok) and bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:FINAL_SUMMARY:END -->
