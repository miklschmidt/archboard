---
id: TASK-143.01
title: Own Codex threads through a typed app-server session
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-09-02 01:44'
labels: []
dependencies:
  - TASK-143.08.05
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for one exact owned Codex app-server child and typed session. TASK-143.08 replaces the rejected generated-private and handwritten-copy design before this milestone can finish. The shared generated-derived type module, runtime ingress schemas, session and thread-link state, browser gateway, production composition, and lifecycle policy must form one current-epoch authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact 0.151.0 generated app-server types are available through one shared module root and ordinary compilation derives every used request, response, notification, reverse request, item, config, thread, turn, queue, session, and realtime view from them.
- [ ] #2 Only a current-child loaded thread with canAcceptDirectInput true forms an executable thread link; discovery, create, partial failure, reconnect, sign-in, crash, replacement, and outcome-unknown states remain explicit and non-executable when unsafe.
- [ ] #3 The production canvas entrypoint instantiates one process, session, realtime, approval, tool, semantic, coordinator, queue, callback, and spoken-gate graph; kept state survives reload without retaining generation-bound instances.
- [ ] #4 Runtime parsers prove generated-type conformance, mandatory child startup and shutdown are leak-free, and focused module plus public process owners replace fingerprint, mirror, copied-contract, and duplicate lifecycle scaffolding.
- [ ] #5 At most one package-local codex app-server child or starting child belongs to an Archboard server at any time; reload reuses it, concurrent starts cannot duplicate it, and crash replacement waits for complete prior-process-group reaping.
<!-- AC:END -->
