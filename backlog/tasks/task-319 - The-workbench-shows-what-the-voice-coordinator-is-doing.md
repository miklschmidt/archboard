---
id: TASK-319
title: The workbench shows what the voice coordinator is doing
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 21:36'
updated_date: '2026-10-11 14:34'
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
<!-- SECTION:NOTES:END -->
