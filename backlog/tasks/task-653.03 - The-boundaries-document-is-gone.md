---
id: TASK-653.03
title: The boundaries document is gone
status: To Do
assignee: []
created_date: '2026-11-19T16:36:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
ordinal: 1116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided (owner decision 19 in the archboard-deepen run's decision log) that a document describing the code's layout never prevents a refactor, and that docs/agents/boundaries.md should not exist. Its 966 lines restate what the package graph test, the oxlint plugin, the workspace layout test and the architecture vault already hold, and it was cited as a rule that blocked moving workbench's pane routes. Every deepen ticket of TASK-653 would otherwise have to edit it, so it goes first. A rule that only the document holds is either moved to where it is enforced or recorded, or dropped.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/agents/boundaries.md is deleted, and no tracked file outside backlog/ names it: AGENTS.md, the docs under docs/agents, the oxlint plugin's messages, the repository-policy tests and the code comments that cite it
- [ ] #2 Every lint and test failure message that pointed at the document instead says the rule itself, so an agent that hits it knows what to change
- [ ] #3 Each rule the document held that no code, test, lint rule, ADR or vault entry enforces is moved to where it applies or dropped, and the task notes list each one with its outcome
- [ ] #4 bun run check passes
<!-- AC:END -->
