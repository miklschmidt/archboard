---
id: TASK-143.03.02
title: Map Codex state into assistant-ui ExternalStoreRuntime
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.02
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
Map authoritative Codex workhorse turns into assistant-ui through useExternalStoreRuntime and AssistantRuntimeProvider. Coordinator and inspect-only histories use ReadonlyThreadProvider; no assistant-ui transport or state owner is adopted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only the executable current workhorse uses useExternalStoreRuntime inside AssistantRuntimeProvider; coordinator and persisted/prior-epoch histories render through ReadonlyThreadProvider.
- [ ] #2 Direct assistant-ui imports are limited to the assigned runtime/provider and reviewed message/composer primitives; assistant transport, thread-list, queue, tool handlers, setMessages, edit/reload/delete controls, and assistant voice adapters are forbidden.
- [ ] #3 A canonical turn-keyed assistant record is created immediately from the authoritative command/turn identity; there is no optimistic placeholder message that can become competing truth.
- [ ] #4 Runtime failure, unsupported item mapping, stale turn, provider teardown, and reconnect preserve app-server authority and render an explicit recoverable or inspect-only state.
<!-- AC:END -->
