---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-144.14
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
Own timeline projection and Archboard renderers in `src/ui/workbench-timeline` using assistant-ui primitives over ExternalStoreRuntime. No assistant-ui Element source is copied and this module does not mutate turns, queue, or approvals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Owned renderers cover empty/loading, user/assistant text, reasoning summary, command/output, ordinary/dynamic tools, file changes, web/MCP, queue/callback links, streaming, completion, interruption, recoverable/terminal failure, reconnect, and unknown items.
- [ ] #2 Stable identities and canonical order survive streaming/reconnect; raw detail is inspectable, cross-links do not copy records, and no optimistic completion is rendered.
- [ ] #3 The focusable role=log batches streaming/callback announcements, exposes aria-busy/relevant, never announces tokens, never relies on color alone, and follows the operator contract in both themes.
- [ ] #4 Tests at src/ui/workbench-timeline/tests exhaust item/state renderers, ordering, accessibility semantics, keyboard inspection, reduced motion, and malformed/unknown content.
<!-- AC:END -->
