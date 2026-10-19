---
id: TASK-501
title: A board node can bind a behavior that spans role folders
status: To Do
assignee: []
created_date: '2026-10-19 23:11'
labels: []
dependencies: []
ordinal: 908000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages and apps put each behavior under several role folders (components, hooks, rules, state, clients), but a node binding names one path. After TASK-500.06 rebound the vault, the code check reports 79 new ANCHOR_MISMATCH warnings, 40 of them on Browser application, because an anchor in another role folder of the same behavior reads as outside both ends. Binding a node to a broad ancestor would quiet them and lose precision. The choice is between letting a binding carry several paths or a glob, and splitting nodes into containers per role.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code check reports no ANCHOR_MISMATCH that comes only from a behavior spread across role folders
- [ ] #2 The binding model change or the board restructure is recorded in an ADR or the domain language, and a test covers the spread case
<!-- AC:END -->
