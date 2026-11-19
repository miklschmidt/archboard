---
id: TASK-653.04
title: Width counts a Rust type's public methods wherever they are declared
status: To Do
assignee: []
created_date: '2026-11-19T16:39:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
ordinal: 1117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard-deepen run found that Stage's public methods enter, dive and end_dive (crates/archboard-paint/src/stage/arrival.rs:21,143,174) live in a private module file (mod arrival;) and are most likely not counted, so the Painter stage and archboard-paint read 26 and 49 names where callers see 29 and 52. Both advisors settled that the fix lands before the Painter stage ticket's gate, because a design with a margin of one name would pass while over budget. Decisions: artifacts/archboard-deepen/20261119T144122Z/decisions.md (candidate 3) and grill-03-r1-*.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A public inherent method counts toward its type's module width whichever file of the crate declares the impl block, private module files included
- [ ] #2 A regression test at the code check's seam covers a public method in an impl block inside a private module file
- [ ] #3 archboard check code reports crates/archboard-paint's widths with enter, dive and end_dive counted, and the run's check-code-final.json counts are refreshed in the task notes for every module whose width changed
- [ ] #4 bun run check passes
<!-- AC:END -->
