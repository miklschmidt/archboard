---
id: TASK-208.01
title: 'Say in semantic new''s help that flows, views and walkthroughs are accepted'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-14 01:51'
updated_date: '2026-09-14 02:44'
labels: []
dependencies: []
parent_task_id: TASK-208
type: bug
ordinal: 371000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `archboard semantic new --help` description says the stated architecture is JSON with required board `level` metadata plus `nodes` and `edges`, but the ingress schema (BoardCreateInputSchema in src/shared/semantic-board/lib/input.ts) also accepts `variant`, `summary`, `flows`, `views` and `walkthroughs`, and the generated semantic-create-input.schema.json says so. An agent reading only the help splits one creation into a `new` and an `edit`, costing a write and a version. Found while writing the TASK-211 recipes, which document the full payload; the help should agree with the contract it is generated from.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `semantic new` description names every top-level payload key the ingress schema accepts, checked against the contract rather than restated by hand.
- [x] #2 The existing help owner (src/cli/command-routing/tests/help.test.ts) still passes without text matching; any structural check reads the contract, not the prose.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Derive the semantic-create payload key list from BoardCreateInputSchema and reuse it in semantic new help metadata.
2. Extend the existing registry-driven help owner without prose matching.
3. Fix review-discovered help routing regressions in the production bootstrap path and route-aware topic selection.
4. Remove the forbidden whole-help equality and hardcoded shared-option inventory from the help owner.
5. Run focused CLI contract/routing tests and bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema-derived semantic-new payload metadata; fixed production help bootstrap, route-aware topic selection, bare-default namespace options, installer choice metadata, and conditional shared-option exclusions found during review. Replaced forbidden whole-help equality and hardcoded shared inventory with registry/contract-derived structural checks. Focused CLI/help/install owners: 24 pass, 0 fail.

Final focused validation after simplification: help/parameter owners 15 pass, install-target owner 9 pass, type-aware lint policy passes, and git diff --check passes. Full repository gate delegated to the parent integration owner.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Semantic-new help now derives and names every accepted payload field from BoardCreateInputSchema. The registry-driven help owner remains prose-independent and passes alongside focused parser, installer, and type-aware lint checks.
<!-- SECTION:FINAL_SUMMARY:END -->
