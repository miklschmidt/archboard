---
id: TASK-321.02
title: >-
  A turn started from the agent bar reaches the coordinator when it ends or
  waits on the user
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 23:38'
updated_date: '2026-09-24 00:00'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-321
priority: high
type: feature
ordinal: 558000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second slice of TASK-321: today only work the coordinator handed the workhorse is reported. A turn the user started from the agent bar, even one the voice steered, is never reported.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While voice is live, a workhorse turn the agent bar started reaches the coordinator when it ends or when it waits on the user, the same way the coordinator's own work does
- [x] #2 One owner proves an agent-bar turn's end reaches the coordinator
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The callbacks module takes Codex notifications and turns the linked workhorse thread's own events into workhorse news: a turn that completed, failed or was stopped (turn/completed), and a turn that starts waiting on the user (thread/status/changed gaining waitingOnApproval or waitingOnUserInput). Whoever started the turn, one source, so coordinator delegations are not reported twice.
2. Operation callbacks stop reporting completed, failed and attention (the thread news covers them); outcome_unknown stays.
3. The coordinator gets one plain sentence per piece of news instead of the callback envelope; the port request carries it.
4. A new closed callback kind for workhorse turns, encoded for the ledger; delivered like operation outcomes (voice live only).
5. The generation lifecycle hands notifications to the callbacks module.
6. Unit owners: a completed agent-bar turn reaches the port; another thread or epoch does not; waiting is reported once per wait; no voice records only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Workhorse news comes from the linked workhorse thread's own notifications, in the callbacks module (lib/workhorse-news.ts): turn/completed as completed, failed (with the turn error) or stopped (interrupted), and thread/status/changed gaining waitingOnApproval or waitingOnUserInput as waiting, once per wait. It covers every turn whoever started it, so operation callbacks now report only outcome_unknown. The coordinator is given one plain sentence (workhorseNewsSentence) instead of the callback envelope; the port request carries news, and the envelope stays on the delivery record. New closed callback kind workhorse_turn (contract, normalize, keys, encoding). The generation lifecycle hands every notification to callbacks.onNotification after the operations owner; the callbacks module takes the identity authority to read wire ids. Owners: tests/workhorse-news.test.ts (agent-bar turn ends reach the coordinator as a sentence with no identities; a wait once per wait; another thread, a prior epoch and no voice tell nothing). Gate lanes one at a time all exit 0 (3567 tests, 0 failures).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Any turn on the linked workhorse thread, including one started from the agent bar, reaches the coordinator while voice is live when it finishes, fails, is stopped or starts waiting on the user, as one plain sentence rather than the callback envelope; operation callbacks no longer duplicate it. Verified by the workhorse news unit owner and all gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
