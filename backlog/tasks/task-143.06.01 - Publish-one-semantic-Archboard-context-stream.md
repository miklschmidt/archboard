---
id: TASK-143.06.01
title: Publish one semantic Archboard context stream
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/adr/0005-bystander-injection.md
modified_files:
  - src/runtime/codex-semantic-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own compact semantic board, focus, and selection context in `src/runtime/codex-semantic-context`. It consumes the existing change feed and exposes one typed publisher; it does not choose threads, issue app-server calls, or retain a second board snapshot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Settled human or mixed-origin significant changes produce one compact narration; agent-only changes are never narrated back to their author and cosmetic/no-op changes stay silent.
- [ ] #2 Board changes, ephemeral focus/selection context, and fresh voice-start briefs are distinct typed events with observable freshness and ambiguity.
- [ ] #3 Debounce, significance, attribution, self-injection refusal, fresh-brief compaction, and no-second-snapshot behavior are covered through the public module interface.
<!-- AC:END -->
