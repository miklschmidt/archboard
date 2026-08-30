---
id: TASK-143
title: Operate Codex threads by text and voice from the workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 15:16'
labels: []
dependencies:
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/desktop-remote-control-integration-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
priority: high
type: feature
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver one coherent Codex workbench on the merged TASK-140 operator shell. A pane explicitly links to one current-epoch workhorse on Archboard's owned app-server child; a persistent capable coordinator supports live voice, semantic context, bounded direct actions, delegation, queueing, callbacks, and state-gated spoken approvals. The child tasks are integration milestones; their leaves own the implementable modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The complete dependency graph delivers one exact-version owned app-server session, explicit current-epoch thread links, text/tool/queue/approval control, semantic context, capable coordinator, and browser-native live voice without Desktop/shared-daemon attachment or a second protocol.
- [ ] #2 Every implementation leaf names one deep module or narrow configuration seam, its public contract, reachable states, dependencies, and direct verification so a gpt-5.6-luna worker can execute it without resolving cross-module architecture.
- [ ] #3 The rendered desktop workbench follows the merged TASK-140 operator shell, preserves board claim/doing/take-back behavior, keeps workhorse and coordinator histories distinct, and covers supported one/two-pane, fullscreen, keyboard, screen-reader, both-theme, and Samsung Flip touch workflows.
- [ ] #4 Acceptance requires exact 0.151.0 protocol/process conformance, two-home isolation, generated-contract drift checks, module and browser owners, production graph inspection, and a clean-process real text/voice smoke.
<!-- AC:END -->
