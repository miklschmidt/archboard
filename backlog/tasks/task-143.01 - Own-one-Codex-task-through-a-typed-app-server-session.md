---
id: TASK-143.01
title: Own Codex threads through a typed app-server session
status: To Do
assignee: []
created_date: '2026-08-30 11:43'
updated_date: '2026-08-30 15:16'
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
Integration milestone for the shared identity/browser contracts, exact protocol, dedicated child, epoch store, JSON-RPC transport, authored instructions, typed session, thread-link classifier, and browser gateway delivered by TASK-143.01.01-.10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The ten leaves compose into one exact 0.151.0 private stdio child and one typed session whose generated protocol remains runtime-private.
- [ ] #2 Only a current-epoch loaded controllable thread can form an executable pane thread link; every other discovery, reconnect, sign-in, crash, and replacement state is explicit and non-executable.
- [ ] #3 The dedicated Codex and effective SQLite homes, external epoch manifest, environment allowlist, account state, process lifecycle, browser lease, and two-session isolation are directly verified.
- [ ] #4 Runtime/server/UI communicate only through the shared identities and closed browser contract with no forbidden area import.
<!-- AC:END -->
