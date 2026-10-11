---
id: TASK-319
title: The workbench shows what the voice coordinator is doing
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 21:36'
updated_date: '2026-10-11 14:53'
labels:
  - voice
  - coordinator
  - ui
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
priority: medium
type: feature
ordinal: 551000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The workbench shows the workhorse thread only. The coordinator's turns (the handoff it answered, the tools it called, what it delegated or queued, its spoken reply) are invisible, so in the 2026-09-23 23:15 session the user saw board work start in the workhorse with no way to see that the coordinator had started it from the voice model's own words. The shell design (docs/design/operator-canvas-shell.md) puts the coordinator one menu away as session details only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While voice is live, the user can see each coordinator turn: what it was handed, the tools it called, and what it answered
- [ ] #2 Work the coordinator delegated shows where it came from
- [ ] #3 operator-canvas-shell.md describes where the coordinator's work is shown
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A1 contract done: optional coordinatorTimeline on the browser snapshot (version stays 1; refused when its threadId differs from coordinator.threadId or the coordinator is unbound), delegatedBy on BrowserTimelineTurnSchema, BROWSER_SNAPSHOT_DELTA_KEYS and DELTA_PARSERS carry coordinatorTimeline, snapshot-bounds.ts diffs over the shared key list (same 16 keys as the removed SNAPSHOT_KEYS) so a missing key is a type error.

Chunk C (docs, board proposal): operator-canvas-shell.md 'The agent' revised for TASK-319 (the voice coordinator's turns in the one conversation, marked; the delegated line; session details lose the coordinator); workbench and workbench-thread READMEs; ADR 0019 amendment (2026-10-11) on 'visibly separate'. CONTEXT.md unchanged: Voice coordinator is defined, 'delegation' stays an Avoid note. Board proposals, drawn before A2 and B landed: 'Agent workbench@TASK-319' (new Delegations part bound to src/server/archboard/lib/codex-workbench-delegations.ts, Workhorse operations -> Delegations event, Browser gateway -> Delegations call, Browser gateway responsibility restated) and 'Browser application@TASK-319' (Workbench client responsibility restated). Reconcile at closing: the in-flight A2 hands the delegation map to the projection as BrowserProjectionInput.delegations, so the Browser gateway -> Delegations edge may need its direction/anchor fixed once the code is committed; relationships carry no anchors yet because the code did not exist.

A2 server done: second server timeline owner (owners.coordinatorTimeline, budget 64 KiB / 40 turns) read through the new target-keyed readTarget (read() is a wrapper); BrowserProjectionInput.coordinatorTimeline and .delegations; codex-workbench-delegations.ts records workhorse turn -> coordinator turn from delegate_to_workhorse operation events with a turnId (256, oldest dropped), subscribed once in buildProductionTabSession. delegatedBy is emitted only on a recorded turn. Known limit: recording does not itself republish; the next timeline notification of the turn carries the mark.

B UI done: the workbench shows the voice coordinator's turns among the workhorse's (src/ui/workbench-timeline merge by start time, coordinator first on a tie, a null start keeps its place in its own thread; useConversation keeps turns workhorse-only and adds coordinatorTurns, so the dock status, the composer's running state and steering ignore voice turns; messages carry metadata.custom {owner, turnId}; Conversation marks a coordinator turn with the voice rule, a 'Voice coordinator' head and a data-voice-turn scroll anchor; a delegated workhorse prompt carries 'Delegated by the voice coordinator', a button that scrolls the anchored turn into view while it is shown and plain text when it is not). AgentDetails drops the 'voice agent' wording. Checked by fixture screenshots at 1920x1080 in both themes (real AgentPanel, real transport parse of coordinatorTimeline); the server filling the fields is chunk A2, the shell design doc and ADR 0019 are chunk C. AC #1 and #2 stay open until a real voice session shows them.

Review (2026-10-11): the A2 'known limit' is narrower than stated. delegatedBy is joined at projection time from the live record, so any publish after the record carries it, not only a timeline read of that turn. A direct delegate records on 'started' after turn/start answers and the link is re-classified; workhorse publishes in that window show the turn unmarked. The delegate tool's own item/completed on the coordinator thread follows the record (the tool answers only after operations.delegate resolves), and the coordinator timeline owner re-reads and publishes on it, so a turn never finishes unmarked while a pane shows the conversation. A queued delegate records on turn/started, delivered synchronously to operations before any async timeline re-read lands. No republish path was added. Proposals reconciled with what A2 built: Agent workbench@TASK-319 now anchors Workhorse operations -> Delegations (event) at codex-workbench-session-factories.ts recordDelegations, and the old Browser gateway -> Delegations call (the gateway never calls the recorder) is Delegations -> Browser gateway (data) anchored at codex-workbench-owner-projection.ts delegations; check --code --variant TASK-319 adds no finding. The coordinator timeline read is not drawn, as the workhorse timeline read is not. Footprint read against base 08137c31a: Agent workbench names Browser gateway and Delegations as changed; Tab sessions changed by 64f46b5a0 only to hold the record (said in the Delegations description); Realtime voice and Semantic context changed by TASK-293 commits only. Browser application: Application composition (agent-actions runningIn reads workhorse turns) and Workbench transport (one delta parser) changed inside, board stays true. Proposals not adopted: AC1/AC2 wait for a live voice session.
<!-- SECTION:NOTES:END -->
