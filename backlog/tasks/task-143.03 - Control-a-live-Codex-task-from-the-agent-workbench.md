---
id: TASK-143.03
title: 'Build the text, tools, queue, and approvals workbench UI'
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 17:06'
labels: []
dependencies: []
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
Integration milestone for browser transport, pinned assistant-ui useExternalStoreRuntime/providers, thread-link selection, owned timelines/composer/queue/approvals, coordinator disclosure, board status, text frame, shell integration, and the canonical text browser owner delivered by TASK-143.03.01-.13.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The thirteen leaves compose one workhorse-first desktop workbench; @assistant-ui/react 0.15.17 supplies only useExternalStoreRuntime, AssistantRuntimeProvider, ReadonlyThreadProvider, and assigned headless message/composer primitives. Archboard owns every rendered component and app-server state remains authoritative.
- [ ] #2 Every executable action names its link/turn/request target; all empty/loading/progress/unavailable/stale/prior-epoch/reconnect/approval/queue/interruption/completion/failure/recovery/unknown states have one module owner and test path.
- [ ] #3 Ordinary approvals render the broker identity and remain separate from voice eligibility; root dependency, module, shell, and browser-inventory edits are explicitly serialized.
- [ ] #4 The text browser owner proves desktop one/two-pane/fullscreen, collapsed/expanded, themes, keyboard, logs, focus, reduced motion, screen reader, Samsung Flip touch, exact targeting, and unchanged Excalidraw.
<!-- AC:END -->
