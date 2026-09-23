---
id: TASK-317
title: Spoken approval either works end to end or is removed
status: To Do
assignee: []
created_date: '2026-09-23 21:35'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/runtime/codex-spoken-approval/lib/gate.ts
  - src/ui/workbench-approvals/lib/vocabulary.ts
priority: medium
type: bug
ordinal: 549000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The spoken approval gate (src/runtime/codex-spoken-approval) is built and composed into the canvas, and the coordinator is offered `resolve_spoken_approval`, but nothing in production ever calls the gate's `arm`; only test fixtures do. So the tool can only refuse with "There is no pending spoken approval to resolve." In the 2026-09-23 23:15 session the user said "just decline it" about the workhorse's pending command approval and the coordinator got that refusal. With auto-review (TASK-314), approvals rarely reach the user, which argues for removing the feature rather than wiring it: a tool that can only refuse misleads the coordinator and the user.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either a pending approval the voice model read out can be accepted or declined aloud and settles on the workbench, proven by one owner, or the gate, the tool, its manifest entry and the approval rules in both prompts are gone
- [ ] #2 The workbench no longer tells the user an approval may be answered by voice unless that works
<!-- AC:END -->
