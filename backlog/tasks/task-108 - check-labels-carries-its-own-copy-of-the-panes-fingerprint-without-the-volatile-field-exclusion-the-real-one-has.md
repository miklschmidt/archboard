---
id: TASK-108
title: >-
  check-labels carries its own copy of the pane's fingerprint, without the
  volatile-field exclusion the real one has
status: To Do
assignee: []
created_date: '2026-08-23 19:24'
labels: []
dependencies: []
references:
  - scripts/check-labels.mjs
  - frontend/src/canvas/changes.ts
  - scripts/check-changes.mjs
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
- [ ] #1 `scripts/check-labels.mjs` imports `fingerprint` and `diffAgainstBaseline` (or whatever it needs) from `frontend/src/canvas/changes.ts` and defines no copy of either
- [ ] #2 If dropping the copy changes what the check observes, the cause is explained in the task notes and the check still asserts what its header says it proves
- [ ] #3 `test:labels` and `bun run test` pass
<!-- AC:END -->
