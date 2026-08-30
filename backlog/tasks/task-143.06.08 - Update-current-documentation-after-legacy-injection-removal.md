---
id: TASK-143.06.08
title: Update current documentation after legacy injection removal
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
updated_date: '2026-08-30 16:34'
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
- [ ] #2 Current architecture describes the exact thread-link semantic stream, one private stdio session, delivered/not_delivered/outcome_unknown, and the controlled/real workbench tests.
- [ ] #3 ADR 0005 and historical research/design measurements remain unchanged or explicitly labelled superseded rather than rewritten; links stay valid.
- [ ] #4 CLI audit, test-suite counts, README, TESTING, DESIGN, and AGENTS agree with executable routes/commands/tests and repository enforcement detects future stale current-doc claims.
<!-- AC:END -->
