---
id: TASK-143.02.04
title: Govern the private Codex realtime workspace package
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 17:52'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.02.02
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/tests/public-api.test.ts
  - tests/system/repository-policy/codex-realtime-boundary.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enforce the single extraction-ready entrypoint already assembled by TASK-143.02.01-.02. This leaf owns boundary and API-surface checks only; it does not edit the serialized index or root package metadata.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The boundary fixture proves src/ui/codex-realtime/index.ts is the sole public entrypoint and exports only the frozen host contract, state/event types, media-session factory, and supported feature marker.
- [ ] #2 A consumer fixture imports only the index and can construct, negotiate, meter, stop, and dispose a session without React, Archboard, internal-handle, store, test-fake, or generated Codex imports.
- [ ] #3 Repository policy rejects consumer deep imports into lib, extra public entrypoints, accidental exports, and mutable module-global state with actionable failures.
- [ ] #4 The module stays private in this repository; a later publication decision requires its own task, metadata, compatibility policy, and security review.
<!-- AC:END -->
