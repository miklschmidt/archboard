---
id: TASK-367.22
title: 'Nix derivations: build dependencies between packages'
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
dependencies:
  - TASK-367.21
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 630000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inside a flake, a derivation names the packages it is built from. When those packages are other outputs of the same flake or overlay, the dependency between two parts is explicit only here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `buildInputs`, `nativeBuildInputs` and `propagatedBuildInputs` that name another package of the same flake or overlay are build dependencies
- [ ] #2 Build dependencies between bound parts that the board does not draw are reported as in the undrawn check
- [ ] #3 Expressions the static parse cannot follow are reported as unknown, never as missing
<!-- AC:END -->
