---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-timeline
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own timeline projection and renderers in `src/ui/workbench-timeline`. It receives canonical ordered content from ExternalStoreRuntime and does not mutate turns, queue, or approvals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Named renderers cover user/assistant text, reasoning summary, command/output, ordinary and dynamic tools, file changes, web/MCP activity, queue/callback cross-links, completion, interruption, failure, and unknown items.
- [ ] #2 Stable identities and canonical order are preserved through streaming/reconnect; raw detail is inspectable where useful and terminal states remain truthful.
- [ ] #3 The focusable log batches streaming and callback announcements instead of announcing tokens, never relies on color alone, and follows the operator visual contract in both themes.
<!-- AC:END -->
