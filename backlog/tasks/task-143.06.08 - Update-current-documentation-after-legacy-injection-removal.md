---
id: TASK-143.06.08
title: Update current documentation after legacy injection removal
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.06.05
  - TASK-143.06.06
  - TASK-143.06.07
  - TASK-144.12
  - TASK-144.16
modified_files:
  - AGENTS.md
  - README.md
  - TESTING.md
  - DESIGN.md
  - docs/agents/test-suite.md
  - docs/design/cli-command-audit.json
  - docs/design/stateless-server.md
  - tests/system/repository-policy/legacy-injection-retirement.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update current user/agent/test/architecture documents and command audit to describe owned app-server semantic delivery, while preserving ADR 0005 and measured historical research as history. Serialize AGENTS.md after Tailwind guidance. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Current setup/help/testing docs remove ARCHBOARD_INJECT*, shared-daemon injection commands/routes, and claims that users can arm legacy injection.
- [ ] #2 Current architecture describes exact thread-link semantic delivery, one private stdio session, outcomes, and controlled/real tests; AGENTS.md and test-suite.md are first reconciled to the executable pre-workbench baseline of 19 browser owners.
- [ ] #3 ADR 0005 and historical research remain unchanged or explicitly superseded; links stay valid and no current document advertises a control socket.
- [ ] #4 tests/system/repository-policy/legacy-injection-retirement.test.ts rejects stale control-socket/current-doc claims and count drift; CLI audit, README, TESTING, DESIGN, AGENTS, and executable routes/commands/tests agree.
<!-- AC:END -->
