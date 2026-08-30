---
id: TASK-143.03.03
title: Choose and disclose the pane thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:38'
labels: []
dependencies:
  - TASK-143.01.09
  - TASK-143.01.11
  - TASK-143.03.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-thread-link
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own pane thread-link selection and readiness disclosure. Create and Attach are separate commands with separate prerequisites; no recent-thread heuristic or implicit load occurs. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Create requires the composed process/session to be thread-capable plus exactly one valid absolute checkout root; it runs the start-and-bind transaction and shows outcome_unknown as inspect-only evidence.
- [ ] #2 Attach requires a currently discovered Thread row whose ID appears in the fully paginated loaded-ID membership, with canAcceptDirectInput true and current-epoch provenance; persisted-only, notLoaded, systemError, false/null capability, stale-child, unknown-source, and unknown-provenance rows are disabled with exact reasons.
- [ ] #3 The UI distinctly renders missing/wrong binary, locked home, spawn/backoff/stopped, initialize/config/effective-storage mismatch, signed-out, API-key/ChatGPT/Bedrock login progress/failure, logout, and command-before-ready.
- [ ] #4 Selection, bind, unbind, reconnect, child replacement, and pane navigation use compare-and-swap identity; focus never retargets a pending command.
<!-- AC:END -->
