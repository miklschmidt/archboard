---
id: TASK-143.01
title: Own Codex threads through a typed app-server session
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 16:25'
labels: []
dependencies: []
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
Integration milestone for shared identities, exact 0.151.0 generation/decoding, timing, authored contracts, dedicated process/storage/auth, epoch transactions, JSON-RPC, session/thread links, workhorse creation, browser gateway, final composition, and lifecycle policy delivered by TASK-143.01.01-18. Milestone ordering is intentionally expressed only by leaf dependencies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The leaves compose one exact 0.151.0 private stdio child and typed session whose generated protocol remains runtime-private and whose initialized, effective-storage, login-capable, account-ready, and thread-capable states are distinct.
- [ ] #2 Only a current-child loaded thread with canAcceptDirectInput true forms an executable thread link; every discovery, create, partial failure, reconnect, sign-in, crash, replacement, and outcome-unknown state is explicit and non-executable when unsafe.
- [ ] #3 The production canvas entrypoint instantiates process, session, realtime, approval, tool, semantic, coordinator, queue, callback, and spoken-gate ports exactly once; kept state survives reload without retaining generation-bound instances.
- [ ] #4 Exact protocol drift, generated-boundary, two-home isolation, workhorse transaction, reload, signal shutdown, pending reverse requests, late results, one-child/listener ownership, and orphan refusal are directly verified.
<!-- AC:END -->
