---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.03.07
  - TASK-143.04.01
  - TASK-143.07.05
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-spoken-approval
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Present voice-specific eligibility, one-slot gate, captured utterance evidence, expiry/race, and visual fallback above the ordinary approval card. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only the broker's genuine binary approval marked eligible can show spoken accept/decline; secrets, multi-question input, URL/form elicitation, permission scope, coordinator-blocking, and unsupported requests are visual-only with a reason.
- [ ] #2 The view shows immutable request/effect/source, captured realtime session/transcript sequence, armed/expired/resolving/visual-fallback/outcome-unknown state, and never claims that speech directly settled a Codex request.
- [ ] #3 A second request, stale link/session/manifest, ambiguous utterance, missing final transcript, lost resolver result, or gate expiry preserves the ordinary visual card and leaves no awaiting_user state.
- [ ] #4 Tests live at src/ui/voice-spoken-approval/tests and cover accessible announcements, focus, Stop, fallback, and every gate outcome without constructing broker responses.
<!-- AC:END -->
