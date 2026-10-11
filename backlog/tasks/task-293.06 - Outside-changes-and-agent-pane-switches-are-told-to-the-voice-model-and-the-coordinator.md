---
id: TASK-293.06
title: >-
  Outside changes and agent pane switches are told to the voice model and the
  coordinator
status: Done
assignee:
  - '@claude'
created_date: '2026-09-21 02:09'
updated_date: '2026-10-11 14:41'
labels:
  - voice
  - coordinator
dependencies:
  - TASK-293.03
  - TASK-293.05
parent_task_id: TASK-293
priority: medium
ordinal: 513000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent that is neither the workhorse nor the coordinator (another harness with its own thread, or a bare command line) can write a board or switch a pane with browser show while voice is live. Neither model asked for it, and once the voice model holds a state ("the user is looking at payments") such a change makes that state false. Every write already states its session (change.by, a thread id, null when nobody said), the evidence ownSessionReason uses to spare the workhorse its own writes. Rule: by equal to the linked workhorse thread or the coordinator thread tells nobody, because their outcome arrives through the TASK-291 coordinator turn; any other by, unattributed included, on a board some pane of this canvas shows, is one quiet sentence per write to the voice model and into the coordinator thread without starting a turn, for example "Board payments was just changed by another agent, which says it is adding the retry queue (data)". A write is already one whole thing somebody asked for, so nothing is coalesced. An agent switching a pane is told the same way, worded so it never credits the user: "The pane that showed payments now shows ledger; an agent put it there (data)". During an active narration both are speech: the model says the picture or the board changed under the talk and asks how to go on. The coordinator has no tool that writes a board or switches one, so telling it cannot loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board write whose stated session is the linked workhorse or the coordinator reaches neither model; any other write to a board a pane shows reaches both as one sentence, quiet, with no coordinator turn started
- [x] #2 A write to a board no pane shows tells nobody
- [x] #3 browser show by an agent is told to both models in words that do not credit the user, and its recorded reason stays agent
- [x] #4 During an active narration an outside change to the narrated board and an agent pane switch are speech
- [x] #5 A system owner proves the attribution rule with two stated sessions and one unattributed write, and docs/design/codex-workbench-authored-contracts.md (with CONTEXT.md) describes outside changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pane news carries who did it (the user, or an agent outside this session) and, for an outside write, the board it changed. A settled change whose stated session is neither the linked workhorse nor the coordinator (own writes are already refused at enqueue as own_change), unattributed included, is news: one sentence naming the board and what the writer said it was doing. Never coalesced.
2. Delivery of agent news: told only while a pane of this tab shows the board (canvas read at delivery; otherwise recorded not_shown); injected into the coordinator thread as one developer message through thread/inject_items, which starts no turn; appended to the voice quietly, or as speech during a narration of that board. Recorded reason stays agent.
3. An agent's browser show: the CLI states it is an agent's show and may state --as-session; the show route publishes the pane's focus with the board it showed before and the stated session; a session's own show tells nobody; another agent's is news worded so it never credits the user, quiet or speech during any narration.
4. Narration prompt: a line that another agent changed the board or moved a pane is a reason to stop and ask how to go on.
5. Owners: callbacks module (speech during narration, not shown, coordinator injection, agent switch, never coalesced); a system owner with the fake Codex: two stated sessions and one unattributed write, a write to an unshown board, and an agent show.
6. Docs: authored contracts and CONTEXT.md describe outside changes (DESIGN.md is the visual design document; reword AC5 to name the contracts document).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 built. AC5 named DESIGN.md, which is the visual design document; the rule as built is in docs/design/codex-workbench-authored-contracts.md (Coordinator callback bytes) and CONTEXT.md (Outside change), so AC5 was reworded through the CLI to name them.
How it works: a settled write is news unless its stated session (change.by) is the linked workhorse or the coordinator (refused at enqueue as own_change, as before). A write to a board no pane of the tab shows when it lands is refused at enqueue as not_shown (decided on arrival: a pane that turns to the board afterwards reads it as it now is; deciding at delivery raced the show in codex-pane-context). The sentence names the board and the writer's doing line and says another agent did it. browser show now posts agent: true and accepts --as-session; the show route publishes the pane's focus with {from, by}, which the publisher carries as PaneFocusEvent.agentSwitch (never in the brief); the page's own shows name no agent and stay the pane's to mark. Agent news goes to the coordinator thread as one thread/inject_items developer message (no turn) and then to the voice quietly, or as speech during a narration (any narration for a show, a narration of the written board for a write). The record is the voice append's, reason agent. Outside news never coalesces. The narration prompt now covers these lines (finish the sentence, say the picture changed under the talk, ask how to go on); the voice prompt names them among quiet lines. Canvas read: server canvasFor(tab) in tab-canvas.ts (boards by aggregate key, narrated board).
Evidence: tests/system/server-state/codex-outside-change.test.ts (fake Codex, live voice): writes stated as the workhorse and as the coordinator and one to an unshown board reach nobody; an unattributed write reaches the voice as one appendText and the coordinator thread as one inject_items, no turn/start; the workhorse's own show tells nobody and an unattributed agent show reaches both, never saying user. It fails with outside writes made silent again; passed 3 of 3 runs with codex-pane-context, codex-workbench-production, codex-workbench-application, walkthrough-recording-start and the realtime process contract. Module owner src/runtime/codex-coordinator-callbacks/tests/outside-news.test.ts: another agent's stated session, unshown board, two queued writes stay two sentences, agent show recorded reason agent, own show own_change, narration case (write to the narrated board and an agent show are speech, a write to another shown board quiet, coordinator always injected).
Open for the user to decide: the reviewed workhorse and coordinator instructions ask for --as-session only on commands that write a board, so the workhorse's or coordinator's own browser show is told to both as an agent's switch until those instructions also ask for it on browser show; changing them changes their reviewed digests, so it is left to the user.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Outside changes and agent pane switches are told to both models. A write whose stated session is neither this tab's workhorse nor its coordinator (unattributed included), to a board a pane of the tab shows when it lands, and an agent's browser show (which now states it is an agent's and accepts --as-session) become one sentence: injected into the coordinator thread through thread/inject_items (no turn) and appended to the voice quietly, or as speech during a narration. The session's own writes and shows, and writes to unshown boards, tell nobody; outside news never coalesces; the record's reason stays agent. Verified by tests/system/server-state/codex-outside-change.test.ts (two stated sessions, an unattributed write, an unshown board, own and outside shows; fails with outside writes silenced; 3/3 runs) and src/runtime/codex-coordinator-callbacks/tests/outside-news.test.ts (incl. the narration case). Documented in docs/design/codex-workbench-authored-contracts.md and CONTEXT.md. Follow-up for the user: the reviewed instructions ask for --as-session only on writes, so the session's own browser show is told as an agent's until they ask for it there too.
<!-- SECTION:FINAL_SUMMARY:END -->
