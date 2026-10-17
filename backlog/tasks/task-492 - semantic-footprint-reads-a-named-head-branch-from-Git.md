---
id: TASK-492
title: semantic footprint reads a named head branch from Git
status: In Progress
assignee:
  - '@implementer'
created_date: '2026-10-17 10:53'
updated_date: '2026-10-17 11:00'
labels:
  - history-lens
  - cli
dependencies: []
type: bug
ordinal: 857000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
semantic footprint compares a proposal with the commits from --base up to the checkout's HEAD. In a pull-request stack every layer is its own branch, and only one of them is checked out (on Device Trust Control Plane: feat/device-trust). For every other layer an agent writing the pull-request body cannot use footprint and reads the diff by hand instead, so the check of 'every changed part is drawn' is skipped exactly where a stack needs it. Reported 2026-10-17 by the agent fixing the device-trust pull-request bodies. The archboard-pr skill (section 2 step 6) tells agents to run footprint for each pull request.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 semantic footprint --head <ref> reads the commits from --base to that ref from Git, without checking it out and without changing the working tree
- [ ] #2 Without --head, footprint reads up to the checkout's HEAD as now
- [ ] #3 A --head the checkout cannot resolve is refused with a code that names the ref, and nothing is reported as unchanged
- [ ] #4 A test shows footprint --head on a branch that is not checked out reports the parts that branch changed
- [ ] #5 The archboard-pr skill's footprint step names --head for a stack layer that is not checked out
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. source-history.ts: export commitOf (additive; sourceAt untouched) so --head resolves exactly as sourceAt does (rev-parse, then refs/remotes/origin/<name>).
2. history-lens footprint.ts: FootprintRequest.head; rangeOf resolves head per checkout with commitOf instead of HEAD; a checkout that cannot resolve it is unread with new reason head-unresolved (as base-unresolved is); the answer echoes head. walkCommits/attribution already take the resolved commit.
3. shared/footprint: add head-unresolved to UNREAD_REASONS, optional head echo.
4. server footprint-route: carry ?head=; when head was asked and every checkout is unread for head-unresolved, refuse 422 HEAD_UNRESOLVED naming the ref (nothing reported as unchanged).
5. CLI semantic-footprint: --head option, query param, HEAD_UNRESOLVED refusal (exit 2), diagnostics.
6. Tests: lens (non-checked-out branch reports its changes; origin-only branch; unresolved), route (HEAD_UNRESOLVED code, head carried), CLI (query carries head).
7. archboard-pr SKILL step 6 and footprint references; bun run generate:skill-artifacts; gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: --head <ref> is resolved per checkout by the history lens's own commitOf (rev-parse, then refs/remotes/origin/<name>), exported additively from source-history.ts; sourceAt is unchanged. The range runs from the merge base of --base and the resolved head up to that head; no checkout, no working-tree change. Without --head the lens reads HEAD as before. A checkout where --head does not resolve is unread with the new reason head-unresolved (like base-unresolved, its parts are skipped, never unchanged); when it resolves in no checkout that holds a part, the route refuses 422 HEAD_UNRESOLVED naming the ref and the CLI exits 2. Decision: not a refusal when only some checkouts lack the head, because a stack branch often exists only in the code repository, not the vault's. Answer echoes head. Tests: lens (--head on a non-checked-out branch, origin-only branch, unresolved, option-looking ref), route (production app, HEAD_UNRESOLVED), CLI (query carries head, exit 2). Skill archboard-pr step 1.3 and 6, ephemeral.md, ADR 0045 and the CLI audit updated. Real run against /home/msc/Work/Platform (throwaway registry, not the user's): footprint of Platform Public API --head cleanup/device-trust-enrollment-only-server reads 651 commits, --head feat/device-trust 671, --head no-such-layer exits 2.
<!-- SECTION:NOTES:END -->
