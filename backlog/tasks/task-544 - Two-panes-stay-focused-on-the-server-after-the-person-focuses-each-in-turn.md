---
id: TASK-544
title: Two panes stay focused on the server after the person focuses each in turn
status: To Do
assignee: []
created_date: '2026-10-25T21:46:00Z'
updated_date: '2026-10-25T21:46:00Z'
labels:
  - frontend
  - bug
dependencies: []
type: bug
ordinal: 950000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a person focuses one pane and then the other, the server still counts both panes as focused. An agent that runs `archboard browser show <board> --pane focused` is then refused with `"focused" matches 2 panes (left, right)`, so it cannot reach the pane the person is looking at. The browser lane test "the dock follows the pane the person focuses, not an agent's show, and its list picks a conversation" (tests/system/browser/codex-text-workbench.test.ts:444) fails steadily on branch feat/architecture-insight-ux, also on the code before 20441874c. c223a3023 (TASK-538.02) fixed the same symptom once: it moved pane-link state out of render, because a state set during the shell render made the server see both panes focused. That fix no longer holds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a person focuses pane A and then pane B, the server reports only pane B as focused
- [ ] #2 `browser show --pane focused` reaches the pane the person focused last
- [ ] #3 The dock test in tests/system/browser/codex-text-workbench.test.ts passes, with every assertion and timeout unchanged
- [ ] #4 The task notes name the observed cause and the commit that brought the failure back
<!-- AC:END -->
