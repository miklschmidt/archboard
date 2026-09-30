---
id: TASK-316
title: 'A workhorse waiting on the user is reported as waiting, not finished'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 21:35'
updated_date: '2026-09-23 21:43'
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
- [x] #1 The coordinator turn for an attention outcome says the workhorse is waiting for the user to answer on the workbench and has not finished; completed, failed and outcome_unknown keep their end-of-work wording
- [x] #2 One owner proves an attention outcome reaches the coordinator report as waiting and the other reported outcomes do not
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The callbacks tell the report port whether the outcome is attention (waiting) or an end.
2. The outcome report words a waiting workhorse as paused until the user answers on the workbench, with no inspect step; the others keep the end-of-work wording.
3. The callbacks test owns the routing (attention reaches the port as waiting); wording stays unlocked per the test policy.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The report port now gets waiting (attention) from the callbacks; outcomeReportPrompt words a waiting workhorse as paused until the user answers on the workbench and drops the inspect step, since inspect_workhorse shows no pending approval. The other outcomes are worded as ended, not "terminal". coordinator-turn.test.ts asserts attention alone arrives as waiting; the prompt wording is not locked (test policy). Checked in Codex 0.155.1 that WaitingOnApproval comes from requests sent to the client, so under auto-review (TASK-314) attention means the user is really asked. bun test for the callbacks and outcome report (38 pass), tsc exit 0, lint exit 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A workhorse that waits on an approval or an answer is reported to the coordinator as waiting, with the work paused until the user answers on the workbench, instead of as a terminal outcome it should inspect. Verified with the callbacks test that routes attention as waiting, the outcome report tests, type-check and lint.
<!-- SECTION:FINAL_SUMMARY:END -->
