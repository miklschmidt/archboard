---
id: TASK-143.02.04
title: Expose the Codex realtime public module
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.02.02
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/index.ts
  - src/ui/codex-realtime/tests/public-api.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the single extraction-ready entrypoint for the browser-native realtime module. It exports only reviewed types/factories and keeps implementation files behind the module boundary; it does not edit root package metadata.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The entrypoint exports only the frozen host contract, state/event types, media-session factory, and supported feature marker; no internal handle, store, test fake, Archboard adapter, or generated Codex type escapes.
- [ ] #2 A consumer fixture compiles using only the entrypoint and can construct, negotiate, meter, stop, and dispose a session without React or Archboard imports.
- [ ] #3 Deep imports are rejected by the existing module-entrypoint policy, and API extraction fails on accidental exports or mutable global state.
- [ ] #4 The module stays private in this repository; a later publication decision would require its own task, metadata, compatibility policy, and security review.
<!-- AC:END -->
