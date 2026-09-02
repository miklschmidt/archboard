---
id: TASK-148.10
title: Reuse Codex workhorse operation fixtures
status: To Do
assignee: []
created_date: '2026-09-02 23:00'
labels: []
dependencies: []
references:
  - codex-workhorse-operations tests/support.ts
  - the three affected test files
parent_task_id: TASK-148
ordinal: 282000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three workhorse test files create roughly 29 fsync-backed fixtures although the loop usually varies only queue.nextOutcome. Reuse immutable committed proof and reset only the mutable queue/outcome state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All operation and outcome contracts remain covered, including state isolation between cases.
- [ ] #2 Durable fixture setup occurs once per compatible group rather than once per outcome iteration, with explicit reset/clone semantics preventing cross-case leakage.
- [ ] #3 The focused three-file owner improves materially from the recorded 19.3 seconds and cleans all temporary state.
<!-- AC:END -->
