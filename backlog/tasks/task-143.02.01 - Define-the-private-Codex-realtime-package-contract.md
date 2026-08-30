---
id: TASK-143.02.01
title: Define the browser-native Codex realtime contract
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:54'
labels: []
dependencies: []
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/lib/contract.ts
  - src/ui/codex-realtime/index.ts
  - src/ui/codex-realtime/tests/contract.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the framework-neutral host/browser types and frozen public state-machine contract in src/ui/codex-realtime/lib/contract.ts, exported only by src/ui/codex-realtime/index.ts. It contains no Codex wire types, Archboard identities, React, assistant-ui, Node, or implementation globals.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The sole public index exports the host interface for createOffer SDP, answer SDP, remote media attachment, semantic events, and stop/recovery commands through opaque session/correlation values rather than Codex-generated types.
- [ ] #2 Closed states cover idle, requesting_permission, negotiating, listening, muted, processing, speaking, stopping, recoverable_error, terminal_error, and closed with explicit allowed transitions and reasons.
- [ ] #3 The contract exposes canonical item-scoped transcript records and delivered/not_delivered/outcome_unknown append outcomes but owns no transcript reduction or retry policy.
- [ ] #4 Tests consume only the public index and reject illegal transitions, caller-selected remote identity, WebSocket/audio-chunk APIs, React/assistant-ui/Node imports, and mutable internal handles.
<!-- AC:END -->
