---
id: TASK-143.03.12
title: Pin the assistant-ui runtime dependency
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - package.json
  - bun.lock
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the final serialized root package/lockfile edit for @assistant-ui/react 0.15.17 and audit its transitive graph. The runtime is headless support, not Archboard state or transport.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock pin @assistant-ui/react exactly 0.15.17 after the Codex and Tailwind/Base UI root edits; frozen install and license audit pass.
- [ ] #2 The audit records expected assistant-cloud and Radix helper transitives pulled by the package; the app contains no direct Radix import and no unreviewed runtime service, telemetry, cloud transport, or duplicate React.
- [ ] #3 Repository policy permits only explicitly assigned assistant-ui runtime/provider/message/composer imports and forbids transport, thread-list, queue, tool handlers, voice adapters, and copied Elements.
- [ ] #4 Bundle inspection uses an explicit reviewed allowlist and fails on unexpected transitive growth or any app/direct Radix dependency rather than asserting Radix is absent.
<!-- AC:END -->
