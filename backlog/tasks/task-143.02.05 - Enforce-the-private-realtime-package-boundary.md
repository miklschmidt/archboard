---
id: TASK-143.02.05
title: Enforce the private realtime package boundary
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
labels: []
dependencies:
  - TASK-143.02.04
references:
  - docs/agents/boundaries.md
modified_files:
  - tests/system/repository-policy/codex-realtime-package.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 242000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the repository-policy test for `packages/codex-realtime`. Verify the workspace is reachable through every root check and that its browser-only deep-module boundary cannot silently erode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The test rejects an unregistered package, missing type/lint/format/module/build lane, absent package test inventory, publish script, or committed generated/build output.
- [ ] #2 It rejects imports from Archboard, React, assistant-ui, Tailwind, generated protocol, credentials, Node, or server modules in public/package source and imports bypassing the package export map from Archboard.
- [ ] #3 The test fails on the pre-governance layout, passes through bun run test:repository and bun run check, and emits exact remediation without weakening any existing inventory.
<!-- AC:END -->
