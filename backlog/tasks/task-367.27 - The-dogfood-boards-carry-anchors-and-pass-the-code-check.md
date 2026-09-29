---
id: TASK-367.27
title: The dogfood boards carry anchors and pass the code check
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
  - architecture
dependencies:
  - TASK-367.07
  - TASK-367.26
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: docs
ordinal: 635000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dogfood vault is how the next agent learns this repository. Its relationships have no anchors yet, and the check needs anchors to say more than which files changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every relationship between bound parts on the current dogfood boards carries an anchor
- [ ] #2 `./bin/dogfood check --code` reports no finding, or each remaining one is fixed on the board or explained in the task notes
- [ ] #3 `.archboard/README.md` tells a maintainer to run the code check
<!-- AC:END -->
