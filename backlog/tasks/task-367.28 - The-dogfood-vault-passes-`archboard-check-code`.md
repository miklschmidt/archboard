---
id: TASK-367.28
title: The dogfood vault passes `archboard check --code`
status: To Do
assignee: []
created_date: '2026-10-06 20:48'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-367
priority: medium
ordinal: 691000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-367 #5 asks that the dogfood vault pass the code check. After TASK-367.27 corrected the boards, `./bin/dogfood check --code` still exits 1 with 31 warnings, so a task can never close on a clean check and a new warning drowns among the old ones. ADR 0046 says right work must be able to clear every warning, so each remaining warning is either a board that does not draw what the code does, or a check that calls something a dependency that is not one. About a third are uses of a constant, an error class in a catch or instanceof, or a type guard, which the check counts as call evidence. The rest are real calls that the Archboard server, Board viewer, Board rasterizer, Codex session, Voice coordinator, Agent workbench and Codex workhorse boards do not draw. The 367.27 group notes on TASK-367.27 explain each one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the 31 warnings is cleared by a board that draws what the code does, or by a check rule that ADR 0046 records, and the task notes say which for each
- [ ] #2 A use that is no call or construction (a constant read, an error class caught or tested, a type-only use) is not call evidence, if the check changes, and a call or construction still is
- [ ] #3 `./bin/dogfood check --code` exits 0 on the current variants, and every board still lays out under 1 second
<!-- AC:END -->
