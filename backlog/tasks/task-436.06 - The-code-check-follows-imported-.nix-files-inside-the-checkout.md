---
id: TASK-436.06
title: The code check follows imported .nix files inside the checkout
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 700000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check reads only `flake.nix` and `flake.lock`, so it cannot follow `callPackage ./pkg.nix` into another file. Most real flakes build that way, so most of their relationships are skipped. The owner decided to follow such files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code check follows a `callPackage` or an `import` of a `.nix` file inside the checkout, within the limit of 200,000 evaluation operations
- [ ] #2 A file outside the checkout, or an evaluation past the limit, still gives the skip with the file and the lines
- [ ] #3 The notes say, for the 16 flakes of TASK-367.22, how many relationships go from skipped to supported
<!-- AC:END -->
