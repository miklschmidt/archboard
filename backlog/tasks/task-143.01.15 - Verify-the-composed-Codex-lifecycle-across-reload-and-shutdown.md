---
id: TASK-143.01.15
title: Verify the composed Codex lifecycle across reload and shutdown
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-09-01 15:30'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/server/canvas/lib/application.ts
  - src/server/canvas/lib/codex-workbench-approvals.ts
  - src/server/canvas/lib/codex-workbench-authority.ts
  - src/server/canvas/lib/codex-workbench-lifecycle.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - tests/system/process-contracts/codex-workbench-lifecycle.test.ts
  - tests/system/process-contracts/codex-workbench-storage.test.ts
  - tests/system/process-contracts/codex-workbench-outcomes.test.ts
  - tests/system/process-contracts/codex-workbench-termination.test.ts
  - tests/system/process-contracts/support/codex-workbench-lifecycle.ts
  - tests/system/process-contracts/support/codex-workbench-outcomes.ts
  - tests/system/process-contracts/support/codex-workbench-result-assertions.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one real-process lifecycle and protocol owner for the production Codex composition seam. It tests public server behavior against controlled exact-version and clean-home processes; it does not instantiate an alternate graph. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean restrictive home proves config.toml materialization, initialize.codexHome, config origin and sqlite_home, managed-requirement reconciliation, account readiness, one executable link, and canonical OperationId issuance; env-only or null, redirected, symlink, and conflicting stores refuse.
- [ ] #2 The process owner drives all eleven server-request variants through the exhaustive production router, including whole-second currentTime/read and exact token-refresh and attestation errors, with no dropped or double response.
- [ ] #3 Through public ports it covers all six general tools, their confirmed, partial, and uncertain results, two-home isolation, general and coordinator dynamic calls, seven ordinary approval families, and fresh create, fork, and send visual approvals across approve, decline, expiry, cancellation, browser disconnect, stale revalidation, and terminal approval_required without resume. Module owners retain exhaustive fake-port matrices.
- [ ] #4 Reload during in-flight RPC, ordinary reverse requests, dynamic approval, and wait preserves one child, listener, coordinator, queue, broker, gate, and replaceable handler set. Browser disconnect, child exit, signals, and normal close settle or classify every request, release wait edges, invalidate effect authority, and leave no orphan or later mutation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the controlled 0.151.0 executable with deterministic requirement, mutation-outcome, approval-terminalization, reload-activation, and teardown controls. Keep every observable in the public process log or application socket projection.
2. Split the system owners by storage/requirements, process results/approvals, and reload/teardown so each remains under repository size limits while all reuse the real production composition. Assert exact response envelopes, remote effect counts, retained owner identities, terminal settlement, frozen logs, and orphan absence.
3. Run each new process owner first in its named 6 GiB systemd scope, then existing production and module regressions, repository inventory, cheaper targeted boundary enforcement, both TypeScript projects, full lint, formatting, and fixed-base diff checks.
4. Commit remediation on top of fb1dc801, update only implementation notes and modified files through Backlog CLI, and return the complete 88e7643a..new-head range for independent rereview. Leave status, AC, description, and final summary untouched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope correction from direct verification: the true Bun reload owner exposed two reachable production defects. Reload rebuilt the coordinator without its retained persisted settings, and fork/send approval projection passed raw Codex identities into authority-bound browser schemas. The implementation now carries coordinator persistence into replacement generations and adopts mutation thread/turn identities before browser projection.

The real-process owner is split into lifecycle, storage/isolation, and shared controlled-fixture files so the repository max-lines rule remains enforced. It still drives the one production composition graph and creates all derived fixture executables only under temporary roots.

Validation evidence before review: composed owner 3 pass/83 expectations; targeted lifecycle, coordinator reuse, and browser model modules 45 pass/241 expectations; existing production composition and cleanup 6 pass/95 expectations; main and frontend TypeScript pass; full lint and format check pass; repository inventory 39 pass. The standalone generic and Codex boundary policy owners exceeded their 6 GiB memory scope and were OOM-killed; the full lint boundary enforcement passed, and no rule was disabled or weakened.

Independent review rejected fb1dc801 for missing direct public-process evidence in AC1, AC3, and AC4. Remediation will add the named process cases rather than citing module matrices. The three production fixes were reviewed as correct and remain stable unless a new process case proves otherwise.

Remediation adds direct real-process evidence for managed configRequirements match/conflict, exact success values for all six general tools, partial and outcome-unknown mutation results, visual approval expiry, reload-carried waits, browser disconnect, SIGINT, SIGTERM, child exit, and frozen terminal logs. The stronger process owner exposed and fixes two production identity defects: target classification no longer re-adopts already-issued thread IDs, and wait events serialize retained internal identities back to raw wire thread IDs.

Remediation validation: composed process owners 7 pass / 165 expectations (including the real 90-second expiry); Codex workbench module regressions 135 pass / 1306 expectations; production system regressions 8 pass / 118 expectations; targeted repository policies 59 pass / 488 expectations; both TypeScript projects, full lint, formatting, and diff checks pass. The standalone module-scope policy analyzer was also attempted in a 6 GiB scope and was OOM-killed (exit 143); no policy, test, lint, or type rule was weakened. Task remains In Progress and acceptance criteria remain unchecked pending independent rereview.
<!-- SECTION:NOTES:END -->
