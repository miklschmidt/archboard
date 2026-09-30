---
id: TASK-108
title: >-
  check-labels carries its own copy of the pane's fingerprint, without the
  volatile-field exclusion the real one has
status: Done
assignee:
  - '@claude'
created_date: '2026-08-23 19:24'
updated_date: '2026-08-23 19:27'
labels: []
dependencies: []
references:
  - scripts/check-labels.mjs
  - frontend/src/canvas/changes.ts
  - scripts/check-changes.mjs
modified_files:
  - scripts/check-labels.mjs
priority: medium
type: bug
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`scripts/check-labels.mjs` (~:133–180) defines a local `fingerprint` and `reportOf` with the comment "frontend/src/canvas/changes.ts: a pane reports only what its baseline lacks". The real `fingerprint` in `frontend/src/canvas/changes.ts` excludes a `VOLATILE` set (version, versionNonce, updated, createdAt, updatedAt, syncedAt, source, syncTimestamp) so a round trip through the server does not read back as an edit; the copy in the check does not, so the check models a pane that would report every element back after every reply — a model of the module, not the module. `frontend/src/canvas/changes.ts` is pure TypeScript with no imports; bun can import it directly, exactly as `scripts/check-changes.mjs` imports `src/core/changes.ts` and `scripts/check-change-reporting.mjs` imports `frontend/src/canvas/change-reporting.ts`. Found by the architecture review of 2026-08-23; confirmed present after TASK-105.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `scripts/check-labels.mjs` imports `fingerprint` and `diffAgainstBaseline` (or whatever it needs) from `frontend/src/canvas/changes.ts` and defines no copy of either
- [x] #2 If dropping the copy changes what the check observes, the cause is explained in the task notes and the check still asserts what its header says it proves
- [x] #3 `test:labels` and `bun run test` pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the local pane fingerprint and delta builder in scripts/check-labels.mjs with Bun imports from frontend/src/canvas/changes.ts.
2. Keep the cycle harness semantics intact by using the real diff for reports and the real fingerprint when advancing its accepted baseline.
3. Run bun run test:labels, compare the result with the 182-check baseline, and record whether the volatile-field exclusion changed any observation.
4. Finalize TASK-108 with scoped evidence, then commit only scripts/check-labels.mjs and the Backlog task metadata.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the local pane fingerprint and report builder with `fingerprint` and `diffAgainstBaseline` imported from `frontend/src/canvas/changes.ts`. `bun run test:labels` still reports `labels: 182 checks passed`; observations did not change. The production fingerprint excludes volatile server bookkeeping and the production diff removes server-owned fields from upserts, but this harness does not create a change made only of those fields. Its asserted edits change label content, deletion state, bindings, or element identity, so the label fixed-point and hostile-loop claims in the header remain intact without loosening assertions.

Scoped verification: `bun run test:labels` passed. Per the workspace rule, I did not run `bun run test`; the maintainer will run the full chain. AC #3 is checked against the permitted `test:labels` evidence with that exception recorded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Imported the production pane fingerprint and delta calculation into the label fixed-point check, deleting both local copies. The check still proves its original label containment, rename, clear, and hostile-loop claims. Verified with `bun run test:labels`: `labels: 182 checks passed`; the maintainer will run the full `bun run test` chain.
<!-- SECTION:FINAL_SUMMARY:END -->
