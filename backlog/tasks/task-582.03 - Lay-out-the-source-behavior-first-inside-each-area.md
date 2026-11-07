---
id: TASK-582.03
title: Lay out the source behavior first inside each area
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06T15:14:00Z'
updated_date: '2026-11-07T00:12:00Z'
labels:
  - architecture
dependencies: []
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582
priority: medium
ordinal: 1026000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/agents/boundaries.md puts role folders first (`ui/clients/pane-session`, `ui/rules/pane-session`, `ui/hooks/pane-session`), so no directory holds one behavior, and its container cannot own its code. The owner decided that behavior first inside each area (`shared`, `runtime`, `server`, `ui`) is the right structure. Areas stay, because they separate where code runs and lint rules depend on them. Lint rules that read a role folder today must move to a form that survives inside a behavior folder. Planned as its own initiative, not done in the PR that adds the warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/agents/boundaries.md and tests/system/repository-policy/workspace-layout.test.ts state the behavior-first layout before any code moves
- [x] #2 Every lint or policy rule that reads a role folder keeps its guarantee in the new layout
- [x] #3 Each container that the containment warning names is repaired: a model error by a model change, a layout split by moving the code
- [x] #4 archboard check on this repository reports no containment warning
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
The plan of record is backlog/docs/doc-003 (Behavior-first layout plan), with the owner decisions at its top. Four stacked layers, each its own subtask: A rules and codemod, B packages, C cli, server and web, D the remaining packages and the end of the ratchet. Every commit leaves bun run check green; the containment warnings fall 83 -> 0 by the end of C.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All four layers are Done. The rule and its tests landed in layer A before any code moved (36a5c65e2, 487e39105); each role-folder lint rule kept its guarantee with tests in both forms, then in the new form only; every container the warning named is repaired by a model change or a move; archboard check reports no warning at all.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The repository lays out behavior first inside each area (ADR 0075). archboard check went from 83 containment warnings to none, in four stacked layers whose every commit passes the full gate. The move codemod (scripts/move-source.ts) moved the files and kept the vault bindings and anchors with them.
<!-- SECTION:FINAL_SUMMARY:END -->
