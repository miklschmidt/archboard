---
id: TASK-143.03.07
title: Present ordinary Codex approval requests
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.01
  - TASK-143.05.02
  - TASK-144.07
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-approvals
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own reusable Archboard non-voice approval cards in `src/ui/workbench-approvals`. They are owned Base UI/Tailwind source, not copied assistant-ui Elements, and render the broker record without owning lease, settlement, spoken eligibility, or speech correlation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cards cover every broker identity/variant and show empty/loading, pending, deciding, accepted, declined, expired, changed, cancelled, server-resolved, owner-lost, outcome_unknown, and failed states with actual effect details.
- [ ] #2 Only the browser lease owner can submit one offered decision; stale, fabricated, duplicate, invalid, or terminal records expose no second response path and missing turns are never invented.
- [ ] #3 Command/cwd/action/network/permission/amendment, target token, effect hash, requester identity, and visual-only/spoken eligibility reason remain inspectable without leaking credentials.
- [ ] #4 Tests at src/ui/workbench-approvals/tests cover every generated identity, state, keyboard-only choice, focus return, dialog/card labels, aria-live status, both themes, and owner loss.
<!-- AC:END -->
