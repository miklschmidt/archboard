---
id: TASK-367.10
title: Code facts for Objective-C
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.09
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 618000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective-C shares the include model of C, and adds classes, protocols and message sends. A class extension in an `.m` file is how Objective-C hides part of an interface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `#import`, `@import` and `#include` resolve as in C
- [ ] #2 `@interface`, `@implementation` and `@protocol` are definitions, and message sends are references by selector
- [ ] #3 Declarations in a class extension inside an `.m` file are internal, and declarations in a public header are exported
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to Objective-C files, including files that mix C
<!-- AC:END -->
