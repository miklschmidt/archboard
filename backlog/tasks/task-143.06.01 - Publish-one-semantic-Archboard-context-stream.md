---
id: TASK-143.06.01
title: Publish one semantic Archboard context stream
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-semantic-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own compact semantic board context in `src/runtime/codex-semantic-context`. The named `SemanticContextSource` consumes the existing server change-report hook, focus, and selection ports and publishes `SemanticContextEvent`; it chooses no thread and retains no board copy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The server change-report hook emits settled human or mixed-origin significant changes once; agent-only, cosmetic, and no-op changes are silent and the existing board responsiveness path is unchanged.
- [ ] #2 SemanticContextEvent is a closed union for board delta, ephemeral focus/selection, and fresh voice-start brief with source attribution, monotonic correlation, observedAt, freshness horizon, and explicit ambiguity.
- [ ] #3 One named brief policy bounds characters/items, compacts oldest superseded facts, never takes a second board snapshot, and produces an explicit truncated/ambiguous result rather than silent omission.
- [ ] #4 Public-module tests in src/runtime/codex-semantic-context/tests cover debounce/settle timing from shared timing constants, significance, attribution, self-refusal, freshness expiry, ambiguity, compaction budget, and no retained board document.
<!-- AC:END -->
