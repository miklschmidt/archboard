---
id: TASK-143.03.02
title: Map Codex state into assistant-ui ExternalStoreRuntime
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.03.01
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
Own the `@assistant-ui/react` adapter in `src/ui/workbench-runtime`. It maps the closed Archboard model into one ExternalStoreRuntime; app-server JSON-RPC remains the only transport and lifecycle source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An exact reviewed `@assistant-ui/react` version is pinned and only ExternalStoreRuntime APIs are used for thread, message, content part, tool, composer, cancellation, and stopped-run composition.
- [ ] #2 Streaming deltas, reasoning, tool state, interruption, failure, reconnect, and completion map without a second store, transport, or optimistic terminal state.
- [ ] #3 Unit and production-graph checks exclude AssistantTransport, assistant-cloud, AI SDK transport, assistant-ui voice/diff/syntax packages, and generated app-server imports.
<!-- AC:END -->
