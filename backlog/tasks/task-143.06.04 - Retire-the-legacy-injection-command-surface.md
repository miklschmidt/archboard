---
id: TASK-143.06.04
title: Remove legacy injection from server and runtime
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-09-01 14:21'
labels: []
dependencies:
  - TASK-143.06.02
  - TASK-143.01.14
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-semantic-context/lib/publisher.ts
  - src/runtime/codex-semantic-context/tests/source-failure.test.ts
  - src/runtime/engine/change-feed.ts
  - src/runtime/engine/injection.ts
  - src/server/canvas/lib/application.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/canvas-state/codex-workbench-production.test.ts
  - tests/system/canvas-state/injection.test.ts
  - tests/system/canvas-state/support/injection-daemon.ts
  - tests/system/repository-policy/legacy-injection-removal.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove legacy injection startup, routes, status/test handlers, change-feed subscriber, and runtime module after semantic linked delivery is composed. Keep historical ADR/research intact. Delegation profile: gpt-daybreak-blue-latest, medium for the cross-module removal seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Startup/application no longer reads ARCHBOARD_INJECT*, arms injection, exposes /api/injection or /api/injection/test, or holds a legacy injector singleton; removed routes use the ordinary unknown-route contract.
- [x] #2 The change feed retains human responsiveness and semantic source while removing only the control-socket subscriber; no server/runtime import reaches injection.ts or app-server-control.ts.
- [x] #3 In the same green change, the importing canvas-state injection owner/daemon are retired or rewritten, browser support removes injection routes/fixtures, and repository test inventory removes the retired owner without changing the 19 browser-owner baseline.
- [x] #4 Canvas-state/process/browser/repository tests prove no control-socket client, removed routes, unchanged board/change-feed behavior, one private stdio graph, and no missing/duplicate test owner.
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

Independent fixed-range review of 88e7643ae2b2277ae1a5de78c23d82fa6ff52c01..777d5a62444da9b66366ae5a6032d1ca30f8f86d returned REVIEW_CLEAN with no findings. Final accepted evidence: the production owner passed 1 test with 41 assertions; change feed, semantic publisher/fanout/source-failure, and exact delivery passed 49 tests with 278 assertions; legacy-removal policy plus inventory passed 41 tests with 74 assertions; one-process lifecycle and construction owners passed 12 tests with 62 assertions. Both TypeScript projects, scoped Oxlint, Oxfmt, and git diff --check passed. The removed routes match ordinary unknown-route responses. One human change reaches one private stdio child exactly once as thread/inject_items, and an agent-only change stays silent. No test, lint, type, inventory, browser, or CI rule was weakened.

Browser limitations remain outside this leaf and are not reported as a green complete lane: human-edit-performance passed all 64 product assertions and measurements, but its strace parser rejected unfinished/resumed syntax; opener-settings has pre-existing semantic-notice expectation drift. Their existing owners retain follow-up responsibility. The protected artifact remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the legacy injection server/runtime path and retired its canvas-state owner, daemon, and browser fixtures. The change leaves the explicit linked workhorse on one private stdio child as the only semantic delivery route, fixes canonical cursor encoding, and keeps unbound human edits from interrupting the board feed. Independent review found no issues. Production, semantic delivery, lifecycle, removal-policy, inventory, TypeScript, lint, format, and diff checks passed. The complete browser lane is not claimed green because human-edit-performance hit its strace parsing limitation after 64 passing product assertions, and opener-settings retains pre-existing semantic-notice expectation drift.
<!-- SECTION:FINAL_SUMMARY:END -->
