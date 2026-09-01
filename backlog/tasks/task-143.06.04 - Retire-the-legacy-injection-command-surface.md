---
id: TASK-143.06.04
title: Remove legacy injection from server and runtime
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-09-01 14:15'
labels: []
dependencies:
  - TASK-143.06.02
  - TASK-143.01.14
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/canvas/lib/application.ts
  - src/runtime/engine/injection.ts
  - src/runtime/engine/change-feed.ts
  - tests/system/canvas-state/injection.test.ts
  - tests/system/canvas-state/support/injection-daemon.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/repository-policy/test-inventory.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove legacy injection startup, routes, status/test handlers, change-feed subscriber, and runtime module after semantic linked delivery is composed. Keep historical ADR/research intact. Delegation profile: gpt-5.6-sol, medium for the cross-module removal seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Startup/application no longer reads ARCHBOARD_INJECT*, arms injection, exposes /api/injection or /api/injection/test, or holds a legacy injector singleton; removed routes use the ordinary unknown-route contract.
- [ ] #2 The change feed retains human responsiveness and semantic source while removing only the control-socket subscriber; no server/runtime import reaches injection.ts or app-server-control.ts.
- [ ] #3 In the same green change, the importing canvas-state injection owner/daemon are retired or rewritten, browser support removes injection routes/fixtures, and repository test inventory removes the retired owner without changing the 19 browser-owner baseline.
- [ ] #4 Canvas-state/process/browser/repository tests prove no control-socket client, removed routes, unchanged board/change-feed behavior, one private stdio graph, and no missing/duplicate test owner.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the legacy injector import, startup arm, route exemption, status payload, and status/test handlers from the canvas application so both retired paths fall through the ordinary Express 404 contract.
2. Delete the legacy runtime injector and its canvas-state owner/daemon, while preserving the change feed as the sole semantic event source consumed by the owned stdio workbench.
3. Remove legacy injection environment fixtures from browser support without changing the 19 canonical browser owners.
4. Add direct repository and process-level assertions for no server/runtime dependency on injection.ts or app-server-control.ts, removed-route 404 behavior, unchanged semantic human delivery, and one private stdio production graph.
5. Run focused tests, inventory, type, lint, format, and proportionate system validation sequentially in named 6 GiB/1 GiB transient user scopes; self-review the fixed-base diff, commit, then finalize only after every criterion has objective evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation ready for independent review on fixed base 88e7643ae2b2277ae1a5de78c23d82fa6ff52c01. Removed the legacy injector import, singleton, startup arming, change-feed status field, route exemption, GET/POST handlers, runtime module, canvas-state owner, daemon, and browser env fixtures. Added policy enforcement for the retired owner/control-client reachability and the 19-owner baseline. Direct production coverage proves the removed routes match ordinary unknown-route responses, one human change reaches the exact private stdio thread once as developer/input_text, and a later agent-only change stays silent.

The removal exposed two replacement-graph bugs fixed in the same seam: production encoded semantic cursors as JSON instead of the canonical token, causing invalid_context refusal, and an unbound human edit let context capture throw through the feed and kill the canvas. The application now uses canonicalSemanticCursorToken; the publisher records and drops unavailable source context without interrupting the board/feed.

Green capped evidence: production composition 1/39; semantic/change-feed/delivery modules 40/155 plus unbound source owner 1; complete canvas-state 26/490; composition policy 4/49; policy plus inventory 41/74 and final focused combined 43/118; both TypeScript projects; Oxlint; Oxfmt; frontend build; 17 reached browser owners plus code-target activation. Browser risks preserved without weakening or repeated reruns: human-edit performance completed 64 product assertions and measurements twice but failed the same final strace unfinished/resumed-line parser check; opener-settings saw the current pre-existing semantic-unavailable notice instead of its expected empty notice. Known module-scope and aggregate-boundary OOM fingerprints were not rerun. Protected artifact SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.
<!-- SECTION:NOTES:END -->
