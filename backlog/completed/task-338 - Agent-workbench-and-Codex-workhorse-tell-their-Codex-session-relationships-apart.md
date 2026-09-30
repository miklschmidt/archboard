---
id: TASK-338
title: >-
  Agent workbench and Codex workhorse tell their Codex session relationships
  apart
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:59'
updated_date: '2026-09-24 14:04'
labels:
  - architecture
dependencies: []
priority: medium
type: docs
ordinal: 579000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User review 2026-09-24: on Agent workbench and Codex workhorse most relationships into Codex session ride one line and are hard to pair with their labels. The user's judgement: the board was modelled with the wrong tools. Relationships that differ in mechanism should say so through their configured kind (and so their colour), and through emphasis and traffic, rather than all being calls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each relationship into Codex session on both boards has the kind its mechanism has, and emphasis and traffic where the source justifies them, each with a source line
- [x] #2 Both boards drawn and looked at
- [x] #3 ./bin/dogfood check reports no diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read every relationship into Codex session on Agent workbench and Codex workhorse against the source: which session method each caller's body invokes, and whether session-operations.ts sends it through read() or mutate().
2. Kind by mechanism: a caller whose calls are session mutations (each one JSON-RPC request to the app-server whose failure is reported as not_delivered/outcome_unknown) is rpc; a caller that only reads (thread/list, thread/read) is data; the session's own transport.request per method is rpc as on the Codex session board, and on the spine.
3. Emphasis/traffic: complete the pane-to-child spine (session to transport becomes hero with traffic); leave the rest as authored.
4. One semantic edit per board in place (the boards were wrong), rasterize to $CLAUDE_JOB_DIR/tmp/338, dogfood check, commit the two vault files and this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence (kind decided from src/runtime/codex-session/lib/session-operations.ts, which sends every method through read() or mutate(); a mutation's failure is reported as not_delivered/outcome_unknown, the contract of a remote call):
Agent workbench v13:
- FZnS78FX Codex session -> Codex transport: dependency -> rpc, hero, traffic. session.ts requestDecoded calls transport.request(method, params) for every method, so it is on the pane-to-child spine; rpc matches the Codex session board's 'one request frame'.
- SRifquBt Thread link -> Codex session: call -> data. codex-thread-link thread-lists.ts threadListPage/threadLoadedListPage and classifier.ts threadRead, all read().
- b9HU99hH Workhorse queue -> Codex session: call -> rpc. codex-workhorse-queue/lib/queue.ts queueAdd/Update/Reorder/Delete/Start (mutate; queueListPage is the one read).
- XAd3chIR Voice coordinator -> Codex session: call -> rpc. codex-coordinator/lib/start.ts threadStart, threadSettingsUpdate.
- Qh7VZ9MQ Browser gateway -> Codex session: call -> rpc, hero and traffic kept. server/archboard/lib/codex-workbench-text-actions.ts turnStart/turnSteer (the gateway's BrowserTextActions, built in codex-workbench-browser-gateway.ts).
- TFjDY5zE Realtime voice -> Codex session: call -> rpc. codex-realtime negotiation.ts realtimeStart, adapter.ts realtimeAppendText/AppendSpeech/Stop.
- rOBpux5i Workhorse operations -> Codex session: call -> rpc, hero and traffic kept. direct-delegate.ts turnStart, steer.ts turnSteer.
- biUWQZMB Coordinator callbacks -> Codex session: call -> rpc. deliver.ts deliverThroughCoordinatorTurn -> codex-workbench-outcome-report.ts turnStart; realtime.ts realtimeAppendText.
- 8g1SNngD Board-change delivery -> Codex session: call -> rpc. codex-thread-context/lib/delivery.ts threadInjectItems.
Codex workhorse v5: gPWhZQeZ, zgS5gisx, W87z7uEB (codex-workhorse-start/lib/start.ts threadStart), 8xJt3Mud: call -> rpc, same evidence; emphasis and traffic unchanged.
Emphasis: no muted added; thread discovery and the coordinator's thread start are not per-command but none is the startup/config/teardown context the skill mutes.
Not changed, for the parent: Thread tool calls calls the session (codex-dynamic-tools mutations.ts threadStart/threadFork/turnStart, projection.ts list reads) and neither board draws it. config.yaml relationshipKinds carry no color, so call/rpc/data draw identically (solid, filled).
Verified: both boards rasterized and looked at; ./bin/dogfood check: diagnostics [].
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Relationships into Codex session on Agent workbench (v13) and Codex workhorse (v5) now carry their mechanism's kind: session mutations are rpc, Thread link's thread reads are data, and the session's per-method transport.request is rpc on the hero spine with traffic (was a dotted dependency). Ids kept, edited in place. Verified by rasterizing both boards and ./bin/dogfood check with no diagnostics.
<!-- SECTION:FINAL_SUMMARY:END -->
