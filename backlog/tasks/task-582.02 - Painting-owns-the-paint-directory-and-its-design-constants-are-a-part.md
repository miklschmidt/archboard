---
id: TASK-582.02
title: Painting owns the paint directory, and its design constants are a part
status: To Do
assignee: []
created_date: '2026-11-06T15:13:00Z'
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
- [ ] #1 A draft proposal binds Painting to crates/archboard-scene/src/paint and adds a Design constants part bound to paint/design.rs
- [ ] #2 The proposal places SVG document in a module whose binding holds its code, read from source
- [ ] #3 archboard check --state on the draft reports no containment warning for Painting, and no new warning or error elsewhere
- [ ] #4 No proposal is adopted
<!-- AC:END -->
