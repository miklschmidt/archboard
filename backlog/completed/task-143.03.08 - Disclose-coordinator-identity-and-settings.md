---
id: TASK-143.03.08
title: Disclose coordinator identity and settings
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-03 20:20'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.04
  - TASK-143.07.01
  - TASK-144.20
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-coordinator
  - src/shared/codex-browser-model
  - src/server/canvas/lib/codex-workbench-browser-gateway.ts
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render read-only coordinator identity and host-selected configured/effective model, effort, service tier, approval, and sandbox settings without presenting it as the workhorse. This surface has no edit or save command. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The read-only disclosure distinguishes loading, confirmed, stale coordinator, unavailable, and fallback when priority is not advertised; it has no saving, refused-save, or outcome_unknown edit state.
- [x] #2 It displays configured model gpt-5.6-luna, configured reasoning effort medium, effective service tier, approvalPolicy, approvalsReviewer, sandboxPolicy, and activePermissionProfile from authoritative host state.
- [x] #3 The module exposes no form fields, save control, browser command, settings/update call, or optimistic settings state; unavailable fields name the missing host fact and recovery.
- [x] #4 Workhorse and coordinator identity, history, and settings are labelled distinctly for visual and screen-reader users and never share a thread-link control.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define one public workbench-coordinator interface that accepts the existing BrowserWorkbenchState and projects immutable coordinator/workhorse disclosure records without commands, mutable settings, or copied protocol shapes.
2. Classify loading, confirmed, stale, unavailable, and confirmed priority-fallback states from transport freshness, coordinator lifecycle, and the authoritative coordinator settings row; preserve missing-fact recovery text and deterministic formatting for approval, reviewer, sandbox, and permission-profile values.
3. Render a flat semantic disclosure using Archboard theme utilities. Give coordinator and linked-workhorse identity, history, and settings separate named regions, keep coordinator history read-only, and expose no form, save, thread-link, or browser-command control.
4. Add focused public-interface tests for the reachable state matrix, authoritative configured/effective values, absent-field recovery, distinct visual/screen-reader labels, and forbidden edit/control markup. Run only the focused owner, both TypeScript configs, exact scoped Oxlint/Oxfmt, boundary/import policy checks, and diff checks.

5. Remediation: extend the existing BrowserCoordinator host projection with configuredModel and configuredEffort sourced directly from CoordinatorSnapshot.configured, while retaining model, effort, and serviceTier as effective facts and deriving all UI types from the browser schema.
6. Consume configured and effective fields separately, make coordinator history explicitly unavailable until the host publishes it, and classify snapshotless reconnect as unavailable while retained reconnect data remains stale; keep starting recovery specific to the settings handshake.
7. Delete the private-source spelling assertion. Add only public state-matrix cases for snapshotless reconnect and starting-without-settings, plus an assertion in the existing single-host production projection owner for configured/effective values.
8. Run focused red/green coordinator and host-projection owners, both TypeScript configs, exact scoped lint/format, relevant boundary/import owners, and diff checks; commit the remediation separately and leave the task In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one strictly read-only src/ui/workbench-coordinator deep module over BrowserWorkbenchState. The browser coordinator projection now carries required nullable configuredModel and configuredEffort fields sourced directly from CoordinatorSnapshot.configured. Its existing model, effort, and serviceTier fields remain effective host facts. The UI consumes those distinct fields and uses the coordinator settings row only for approvalPolicy, approvalsReviewer, sandboxPolicy, and activePermissionProfile, without a second settings type.

The projector distinguishes loading, confirmed, stale retained data, snapshotless unavailable, and non-advertised-priority fallback. Starting snapshots retain configured model and effort while unavailable settings fields use the settings-handshake recovery. Snapshotless reconnect waits for a fresh snapshot. Coordinator history remains unavailable with a named missing host fact and separate-task recovery because the browser host publishes no coordinator timeline. The renderer keeps coordinator identity/history, coordinator settings, and linked-workhorse identity/history/settings in separate named regions. It exposes no form, control, link, command, settings mutation, or optimistic state.

Review remediation removed the private-source spelling test. Public export and SSR output tests retain the stable evidence for the two-function interface, distinct semantics, and absence of form/link controls.

Red evidence: the coordinator owner failed configured/effective separation and starting recovery; the single-host production owner failed because configured fields were absent. Green evidence: final coordinator plus production projection run passed 6 tests/108 expectations; browser model and transport contract owners passed 28/423; runtime/timeline providers passed 26/212; live canvas socket plus production composition passed 2/51; server gateway module passed 41/208; boundary/import policy passed 20/353. Both TypeScript configs, exact changed-file Oxlint/Oxfmt, and diff checks passed. No browser or broad repository/check lane ran.

Canonical integration replayed the two REVIEW_CLEAN source commits without changing their patch content. Focused serial validation passed 75 tests and 772 assertions across coordinator SSR/projection, browser-model, gateway/socket, transport/runtime, production host projection, and import-boundary owners. Both TypeScript configs passed. Oxlint and Oxfmt passed on the 19 changed TypeScript paths. Exact range checks passed: range-diff matched both replayed commits, changed paths matched the source range, and diff --check was clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integrated the read-only coordinator disclosure and authority separation. Verified focused public and production owners, both TypeScript configs, scoped lint/format, and exact replay-range checks.
<!-- SECTION:FINAL_SUMMARY:END -->
