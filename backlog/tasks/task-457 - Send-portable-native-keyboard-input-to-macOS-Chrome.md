---
id: TASK-457
title: Send portable native keyboard input to macOS Chrome
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 15:35'
updated_date: '2026-10-11 15:35'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 737000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The complete local browser lane repeatedly fails part search after Escape. A blank page reproduces thousands of Unidentified key events. Direct CDP input delivers one Escape when nativeVirtualKeyCode is omitted, but the Windows code 27 reproduces the event storm on macOS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Real trusted keyboard input delivers the requested keys and modifiers without a platform key-code event storm.
- [ ] #2 The unchanged inspection and remaining normal browser owners pass with their existing assertions and timeout contracts.
- [ ] #3 Complete local and hosted normal gates pass without excluding owners or weakening policy.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected because this task repairs browser test infrastructure. Keep agent-browser as the browser owner. Send macOS press input through the existing DevTools connection with portable key fields and unchanged command deadlines. Add a real blank-page regression that proves one trusted Escape, preserved modifiers, and ordinary text entry. Keep the original inspection owner unchanged. Run the remaining browser owners, scoped review, and complete local and hosted gates.
<!-- SECTION:PLAN:END -->
