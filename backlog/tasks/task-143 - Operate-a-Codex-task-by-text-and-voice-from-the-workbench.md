---
id: TASK-143
title: Operate Codex threads by text and voice from the workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-140
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
Deliver one coherent Codex workbench on merged TASK-140. A pane links to one current-epoch workhorse on Archboard's owned app-server child; a capable persistent coordinator supports voice, semantic context, bounded direct actions, delegation, queueing, callbacks, and state-gated spoken approvals. Seven milestones and 57 implementation leaves own the complete module/test/config DAG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The dependency graph delivers one exact-version owned app-server session, explicit current-epoch thread links, text/tool/queue/approval control, semantic context, capable coordinator, and browser-native live voice without Desktop/shared-daemon attachment or a second protocol.
- [ ] #2 Each of 57 leaves names one deep module, test/documentation owner, or narrow configuration seam, its public contract, reachable states, dependencies, and direct verification so a gpt-5.6-luna worker need not resolve cross-module architecture.
- [ ] #3 The rendered desktop workbench follows merged TASK-140, preserves claim/doing/take-back, keeps workhorse/coordinator histories distinct, and covers one/two-pane, collapsed, fullscreen, keyboard, screen-reader, themes, reduced-motion, and Samsung Flip touch.
- [ ] #4 Acceptance requires exact 0.151.0 process/protocol conformance, two-home isolation, generated drift checks, module/process/browser owners, production graph inspection, controlled voice coverage, and a clean-process real text/voice smoke.
<!-- AC:END -->
