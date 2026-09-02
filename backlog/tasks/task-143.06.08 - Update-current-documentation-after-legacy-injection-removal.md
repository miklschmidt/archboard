---
id: TASK-143.06.08
title: Update current documentation after legacy injection removal
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
updated_date: '2026-09-02 02:14'
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
