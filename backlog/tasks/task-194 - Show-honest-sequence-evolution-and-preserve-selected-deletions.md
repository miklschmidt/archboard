---
id: TASK-194
title: Show honest sequence evolution and preserve selected deletions
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 01:10'
updated_date: '2026-09-13 01:23'
labels: []
dependencies: []
ordinal: 353000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Renderer layout proposal replaced the render flow and every step ID while reusing module IDs for replacements. Named-view comparison also drops entire deleted flows selected by the shared scope, hiding deleted participants. User asks to repair the diagram and teach agents to avoid these mistakes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Named-view comparisons include selected deleted flows and required participants without leaking unrelated deletions.
- [x] #2 Renderer layout uses stable identities for genuine continuations and distinct identities for replacement modules, with added/changed/removed calls visible.
- [x] #3 The archboard skill gives concrete identity and before/after verification rules, and installed skill copies are synced.
- [x] #4 Focused regression, live diagram verification and complete bun run check pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce selected-flow deletion loss and fix projection against both scoped variants. 2. Repair the authored proposal using an explicit identity mapping. 3. Teach identity decisions and require checking semantic differences and visible deletions. 4. Restart final source, verify actual drawing and run full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced missing selected old flow on live API (EnnH7t3r absent); after projection fix/restart it is marked removed with its Route planning participant. Repaired Renderer layout version 9 to 10 using canonical validation and atomic write with stopped server, original-byte guard and /tmp backup. Initial variant unchanged. Draft now preserves main flow and four continuing step IDs; Card measurement and Compound layout use fresh IDs with stale source bindings removed. Main comparison: 2 added / 2 changed / 3 removed nodes, 4 added / 4 changed / 10 removed steps. Browser QA exposed old numeric-position restoration scattering deleted calls after inserts; fixing anchoring before final validation. First full gate caught two type integration misses, being corrected.

Final live QA: Initial retains its 14-step sequence and same shared view; Readable layout shows one 18-step comparison with replacement cards green, continuing cards amber, and old Card text / Grid placement / Route planning plus obsolete calls visibly removed. Deleted runs now anchor before the next surviving baseline step, preserving proposal order; old atlas action stays at the end. Simplification: one canonical restore-then-scope path replaces roughly 200 lines of narrow-selection restoration heuristics. Skill updated and synced with continuation/replacement/untouched mapping, same-flow and step identity rules, shared-view visual verification and visible-deletion checks. Focused regressions 50 tests / 124 assertions pass. Full gate rerun pending.

Complete bun run check passed with exit 0: lint, formatting, types, frontend build, module/system/repository suites and serial browser tests. Log: /tmp/archboard-sequence-identity-check-verified.log. Final dogfood backend PID2431636 remained running throughout validation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed selected-deletion projection and anchored removed sequence steps to surviving baseline actions. Repaired Renderer layout proposal identities while leaving Initial unchanged; render sequence now shows 4 added, 4 changed and 10 removed steps. Updated and synced archboard skill with explicit continuation/replacement identity decisions and same-view semantic/visual verification. Verified focused regression tests, live browser before/after comparison and complete bun run check (exit 0).
<!-- SECTION:FINAL_SUMMARY:END -->
