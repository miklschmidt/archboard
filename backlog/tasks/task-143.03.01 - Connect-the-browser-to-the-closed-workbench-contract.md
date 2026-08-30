---
id: TASK-143.03.01
title: Connect the browser to the closed workbench contract
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-transport
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Connect the browser to the closed workbench gateway produced by the final server composition root. Own transport/reconnect/sequence behavior only; never instantiate a process, session, coordinator, queue, approval, semantic, or realtime owner in the UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The client obtains one versioned full snapshot then applies strictly sequenced deltas from the production gateway; reconnect requests a new snapshot and never replays a command automatically.
- [ ] #2 Commands carry browser lease, pane, link, child epoch, and command identity and retain their original target across focus/navigation changes.
- [ ] #3 Stopped/backoff, initialized, storage mismatch, login-capable/signed-out/login pending, account-ready, thread-capable, reconnecting, stale snapshot, and incompatible-contract states are represented without enabling unsupported commands.
- [ ] #4 Transport tests use the final composed gateway public contract and prove duplicate/out-of-order messages, lost responses, late results, lease expiry, close, and recovery.
<!-- AC:END -->
