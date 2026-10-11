---
id: TASK-275
title: Classify the script of a nested shell the way the outer one is
status: In Progress
assignee:
  - '@implementer'
created_date: '2026-09-19 01:07'
updated_date: '2026-10-11 13:58'
labels: []
dependencies: []
priority: medium
ordinal: 489000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found reviewing TASK-274.01. The exposure classifier unwraps one level of bash|sh|zsh -c. A nested script word, e.g. bash -lc "bash -c 'cd <B>/world; cat ../../../../runs/...'" or bash -lc "bash -c 'cat<../../../../../runs/...'", is one word that does not start with '.', so the relative climb inside it is never resolved and the read of another run is not counted. It needs no failed cd and no deleted file, so it is easier to hit than TASK-273.01's residual gap. It was clean before 274.01 too; no stored command in the ten saved batches is nested.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A nested bash|sh|zsh -c script word is classified again as a script in its own right, recursively, for exposure and every other rule
- [ ] #2 Both probes above count as other-run, and every existing classification of the saved batches is unchanged
- [x] #3 Behavioural tests own it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make unwrapped recurse through nested shell -c calls. 2. Tests in reaudit.test.ts (both probes) and events.test.ts (unwrap, write).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
unwrapped now recurses via innerScript; nested script feeds every rule (exposure, write, class). Tests fail without the change (reaudit: nested other-run; events: nested unwrap and write). AC2 probes proven; saved-batch invariance NOT verified: checking needs walking .skill-evals, which is forbidden; the task text says no stored command in the ten batches is nested.
<!-- SECTION:NOTES:END -->
