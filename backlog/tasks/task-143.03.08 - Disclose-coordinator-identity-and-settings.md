---
id: TASK-143.03.08
title: Disclose coordinator identity and settings
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-03 19:58'
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
- [ ] #1 The read-only disclosure distinguishes loading, confirmed, stale coordinator, unavailable, and fallback when priority is not advertised; it has no saving, refused-save, or outcome_unknown edit state.
- [ ] #2 It displays configured model gpt-5.6-luna, configured reasoning effort medium, effective service tier, approvalPolicy, approvalsReviewer, sandboxPolicy, and activePermissionProfile from authoritative host state.
- [ ] #3 The module exposes no form fields, save control, browser command, settings/update call, or optimistic settings state; unavailable fields name the missing host fact and recovery.
- [ ] #4 Workhorse and coordinator identity, history, and settings are labelled distinctly for visual and screen-reader users and never share a thread-link control.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define one public workbench-coordinator interface that accepts the existing BrowserWorkbenchState and projects immutable coordinator/workhorse disclosure records without commands, mutable settings, or copied protocol shapes.
2. Classify loading, confirmed, stale, unavailable, and confirmed priority-fallback states from transport freshness, coordinator lifecycle, and the authoritative coordinator settings row; preserve missing-fact recovery text and deterministic formatting for approval, reviewer, sandbox, and permission-profile values.
3. Render a flat semantic disclosure using Archboard theme utilities. Give coordinator and linked-workhorse identity, history, and settings separate named regions, keep coordinator history read-only, and expose no form, save, thread-link, or browser-command control.
4. Add focused public-interface tests for the reachable state matrix, authoritative configured/effective values, absent-field recovery, distinct visual/screen-reader labels, and forbidden edit/control markup. Run only the focused owner, both TypeScript configs, exact scoped Oxlint/Oxfmt, boundary/import policy checks, and diff checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one read-only src/ui/workbench-coordinator deep module over BrowserWorkbenchState. Its pure projector consumes the existing browser host projection, requires one authoritative coordinator settings row, derives configured and effective values without a second protocol/settings type, distinguishes loading, confirmed, stale, unavailable, and non-advertised-priority fallback, and gives every missing host fact a recovery. The renderer uses flat semantic-token composition and separate named coordinator identity/history, coordinator settings, and linked-workhorse identity/history/settings regions. It exposes no form, control, link, command, settings mutation, or optimistic state.

Focused validation: coordinator module 5 tests/73 expectations; existing workbench runtime/timeline providers 26 tests/212 expectations; boundary and assistant-ui import policies 20 tests/353 expectations. Root and frontend TypeScript passed. Exact src/ui/workbench-coordinator Oxlint and Oxfmt checks passed. git diff --check passed. No broad module, system, repository, browser, or check lane was run.
<!-- SECTION:NOTES:END -->
