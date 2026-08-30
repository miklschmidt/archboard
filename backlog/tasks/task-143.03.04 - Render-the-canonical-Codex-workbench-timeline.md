---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:58'
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
- [ ] #1 Exhaustive rendering covers all 19 generated ThreadItem variants with canonical identity and no assistant-ui state/transport ownership.
- [ ] #2 Only the explicitly reviewed message primitives are imported directly from assistant-ui; renderers and styling are Archboard-owned and no Elements source is copied.
- [ ] #3 Large payloads are bounded/expandable, text/control characters escaped, URLs scheme-checked, and malformed local file/image data renders inert fallback.
- [ ] #4 Keyboard order, semantic structure, live-region policy, screen-reader names, item identity, and expansion survive updates without focus loss or duplicate content.
<!-- AC:END -->
