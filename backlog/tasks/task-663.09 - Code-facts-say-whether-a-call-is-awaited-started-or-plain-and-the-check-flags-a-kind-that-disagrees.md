---
id: TASK-663.09
title: >-
  Code facts say whether a call is awaited, started or plain, and the check
  flags a kind that disagrees
status: To Do
assignee: []
created_date: '2026-11-22T14:12:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sync and async must be decided from code, not guessed, in every language the code check reads (spec section 6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each adapter (TypeScript, Rust, Python, Go, C#, Swift, Objective-C, C) reports awaited, started and plain call sites where its language decides them, and reports undecidable otherwise
- [ ] #2 The code check reports a sync relationship whose anchored call is awaited or started, and an async one whose call is neither, as information
- [ ] #3 Tests cover each adapter's await and task-start cases
<!-- AC:END -->
