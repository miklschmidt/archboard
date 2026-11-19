---
id: TASK-653.04
title: Width counts a Rust type's public methods wherever they are declared
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T16:39:00Z'
updated_date: '2026-11-19T17:01:00Z'
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
- [x] #1 A public inherent method counts toward its type's module width whichever file of the crate declares the impl block, private module files included
- [x] #2 A regression test at the code check's seam covers a public method in an impl block inside a private module file
- [x] #3 archboard check code reports crates/archboard-paint's widths with enter, dive and end_dive counted, and the run's check-code-final.json counts are refreshed in the task notes for every module whose width changed
- [ ] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the defect with archboard check code: Painter stage 26, archboard-paint 49.
2. Test first in rust-depth.test.ts: a type whose public methods are in a private module file of its module and in another module of the crate counts them; a pub(super) method does not.
3. Give the exposure rules an optional members hook; Rust's rule (moved to rust-exposure.ts) adds, for each exposed type that holds data, the pub and pub(crate) members of its own impl blocks in crate files the root files do not pass on, resolving the block's type through definition-site.ts.
4. Rerun the code check across the repository and record every module whose width changed.
5. bun run check, commit, finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Defect confirmed before the fix: archboard check code read Painter stage (crates/archboard-paint/src/stage) at 26 and archboard-paint (crates/archboard-paint) at 49; Stage's enter, dive and end_dive in the private module file stage/arrival.rs were not counted.

Fix: the exposure rules gained an optional members hook. Rust's rule (now in rust-exposure.ts) gives each exposed type that holds data the pub and pub(crate) members of its own impl blocks in crate files its root files do not pass on, resolving the block's type through the file's definitions and imports (definition-site.ts). pub(super) members, such as arrival.rs's axis_of, stay with their module. Test files and inline modules add nothing.

Width changes, archboard check code across the repository (check-code-final.json counts refreshed; functions + classes + methods + values):
- Painter stage (crates/archboard-paint/src/stage): 26 -> 29 (methods 24 -> 27)
- archboard-paint (crates/archboard-paint): 49 -> 52 (methods 42 -> 45)
No other module's width or finding changed (290 findings before and after; only the two INTERFACE_WIDE messages differ). The repository-policy interface-width ceilings measure TypeScript packages only, so none is affected.

bun run check: every stage passes but check:model, which fails on the repository's existing INTERFACE_WIDE and MODULE_SHALLOW warnings (Scene, Painter stage, timing, model and 14 more). The same warnings made archboard check code exit 1 at the base 15292a9354 before this change, so the failure predates it; this ticket changes only the Painter stage and archboard-paint counts in those messages. The ordered run stopped before the test lanes, so they ran by hand: test:modules 5325 pass, test:system 227 pass, test:solo 15 pass, test:serial-browser 50 of 50 files pass (a first run timed out once in canonical-model-reconciliation.test.ts, a proposal-conflict test unrelated to the code check, and passed on rerun). AC #4 stays unchecked until the module-depth debt that TASK-653 pays down clears check:model.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A Rust type's public methods now count toward its module's width wherever its crate declares the impl block. The exposure rules gained an optional members hook; Rust's rule, moved to rust-exposure.ts, gives each exposed type that holds data the pub and pub(crate) members of its own impl blocks in crate files the root files do not pass on, resolving the block's type through the file's definitions and imports. Painter stage reads 29 (was 26) and archboard-paint 52 (was 49); no other module changed. Regression test in rust-depth.test.ts covers a method in a private module file, one in another module, and a pub(super) one that does not count. bun run check fails only on check:model's pre-existing module-depth warnings, so AC #4 is open.
<!-- SECTION:FINAL_SUMMARY:END -->
