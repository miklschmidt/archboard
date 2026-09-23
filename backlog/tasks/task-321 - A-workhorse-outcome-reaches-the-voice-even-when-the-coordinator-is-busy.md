---
id: TASK-321
title: The coordinator hears what happens in the workhorse as it happens
status: To Do
assignee: []
created_date: '2026-09-23 22:43'
updated_date: '2026-09-23 23:01'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/server/canvas/lib/codex-workbench-outcome-report.ts
  - src/runtime/codex-coordinator-callbacks/lib/deliver.ts
priority: high
type: bug
ordinal: 553000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The coordinator decides what the voice model says ([FINAL]) and what it only knows ([COMMENTARY]), so it must hear what happens in the workhorse when it happens. Today, while voice is live, only work the coordinator itself handed over is reported, and only its end (completed, failed, outcome_unknown) or a wait on the user (attention). The report waits up to COORDINATOR_IDLE_WAIT_MS (10 s) for an idle coordinator and otherwise lands in the coordinator thread through thread/inject_items with no turn, so nothing ever acts on it. A turn the user started from the agent bar is never reported, even when the voice steered it. User direction 2026-09-24: deliver at once, steering the coordinator's active turn or starting one; never add anything silently to its history; report every workhorse turn that ends, whoever started it; and let the workhorse message the coordinator through a dynamic tool its prompt teaches. Board updates made by agents stay out of scope, and progress is not reported automatically (TASK-293).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While voice is live, news for the coordinator steers its active turn, or starts a turn when it has none, as soon as it arrives; nothing waits for the coordinator to be idle
- [ ] #2 Workhorse news is never added to the coordinator thread without a turn that acts on it
- [ ] #3 Every workhorse turn that ends, or waits on the user, while voice is live reaches the coordinator, whether the coordinator or the agent bar started it
- [ ] #4 The workhorse can send the coordinator a message through a dynamic tool, its prompt says when to use it, and the message arrives as the first criterion says
- [ ] #5 System owners prove delivery to a busy coordinator by steering, to an idle one by a new turn, and of an agent-bar turn's end
- [ ] #6 DESIGN.md and the authored-contracts doc describe the delivery; ADR 0019 stands, because steering adds to the running turn and starts no second one
- [ ] #7 With no voice session live, no workhorse news goes to the coordinator at all; a later voice session reads the workhorse through inspect_workhorse when it needs to
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decision 2026-09-24: nothing goes to the coordinator outside a voice session. The coordinator and the voice model are one entity, the coordinator acting as the voice model's subconscious; with no voice there is no point in running it.
<!-- SECTION:NOTES:END -->
