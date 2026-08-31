---
id: TASK-143.02.04
title: Govern the private Codex realtime workspace package
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 02:35'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the frozen realtime public index, completed media lifecycle contract, module-boundary rules, and existing repository-policy inventory. 2. Add a public-index consumer fixture proving construct/negotiate/meter/stop/dispose without React, Archboard, internal handles, stores, test fakes, or generated protocol imports. 3. Add structural repository-policy checks for the sole public entrypoint, exact exports, deep-import/extra-entrypoint/accidental-export rejection, and mutable module-global state, with actionable hostile fixtures. 4. Run focused public API, boundary, inventory, type, lint, format, and diff checks; submit the immutable range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.02.02 finalized and released this dependency-ready boundary leaf at integration HEAD eb9aeae. It owns only public API and repository-policy tests and is path-disjoint from active production work.
<!-- SECTION:NOTES:END -->
