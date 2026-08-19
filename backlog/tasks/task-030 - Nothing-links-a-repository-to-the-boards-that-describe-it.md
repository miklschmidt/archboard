---
id: TASK-030
title: Nothing links a repository to the boards that describe it
status: To Do
assignee: []
created_date: '2026-08-19 22:56'
updated_date: '2026-08-19 22:56'
labels:
  - needs-triage
dependencies: []
ordinal: 30000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent standing in a repo can find which boards describe it, without being told
- [ ] #2 Works when a board spans several repositories
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:56
---
Surfaced while writing INSTALL.md. The skill tells an agent archboard exists; nothing tells it which board covers the repo it is standing in. The guide's workaround is a line in the repo's own CLAUDE.md, which works and is manual.

There is a better answer available for free: nodes already carry a binding with a repo identity, so 'which boards have nodes bound to this repo' is answerable from data archboard already stores. That also handles the case a naming convention cannot, where one system board spans five repos and belongs to none of them.

Worth doing after the current queue. It is the last thing standing between an agent opening a strange repo and finding its architecture without a human in the loop.
---
<!-- COMMENTS:END -->
