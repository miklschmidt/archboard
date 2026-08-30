---
id: TASK-143.04.04
title: Render canonical voice transcript and cross-links
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.02.03
  - TASK-143.03.04
  - TASK-143.03.08
  - TASK-143.04.01
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-transcript
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own display projection for the canonical codex-realtime transcript port in `src/ui/voice-transcript`. It renders provisional/final item state and cross-links but does not merge raw events, deduplicate a second stream, or become a second thread history.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty, provisional, final, interrupted, processing, agent-speaking, completed, reconnecting, stale-session-suppressed, recoverable failure, and terminal failure render from canonical item identity, realtime session, role, and sequence.
- [ ] #2 Delegation, queue, steer, approval, callback, and workhorse-result links point to canonical records without copying them into transcript text or coordinator history.
- [ ] #3 Reconnect replay and late prior-session items remain ordered/inspectable according to the adapter outcome; this module never consumes flat transcript notifications or data-channel text directly.
- [ ] #4 Tests at src/ui/voice-transcript/tests cover every projection/cross-link, batched role=log announcements, aria-busy/relevant, keyboard inspection, no token announcements, and both themes.
<!-- AC:END -->
