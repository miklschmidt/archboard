---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 16:58'
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
Present voice-specific eligibility, one-slot gate, captured user-utterance evidence, expiry/race, and visual fallback above the ordinary approval card. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only a genuine broker binary approval can be spoken-eligible; secrets, forms/URLs, permission scope, coordinator-blocking, and unsupported requests remain visual-only with a reason.
- [ ] #2 The view shows immutable request/effect/source plus the matching final user realtime item/session/sequence captured after the effect prompt; assistant output is labelled non-authoritative and never arms the gate.
- [ ] #3 Armed/expired/resolving/visual-fallback/outcome_unknown states explain that a later ordinary classifier turn—not realtime speech—settles the typed request.
- [ ] #4 A second request, stale identity, ambiguous/missing/non-final user utterance, assistant-only output, lost result, or expiry preserves the visual card and leaves no awaiting_user.
<!-- AC:END -->
