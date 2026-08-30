---
id: TASK-143.03.02
title: Map Codex state into assistant-ui ExternalStoreRuntime
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.01
  - TASK-143.03.12
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-runtime
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the `@assistant-ui/react` 0.15.17 adapter in `src/ui/workbench-runtime`. It maps the closed Archboard model into one ExternalStoreRuntime; app-server state remains authoritative and no assistant-ui transport or copied Element owns data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only ExternalStoreRuntime and required primitives map thread, message, content part, tool, composer, cancellation, and stopped-run state; dependency ownership comes from TASK-143.03.12.
- [ ] #2 Empty/loading, streaming deltas, reasoning, tool progress, approval wait, interruption, recoverable failure, reconnect, invalidation, and completion map without a second store or optimistic terminal state.
- [ ] #3 Tests at src/ui/workbench-runtime/tests exhaust the mapping and production graph excludes AssistantTransport, assistant-cloud, AI SDK transports, assistant-ui voice/diff/syntax packages, copied Elements state, and generated app-server imports.
<!-- AC:END -->
