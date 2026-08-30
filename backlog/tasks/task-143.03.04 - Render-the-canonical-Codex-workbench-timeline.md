---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 17:27'
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
Render the complete decoded Codex 0.151.0 ThreadItem union as bounded, escaped, accessible timeline content. This leaf alone may directly import the reviewed assistant-ui message primitives; it copies no Elements. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module's only assistant-ui imports are named root ThreadPrimitive, MessagePrimitive, and MessagePartPrimitive; every rendered item, fallback, disclosure, class, and semantic state is Archboard-owned.
- [ ] #2 User/assistant/reasoning/plan/command/file/MCP/web/image/tool/approval/error/interruption items render by stable thread/turn/item identity with bounded expandable raw details and no copied Elements.
- [ ] #3 The timeline is a named focusable role=log with aria-relevant additions and aria-busy only while streaming; token deltas do not cause repeated live announcements or steal focus.
- [ ] #4 Unknown item variants, malformed markdown/media, long output, streaming completion, delayed arrival, and prior-epoch history have safe deterministic renderers and module tests.
<!-- AC:END -->
