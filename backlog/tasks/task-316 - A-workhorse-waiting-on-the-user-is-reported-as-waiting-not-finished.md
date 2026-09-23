---
id: TASK-316
title: 'A workhorse waiting on the user is reported as waiting, not finished'
status: To Do
assignee: []
created_date: '2026-09-23 21:35'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/server/canvas/lib/codex-workbench-outcome-report.ts
  - src/runtime/codex-coordinator-callbacks/lib/deliver.ts
priority: high
type: bug
ordinal: 548000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While voice is live, the host runs the coordinator with each workhorse outcome it counts as terminal, and "attention" (the workhorse waits on an approval or an answer) is in that set. The turn text says the work "reached a terminal outcome" and asks the coordinator to inspect the workhorse to read what was done, while the outcome detail only says "The workhorse is waiting for attention." and inspect_workhorse shows no pending approval. In the 2026-09-23 23:15 session the coordinator told the user "the workhorse finished its pass and stopped without reporting a board change" while it was waiting for approval to run a command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The coordinator turn for an attention outcome says the workhorse is waiting for the user to answer on the workbench and has not finished; completed, failed and outcome_unknown keep their end-of-work wording
- [ ] #2 One owner proves the attention wording differs from the terminal wording
<!-- AC:END -->
