---
id: TASK-143.03.02
title: Adapt Codex state with assistant-ui runtime providers
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 17:27'
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

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only the executable current workhorse uses named root imports useExternalStoreRuntime and AssistantRuntimeProvider; coordinator and persisted/prior-epoch histories use ReadonlyThreadProvider, and MessageNotSentError is the sole additional runtime member.
- [ ] #2 No namespace/default/subpath import, assistant transport, thread-list, queue, tool handler, setMessages, edit/reload/delete control, assistant voice adapter, or unassigned export is used.
- [ ] #3 A canonical turn-keyed assistant record is created immediately from authoritative command/turn identity; there is no optimistic placeholder message that can become competing truth.
- [ ] #4 Runtime failure, unsupported item mapping, stale turn, provider teardown, and reconnect preserve app-server authority and render an explicit recoverable or inspect-only state.
<!-- AC:END -->
