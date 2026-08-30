---
id: TASK-143.02.04
title: Govern the private Codex realtime workspace package
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01.13
  - TASK-143.02.01
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - package.json
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the serialized root integration seam for the existing private `packages/codex-realtime` package. Register its workspace and type/lint/format/test/build lanes in package.json and bun.lock without publication machinery or policy changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root scripts include the package in type-check, native Oxlint, Oxfmt, module tests, production consumer build, and canonical check; bun.lock is the only committed dependency-resolution artifact.
- [ ] #2 The package stays private with no publish script or compatibility promise, and a clean checkout can run every package command through Bun from the repository root.
- [ ] #3 This package.json edit follows TASK-143.01.13 and precedes TASK-144.01; TASK-143.02.05 separately owns automated boundary/inventory enforcement.
<!-- AC:END -->
