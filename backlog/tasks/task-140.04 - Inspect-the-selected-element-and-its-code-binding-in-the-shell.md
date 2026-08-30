---
id: TASK-140.04
title: Inspect the selected element and its code binding in the shell
status: To Do
assignee: []
created_date: '2026-08-30 02:30'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: high
type: feature
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the reference right-side inspector for the focused pane selection. A person should be able to confirm what an element represents, whether it is bound to code, and the portable code address before opening it. The inspector reads existing scene and binding data and reuses the current code-target activation contract; it does not add health metrics or persist machine-local paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With exactly one selected element, the inspector shows its stable identity and available Archboard node, kind, name, variant, and level metadata without exposing unknown custom data
- [ ] #2 For a code-bound element, the inspector shows repository identity, repository-relative path, and present branch, commit, and confirmed-at values from customData.archboard.binding
- [ ] #3 The inspector opens bound code through the existing board-and-element code target, and existing settings and GitHub recovery actions remain accurate when local activation is unavailable
- [ ] #4 No selection, multiple selection, an unbound element, a malformed binding, and a selection that disappears each produce a clear reachable state without stale details
- [ ] #5 Selection inspection and derived activation targets remain presentation-only, write no note data, and never persist a machine-local checkout path
- [ ] #6 Focused unit and rendered browser coverage proves bound, unbound, malformed, empty, multiple, open-success, and open-recovery behavior in both themes
<!-- AC:END -->
