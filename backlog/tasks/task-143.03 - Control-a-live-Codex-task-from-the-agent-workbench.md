---
id: TASK-143.03
title: 'Build the text, tools, queue, and approvals workbench UI'
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 15:16'
labels: []
dependencies:
  - TASK-140.03
  - TASK-143.01
  - TASK-143.05
  - TASK-143.06
  - TASK-143.07
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for browser transport, assistant-ui ExternalStoreRuntime, thread-link selection, canonical timelines, composer, queue, ordinary approvals, coordinator disclosure, board status, frame, and shell integration delivered by TASK-143.03.01-.11.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The eleven leaves compose one workhorse-first desktop workbench over the closed browser contract; `@assistant-ui/react` supplies headless conversation composition only and app-server state remains authoritative.
- [ ] #2 Every executable action names its thread link/turn/request target; unavailable, stale, prior-epoch, reconnect, approval, queue, interruption, completion, failure, and unknown states remain truthful and reachable.
- [ ] #3 Ordinary approvals use the discriminated request identity and remain separate from voice-specific eligibility/correlation presentation.
- [ ] #4 Rendered coverage proves supported desktop one/two-pane/fullscreen, collapsed/expanded, both themes, keyboard, logs, focus return, reduced motion, screen readers, Samsung Flip touch targets, and unchanged Excalidraw behavior.
<!-- AC:END -->
