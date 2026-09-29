---
id: TASK-367.07
title: >-
  The code check reports undrawn dependencies and backwards relationships
  between bound parts
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.06
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: feature
ordinal: 615000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This is the finding that makes the check worth running: code that one part runs in another part, which the board does not draw. On 2026-09-29, Board persistence showed 3 runtime calls that the board does not draw, 7 parts that import one shared helper, and 5 type-only imports (docs/design/design-checks.md). A call through a value that a part receives shows only a type import, so the anchor, not the import, proves it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A runtime dependency from one bound part to another with no relationship between them is reported as not on the board
- [ ] #2 Dependencies on one shared part are reported once for that part, and type-only imports are not reported
- [ ] #3 A relationship drawn one way while the code runs only the other way is reported as drawn backwards
- [ ] #4 Each finding names its evidence kind and says that it is a candidate until a language server resolves it
- [ ] #5 On Board persistence the check reproduces the measurement in the design note or explains each difference by a code change since
<!-- AC:END -->
