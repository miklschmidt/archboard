---
id: TASK-530.05
title: The voice package names no Archboard concept
status: In Progress
assignee: []
created_date: '2026-10-25T14:17:00Z'
updated_date: '2026-10-25T15:10:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
ordinal: 959000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user found Archboard concepts left in packages/codex-realtime-voice after TASK-530.04: for example the TSDoc of sameLink in src/runtime/services/thread-context/controller.ts speaks of panes. A first count found "pane" on about 400 code lines (the socket contract field paneId included), walkthrough presentation and narration (about 180 code lines: preparePresentation, spokenPresentationFor), board news and board-change delivery, "semantic" change events, the vault, the navigator and the dock, and about 100 references to Archboard ADRs and tasks in the sources. The package is public and MIT for any developer who wants a realtime Codex voice agent, so a reader must not need Archboard to understand its sources, docs, tests or wire contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No source, test, README or wire name of the package uses an Archboard concept (board, vault, pane, walkthrough, narration, navigator, dock, canvas, semantic change) or cites an Archboard ADR or task
- [ ] #2 Archboard and the workbench example keep working through the package's public entries, with their focused tests, types and lint passing
- [ ] #3 The vault boards that bind the renamed code are updated through archboard, and archboard check --code adds no finding
- [ ] #4 A host announces a context change through one generic package operation and names its audience: the workhorse, the voice, the coordinator, or any combination; Archboard's board changes are one adapter of it
- [ ] #5 Every Archboard feature in the package (walkthrough presentation and narration, the navigator's repository listing, board news, vault and board wording in checkout admission and coordinator bindings, and any other found) is a generic host mechanism or leaves the package, with Archboard's behaviour as one adapter of it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Audit (Opus planner, read only): inventory of comments, internal names, public and wire names, and Archboard features (context news, walkthrough presentation, recording, repository listing, vault wording, claims and canvas). Verified at source: the default execution context sends paneId and semantic to Codex (runtime/rules/host/context.ts:40-55), and paneId also keys thread links by tab session (server/services/generation/factories.ts:166-169).
Wave A, sequential, one agent each:
1. S1 context announcements: one agent.announce(change) operation whose audience is any of workhorse, coordinator and voice; workhorse gets quiet inject_items once per (feed, sequence) with own_change and freshness; coordinator gets quiet inject only while voice is live; voice gets quiet text or speech. Archboard's board changes, focus and selection become one adapter in packages/workbench. semantic names become context names; the execution context key semantic becomes brief and paneId leaves it.
2. S2+S3 checkout label (repositoryOfCheckout becomes checkoutLabel) and voice purpose (presentation becomes purpose, recording becomes unattended, one hook).
3. S4+S5 thread-link key (paneId of a link becomes linkKey) and views (pane becomes view and paneId viewId on the wire, client, browser port and copy).
Wave B, parallel by directory: comments, ADR and TASK citations, orphan TSDoc, boundedBoardAction, neutral test fixtures, README.
Reviews: one reviewer per Wave A scope and one for the package and Archboard host contract, each fixing what it finds.
Wave C: proposals TASK-530.05 on Codex realtime voice, Voice coordinator and Codex workhorse drawn to what was built, code check and footprint, adopt.
Then the heavy Blocks budget for Codex realtime voice (TASK-536), bun run check, push, CI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Names chosen by the user (2026-10-25): pane, as one place in the page that shows the conversation, becomes chat and chatId; the walkthrough presentation becomes narrative (VoiceNarrative, realtimeStart.narrative), and the queue's own narratives take another name; recording becomes unattended, one hook; repositoryOfCheckout becomes checkoutLabel and the workhorse entry's repository becomes label. Board news becomes a context change that a host announces with agent.announce to any combination of workhorse, coordinator and voice (the user's requirement).
<!-- SECTION:NOTES:END -->
