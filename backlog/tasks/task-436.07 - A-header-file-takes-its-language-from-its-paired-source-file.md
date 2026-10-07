---
id: TASK-436.07
title: A header file takes its language from its paired source file
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 701000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check chooses the grammar of a `.h` file from the text of the header alone, because the facts of a file are cached by its own content. Two rare cases read incorrectly (TASK-367.10): an Objective-C header with only C functions, and a C++ header with `#ifdef __OBJC__ @class X;`. The owner decided that the paired source file decides.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A header with a source file of the same name in the same directory takes the language of that file. A header without one reads by its own text, as now
- [ ] #2 A change to the header or to its paired file refreshes the cached facts of the header
- [ ] #3 Both cases of TASK-367.10 read correctly, each with a test
<!-- AC:END -->
