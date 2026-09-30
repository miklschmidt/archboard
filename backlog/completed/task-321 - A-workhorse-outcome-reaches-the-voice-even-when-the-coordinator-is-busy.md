---
id: TASK-321
title: The coordinator hears what happens in the workhorse as it happens
status: Done
assignee: []
created_date: '2026-09-23 22:43'
updated_date: '2026-09-24 09:22'
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
- [x] #1 While voice is live, news for the coordinator steers its active turn, or starts a turn when it has none, as soon as it arrives; nothing waits for the coordinator to be idle
- [x] #2 Workhorse news is never added to the coordinator thread without a turn that acts on it
- [x] #3 Every workhorse turn that ends, or waits on the user, while voice is live reaches the coordinator, whether the coordinator or the agent bar started it
- [x] #4 The workhorse can send the coordinator a message through a dynamic tool, its prompt says when to use it, and the message arrives as the first criterion says
- [x] #5 Unit owners prove that news goes to the coordinator as one turn/start at once, whatever the coordinator is doing, and that an agent-bar turn's end reaches it; whether that steers a running turn or starts a new one is Codex's own start_or_steer and has no Archboard owner
- [x] #6 DESIGN.md and the authored-contracts doc describe the delivery; ADR 0019 stands, because steering adds to the running turn and starts no second one
- [x] #7 With no voice session live, no workhorse news goes to the coordinator at all; a later voice session reads the workhorse through inspect_workhorse when it needs to
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decision 2026-09-24: nothing goes to the coordinator outside a voice session. The coordinator and the voice model are one entity, the coordinator acting as the voice model's subconscious; with no voice there is no point in running it.

All three subtasks are done (321.01 immediate turn/start with no injection, 321.02 every linked workhorse turn's end or wait, 321.03 tell_coordinator), each verified by its unit owner and every gate lane. ADR 0019 stands: news uses the one app-server session's turn/start. Criterion 5 is not met as written: no system owner proves steering a busy coordinator versus starting a turn for an idle one. That choice is Codex's own start_or_steer (0.155.1), so a system owner over a fake Codex would mostly simulate upstream; the unit owners prove one turn/start goes out at once whatever the coordinator is doing. Waiting on the user: reword criterion 5 to those unit owners, or prove it once against real Codex in a live voice run.

User decision 2026-09-24: criterion 5 now names the unit owners that exist (codex-workbench-outcome-report.test.ts: one turn/start at once whatever the coordinator is doing; workhorse-news.test.ts: an agent-bar turn's end and a workhorse message reach the coordinator). Both pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The coordinator hears what happens in the workhorse as it happens, and only while voice is live. News goes out at once as one turn/start, which Codex adds to a running coordinator turn or starts one with; nothing is injected into its history. Every linked workhorse turn that ends or waits on the user is news, whoever started it (321.02), and the workhorse can send a message with tell_coordinator (321.03). With no voice session or during a recording nothing is sent. Verified by the outcome report and workhorse news unit owners and every gate lane; DESIGN.md and the authored-contracts doc describe it.
<!-- SECTION:FINAL_SUMMARY:END -->
