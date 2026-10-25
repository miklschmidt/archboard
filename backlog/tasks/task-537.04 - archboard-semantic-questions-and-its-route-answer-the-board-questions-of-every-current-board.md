---
id: TASK-537.04
title: >-
  archboard semantic questions and its route answer the board questions of every
  current board
status: To Do
assignee: []
created_date: '2026-10-25T17:04:00Z'
labels:
  - design-questions
  - cli
dependencies:
  - TASK-537.01
parent_task_id: TASK-537
type: feature
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI is the default surface (ADR 0008). An agent that runs the survey step of improve-codebase-architecture must get the same questions as the pane, from one derivation, over every current board of the vault.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard semantic questions answers the three board questions over every current board of the vault, with the boards, containers and parts behind each count
- [ ] #2 A repeatable --board option narrows the boards
- [ ] #3 The answer names the boards it read and the boards it skipped, with the reason
- [ ] #4 A route answers the same reading, requires a vault, and the CLI and the pane parse one schema derived by one function
- [ ] #5 The consumer skill teaches the command, and the evaluation inputs cover it
<!-- AC:END -->
