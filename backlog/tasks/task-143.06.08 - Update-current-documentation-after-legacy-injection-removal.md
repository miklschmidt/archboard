---
id: TASK-143.06.08
title: Update current documentation after legacy injection removal
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-03 10:43'
labels: []
dependencies:
  - TASK-143.06.03
  - TASK-143.06.07
  - TASK-143.08.04
  - TASK-143.08.06.05
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
  - docs/design/codex-workbench-delivery-map.md
modified_files:
  - AGENTS.md
  - README.md
  - TESTING.md
  - DESIGN.md
  - docs/agents/test-suite.md
  - docs/design/stateless-server.md
  - tests/system/repository-policy/legacy-injection-retirement.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update current user, agent, test, and architecture documents only after the remaining legacy cleanup, recovered Codex lifecycle, and browser-independent board workflow are complete. Describe the final owned app-server semantic delivery and `archboard browser` boundary once, while preserving ADR 0005 and measured historical research as history. This is the sole final current-documentation owner before recovery reconciliation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Current setup, help, and testing docs remove ARCHBOARD_INJECT*, shared-daemon injection commands and routes, and claims that users can arm legacy injection.
- [ ] #2 Current architecture describes exact thread-link semantic delivery, one private stdio session, outcomes, controlled and real tests, and the executable browser-owner inventory reported by the repository at execution time; TESTING.md says Archboard owns dedicated CODEX_HOME, CODEX_SQLITE_HOME, config, and app-server state rather than user-global configuration, with coordinator voice separate from the linked workhorse.
- [ ] #3 DESIGN.md permits spoken approval only from one matching final user item after the effect prompt and never from an assistant transcript; ADR 0005 and historical research remain unchanged or explicitly superseded, links stay valid, and no current document advertises a control socket.
- [ ] #4 tests/system/repository-policy/legacy-injection-retirement.test.ts rejects retired user-global, shared-thread, assistant-transcript, control-socket, and stale current-doc claims; any browser-owner agreement is derived from the executable inventory rather than an unexplained historical count; CLI audit, README, TESTING, DESIGN, AGENTS, executable routes, commands, and tests agree.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile AGENTS.md, README.md, TESTING.md, and DESIGN.md with the integrated owned-session contract: dedicated CODEX_HOME/CODEX_SQLITE_HOME/config/epoch state, explicit pane-to-workhorse links, distinct coordinator voice, one-shot thread/inject_items delivery, and delivered/not_delivered/outcome_unknown handling.
2. Replace literal browser-owner counts and duplicated owner lists in AGENTS.md and docs/agents/test-suite.md with BROWSER_TEST_PATHS-derived commands and language; keep browser-free board work separate from explicit archboard browser control.
3. Rename the existing legacy-removal repository policy owner to the task's retirement owner and extend it with cheap structured/static checks for retired setup/routes/imports, user-global configuration, assistant-transcript authority, private-session/current-doc markers, CLI audit agreement, and executable inventory derivation.
4. Preserve ADR 0005 and docs/design/stateless-server.md byte-for-byte, run only the renamed repository-policy owner plus scoped format/link/diff checks, record exact evidence, and commit the scoped implementation without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the current-document reconciliation against fixed base ff889201a306f0b819c668ea350761c3d9b9885a. AGENTS.md, README.md, TESTING.md, and DESIGN.md now describe one private package-local stdio child with dedicated CODEX_HOME, CODEX_SQLITE_HOME, strict config, epoch/app-server state, explicit pane-to-workhorse links, separate coordinator voice, one thread/inject_items developer-message attempt, and delivered/not_delivered/outcome_unknown handling. TESTING.md no longer directs users to edit user-global Codex configuration. DESIGN.md now arms spoken approval only from the next matching final user item after the effect prompt and excludes assistant output, provisional/pre-prompt input, duplicates, and stale sessions. Browser-free board work remains the main path; explicit archboard browser commands alone inspect or control a live session.

Replaced literal browser-owner counts and the duplicated command list with BROWSER_TEST_PATHS-derived guidance. Renamed the existing removal policy owner to tests/system/repository-policy/legacy-injection-retirement.test.ts and extended the same cheap static owner; no new owner, subprocess test, browser test, timing test, or rule exception was added. The owner checks retired CLI/runtime files, production imports/routes, CLI audit absence, current docs, user-global setup, spoken authority, and count-free executable inventory.

Final capped evidence: the exact policy owner passed 4/4 tests and 59 expectations in 0.046s, reporting 18 owners from BROWSER_TEST_PATHS at execution. It used one Bun test process under one timeout supervisor and started zero product/server/app-server/browser processes. Pinned Oxfmt checked 6 scoped files in 0.268s using one formatter process under one timeout supervisor and 24 worker threads. A Bun static link check resolved local links in 5 current documents in 0.009s using one process under one timeout supervisor. git diff --check passed. ADR 0005 and docs/design/stateless-server.md remain byte-identical to the fixed base. Root typecheck, full repository/system/browser lanes, servers, and browsers were not run, as required. The requested writing-for-agents skill was unavailable in this checkout; repository agent-document rules and the mandatory unslop skill were applied directly.
<!-- SECTION:NOTES:END -->
