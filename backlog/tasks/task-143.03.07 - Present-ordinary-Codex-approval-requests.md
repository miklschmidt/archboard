---
id: TASK-143.03.07
title: Present ordinary Codex approval requests
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.05.02
  - TASK-143.03.01
  - TASK-144
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
Own reusable non-voice approval cards in `src/ui/workbench-approvals`. The module renders the shared discriminated identity/effect record and emits one decision; it does not own spoken eligibility or speech-session correlation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cards cover command/file approvals, tool user input, MCP elicitation, permissions, legacy approvals, general dynamic tools, and bound coordinator effects with every generated reason and offered decision.
- [ ] #2 Each card shows the actual identity variant, target/state token, effect hash, command/cwd/action/network/permission/amendment details, and never invents a missing turn.
- [ ] #3 Only the browser lease owner can decide; stale, changed, expired, server-resolved, fabricated, owner-lost, duplicate, or invalid records become explicit terminal presentations and send no second response.
- [ ] #4 Keyboard-only one-time decisions, focus return, accessible labels/status, and every identity variant are browser-tested.
<!-- AC:END -->
