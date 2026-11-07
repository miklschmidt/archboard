---
id: TASK-582.02
title: Painting owns the paint directory, and its design constants are a part
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T15:13:00Z'
updated_date: '2026-11-06T15:30:00Z'
labels:
  - model
dependencies: []
parent_task_id: TASK-582
priority: medium
ordinal: 1025000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Painting has no binding, so `crates/archboard-scene/src/paint/design.rs` and the other files no part binds belong to no module. Its part SVG document is bound in another crate, `crates/archboard-svg/src/lib.rs`. This is the first container repaired under the containment rule, as a proposal for the owner to adopt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A draft proposal binds Painting to crates/archboard-scene/src/paint and adds a Design constants part bound to paint/design.rs
- [x] #2 The proposal places SVG document in a module whose binding holds its code, read from source
- [x] #3 archboard check --state on the draft reports no containment warning for Painting, and no new warning or error elsewhere
- [x] #4 No proposal is adopted
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draft a proposal on current jRNHx2a1: bind Painting to the paint directory, add Design constants (design.rs) and Viewer marks (marks.rs), move SVG document beside the per-crate painters under renderer. 2. Draw the relationships the code check asks for and the callers of Design constants. 3. Check the draft with the containment rule and with the #50 checker.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Draft s3dmAjji, Painting owns the paint directory. Changes: Painting binds crates/archboard-scene/src/paint. Design constants binds paint/design.rs and Viewer marks binds paint/marks.rs. SVG document moves to renderer beside Painter core and Browser painter, because it is the archboard-svg crate. New relationships: Painter stage to Viewer marks (the warning mark), Viewer marks to Theme palette and to Subject standing marks, and Flowchart, Sequence layout and Core render to Design constants. archboard check --state s3dmAjji: Painting has no containment warning, and the containment warnings fall from 84 to 83. With the PR 50 checker, check code on the draft reports 0 warnings and 188 information findings, against 0 and 184 on current. The main checkout's checker still reports TEST_IMPORT_UNEXPOSED on design.rs until PR 50 merges, because it treats every Rust file but mod.rs as private. model compare: Painting has 5 entry points, 10 hidden parts and 5 callers, against 4, 10 and 3. Not adopted.
<!-- SECTION:NOTES:END -->
