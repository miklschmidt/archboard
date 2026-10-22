---
id: TASK-501
title: A board node can bind a behavior that spans role folders
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-19 23:11'
updated_date: '2026-10-22 03:12'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement the approved ADR 0056: retain one primary code-opening path and add optional literal additionalPaths, excluding symbol bindings. Share path enumeration across readers and keep checkout safety.
2. Extend plain binding diagnostics, code-check ownership and all Git history readers to the same complete scope. Preserve narrowest ownership and primary module interface semantics. Add focused contract regressions.
3. Update CONTEXT.md and consumer skill guidance and generated schema artifacts.
4. Archboard@TASK-501 records the model change. Correct affected dogfood bindings through TASK-501 proposals as source inspection identifies the role folders, without widening to unrelated code. Compare findings with the 82-mismatch baseline and retain genuine warnings.
5. Run focused checks while implementing, then one complete bun run check. Inspect proposal checks and footprints, adopt the built proposals, and close with evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Baseline at 85daa00fb: archboard check --code completed in 15.055 seconds with 82 ANCHOR_MISMATCH findings, including 40 on Browser application. Outputs: /tmp/archboard-task501-baseline.json and /tmp/archboard-task501-baseline.stderr. The binding also controls code opening, ownership, module exposure, and Git history. A proposed decision in docs/adr/0056-a-binding-keeps-one-open-target-and-can-own-additional-paths.md keeps the primary target and adds explicit additional ownership paths. This is a proposed public model change, pending the plan approval required by the task-execution guide. No implementation or board changes yet.

User approved explicit additionalPaths on 2026-10-22. Archboard@TASK-501 describes complete ownership paths and retains the single code-opening action. Its compare changes code-binding and code-intel responsibilities only.
<!-- SECTION:NOTES:END -->
