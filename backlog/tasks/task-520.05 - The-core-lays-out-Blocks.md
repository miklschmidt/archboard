---
id: TASK-520.05
title: The core lays out Blocks boards
status: To Do
assignee: []
created_date: '2026-10-24 12:53'
updated_date: '2026-10-24 14:34'
labels:
  - renderer
dependencies:
  - TASK-520.04
  - TASK-520.02
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout moves to Rust one engine at a time, each against the drawing geometry that the TypeScript stage answers as the oracle. This task ports the Blocks engine (shared/rules/blocks). Text measurement and Graphviz stay capabilities that the host gives the core through imports until TASK-520.07 and a later decision (ADR 0057). The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core answers the drawing of every corpus board that Blocks lays out, and the drawing is equal to what the TypeScript stage answered
- [ ] #2 Every corpus picture is the same bytes as before the change
- [ ] #3 The ported TypeScript rules are gone from packages/renderer
- [ ] #4 No corpus board renders slower, measured with the same harness before and after
<!-- AC:END -->
