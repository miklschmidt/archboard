---
id: TASK-275
title: Classify the script of a nested shell the way the outer one is
status: To Do
assignee: []
created_date: '2026-09-19 01:07'
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
- [ ] #1 A nested bash|sh|zsh -c script word is classified again as a script in its own right, recursively, for exposure and every other rule
- [ ] #2 Both probes above count as other-run, and every existing classification of the saved batches is unchanged
- [ ] #3 Behavioural tests own it
<!-- AC:END -->
