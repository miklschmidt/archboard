---
id: TASK-143.03.02
title: Adapt Codex state with assistant-ui runtime providers
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-01 17:35'
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

Delegation profile: gpt-daybreak-blue-latest, low.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only the executable current workhorse uses named root imports useExternalStoreRuntime and AssistantRuntimeProvider; coordinator and persisted/prior-epoch histories use ReadonlyThreadProvider, and MessageNotSentError is the sole additional runtime member.
- [ ] #2 No namespace/default/subpath import, assistant transport, thread-list, queue, tool handler, setMessages, edit/reload/delete control, assistant voice adapter, or unassigned export is used.
- [ ] #3 A canonical turn-keyed assistant record is created immediately from authoritative command/turn identity; there is no optimistic placeholder message that can become competing truth.
- [ ] #4 Module tests cover runtime failure, unsupported item mapping, stale turn, provider teardown, and reconnect, proving app-server authority is preserved and each path renders an explicit recoverable or inspect-only state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the src/ui/workbench-runtime public provider contract around BrowserWorkbenchTransport and BrowserSnapshot, retaining the transport as the only subscription, reconnect, and command owner. This improves the operator workbench workflow by making the executable current workhorse available to assistant-ui consumers without duplicating app-server state.
2. Convert each authoritative timeline turn into a stable turn-keyed assistant message record, map supported timeline items deterministically, and render unsupported, stale, disconnected, and runtime-failure paths as explicit recoverable or inspect-only records with no optimistic placeholders.
3. Bind only executable current-epoch workhorses to useExternalStoreRuntime plus AssistantRuntimeProvider. Bind coordinator and inspect-only or prior-epoch histories to ReadonlyThreadProvider, with no assistant-ui transport, thread-list, queue, tools, voice, edit, reload, delete, setMessages, or extra state owner.
4. Add module tests through the public provider contract for stable identity, runtime failure, unsupported item mapping, stale turn, teardown, and reconnect. Assert the transport retains one authoritative subscription and command targeting.
5. Run focused module and policy tests, test inventory, both TypeScript projects, frontend build, lint, format, and diff checks sequentially under named 6G/1G transient services. Classify any fixed-base or unavailable-browser failures, self-review the fixed range, commit only owned paths, and leave the task In Progress with unchecked criteria and no final summary.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/ui/workbench-runtime as the sole assistant-ui runtime adapter. Each authoritative Codex turn maps to one deterministic assistant record keyed by turnId with no optimistic metadata. Supported text/reasoning/item states map losslessly into Archboard-owned parts; unknown items and duplicate identities become explicit recoverable records. Only a connected, thread-capable executable link mounts useExternalStoreRuntime under AssistantRuntimeProvider. Coordinator, inspect-only, prior-epoch, stale, reconnecting, unavailable, and runtime-failure histories use ReadonlyThreadProvider. The existing BrowserWorkbenchTransport remains the only snapshot subscription, reconnect, and command owner.

Validation under named transient user services with WorkingDirectory fixed to this checkout, MemoryMax=6G, and MemorySwapMax=1G: focused module 8 tests/26 assertions passed; assistant-ui import/dependency policy 12 tests/282 assertions passed; test inventory 39 tests/69 assertions passed; root and frontend TypeScript passed; frontend build passed; full Oxlint passed on 909 files; repository Oxfmt check passed on 991 files; git diff check passed. The repository boundary owner reproducibly reached the 6G memory and 1G swap caps after its first six cases passed, both alone and in the initial combined policy invocation; it was not retried. Existing task records document the same aggregate repository-policy OOM class at higher caps, so this is classified as a fixed-base resource failure, not a product assertion. No browser lane was claimed because TASK-143.03.13 owns rendered integration and this leaf adds no final shell composition.
<!-- SECTION:NOTES:END -->
