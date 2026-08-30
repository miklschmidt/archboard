---
id: TASK-143.01.13
title: Register Codex protocol conformance in root checks
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - package.json
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 240000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the root package-script integration for the completed `src/runtime/codex-protocol` conformance module. Add exact generate, schema-review, and check entrypoints and serialize this package.json edit before other planned dependency/configuration owners.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Named Bun scripts invoke only the public protocol module commands for exact generation and explicit schema-hash review; no npm/npx, shell download, committed derived output, or alternate binary setting is introduced.
- [ ] #2 bun run check executes drift conformance without rewriting files, while the explicit review command is the only path that accepts a changed hash.
- [ ] #3 Focused script tests cover correct binary, wrong/missing version, generated drift, and actionable review output; TASK-143.02.04 is the next package.json owner.
<!-- AC:END -->
