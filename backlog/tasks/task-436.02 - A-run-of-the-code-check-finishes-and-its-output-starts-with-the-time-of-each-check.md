---
id: TASK-436.02
title: >-
  A run of the code check finishes, and its output starts with the time of each
  check
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 696000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A run of the code check stops waiting for a language server after 30 s, says `language-server-failed` and keeps its candidates. On LLVM the index of clangd took 54 s, so the run never got its answers. The owner decided that the analysis must finish, because its result is important information. The owner also decided that the output of `archboard check` starts with the time that each check took.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No time limit stops a run of the code check or a language server. A run stops early only when its caller cancels it or a server exits
- [ ] #2 The text output of `archboard check` and of `archboard check --code` starts with the time that each check took, for example the board check, the code facts, each language server and the history lens. The JSON answer gives the same times
- [ ] #3 INSTALL.md, the archboard skill and ADR 0046 describe no time limit
- [ ] #4 TASK-429 is archived, because a first run no longer stops after 30 s
<!-- AC:END -->
