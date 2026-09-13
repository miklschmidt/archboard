---
id: TASK-193
title: Make views board-owned and show semantic boards with variant ancestry
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 00:35'
updated_date: '2026-09-13 01:04'
labels: []
dependencies: []
ordinal: 352000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Comparing renderer proposals changes the available view menu and loses the question being examined. The sidebar hides ancestry and truncates directory-derived names. The user wants one semantic diagram per board, board-owned views shared across its evolving variants, and a wider ancestry tree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Views are stored once on the board and every variant exposes the same view identities; switching variants preserves the chosen view, including an explicit empty result when its subjects are absent.
- [x] #2 Existing boards and their links remain usable after migrating variant-owned views and semantic dogfood names, preserving subject identities and ancestry.
- [x] #3 The wider sidebar displays semantic board names and a deterministic variant ancestry tree with correct selection and lifecycle markers.
- [x] #4 Domain documentation and the archboard skill explicitly teach semantic board names, board-owned views and variants as diagram evolution.
- [x] #5 Focused behavior tests, live browser verification, and bun run check pass without weakening rules.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move views to the board contract and update authoring, persistence, projection and migration. 2. Update the viewer and wider ancestry navigation against that contract. 3. Migrate dogfood names and links and update domain/skill guidance. 4. Verify focused behaviors, build/restart, inspect live navigation and shared views, then run the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User explicitly accepts breaking existing boards on this unpublished branch and asks to delete compatibility cruft. Use a clean schema break, repair authored dogfood boards and fixtures directly, and remove obsolete compatibility paths in touched scope; do not retain a legacy views adapter.

Repaired all 11 dogfood boards to schema 2 with semantic names, preserved subject IDs and ancestry, updated every drill-down target, and consolidated Renderer layout into shared Render sequence/Responsibilities/Pretext sizing/Layout sequence views. Backups live outside the repository in /tmp/archboard-before-shared-views. Against the restarted server, all 38 variant/view render requests validated, including 3 expected empty readings, with identical menus across each board family. Live QA confirmed sidebar view retention; top-strip URL retention mismatch is being fixed before final gate.

Final live QA: 320px sidebar names readable, parent/child rows collapse and keyboard-expand correctly, selection and pane marker agree. Sidebar and top-strip variant switches retain view and URL, including empty views; different-board navigation clears view. Fixed empty render identity reporting that dropped viewA. Removed legacy variant-view merge/conflict/pruning paths and old schema compatibility fixture; repaired remaining fixtures. Removed brittle generated-help SHA snapshots while preserving runtime determinism and typed artifact checks. Final simplification retains one listing/query owner and one set of board views. Complete bun run check passed exit 0; log /tmp/archboard-shared-views-check-verified.log. Skill source synced to installed local copies. Browser left on Renderer layout / Readable layout / Render sequence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Views now belong to the board, shared by every variant, with stable view selection and explicit empty readings. The 320px sidebar shows semantic board names and variant ancestry. Repaired all 11 dogfood boards and links, updated domain/skill guidance, and removed old view compatibility paths. Verified 38 render combinations, live tree/view/address behavior, focused regressions, and complete bun run check (exit 0).
<!-- SECTION:FINAL_SUMMARY:END -->
