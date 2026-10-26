---
id: TASK-530.05
title: The voice package names no Archboard concept
status: Done
assignee: []
created_date: '2026-10-25T14:17:00Z'
updated_date: '2026-10-26T04:40:00Z'
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
- [x] #1 No source, test, README or wire name of the package uses an Archboard concept (board, vault, pane, walkthrough, narration, navigator, dock, canvas, semantic change) or cites an Archboard ADR or task
- [x] #2 Archboard and the workbench example keep working through the package's public entries, with their focused tests, types and lint passing
- [x] #3 The vault boards that bind the renamed code are updated through archboard, and archboard check --code adds no finding
- [x] #4 A host announces a context change through one generic package operation and names its audience: the workhorse, the voice, the coordinator, or any combination; Archboard's board changes are one adapter of it
- [x] #5 Every Archboard feature in the package (walkthrough presentation and narration, the navigator's repository listing, board news, vault and board wording in checkout admission and coordinator bindings, and any other found) is a generic host mechanism or leaves the package, with Archboard's behaviour as one adapter of it
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

Review decisions (host boundary review, 11c2047b7): kept as named changes: the voice details' start brief is now the coordinator's start context (Archboard's catalogue, what Codex is given), where it was the on-screen board's brief that only the page saw; a change told to the coordinator and the voice shows one entry per audience; speech or quiet is chosen when a change is announced, not at delivery (differs only while a news item waits in the voice queue and the narrated board changes); a stale Archboard brief answers withheld instead of stale_event. Fixed: a payload that is not JSON data is refused before anybody is told (bad3a41c9); the withheld detail reaches the page again (in progress).

# TASK-530.05 vault notes

## Footprint

Read with `archboard semantic footprint "<board>" --base 16b323d63 --variant TASK-530.05`. Every commit in 16b323d63..HEAD carries `Refs: TASK-530.05`. On each board, `current` is the proposal's parent (TASK-530).

Codex realtime voice, changed but not named (the board stays true):
- Codex process: fed6aab58 rewrote a comment in process-shutdown.ts that cited TASK-151. No behaviour changed.
- Workhorse queue, Workhorse start: ee1f79f9b renamed the thread-link field paneId to linkKey inside them. The calls and responsibilities are the same.
- Command admission, Command dispatch, Browser message publication: 16334262e renamed pane to chat (chatId) in their parameters and messages. Nothing was rewired.
- Typed message actions: 0d0383ee8 rewrote comments and 16334262e renamed pane to chat. It sends the same turn/start and turn/steer.
- Voice client: 16334262e renamed its paneId option to chatId. f4533fa7d and 5bd6d8bc0 gave its reconnect its own timing key. It is still one socket on the host's path with its tab session.
- Example host: 04d44d393 rewrote its README, 16334262e renamed pane to chat, and d88332725 renamed a test fixture field. It calls createVoiceAgent and createVoiceClient as before.

Codex realtime voice, named but not changed:
- Semantic context: no commit changed semantic-context-publisher.ts. The proposal changes its description and moves it from Workhorses to Per-tab sessions, because 420ad425b removed the publisher of each workhorse from wiring.ts. Each tab session's one publisher is now made and subscribed by archboard-announcements.ts.
- Archboard tab adapter: it is named only through the restated flow "A tab session ends", whose questions now say chat. Its own step is unchanged.

Voice coordinator, changed but not named (the board stays true):
- Tool contract, Workhorse news, Tell coordinator: a185a0ae5 removed Archboard citations from their comments.
- Approvals: ee1f79f9b renamed paneId to linkKey in request.ts.
- Tab sessions: 0d0383ee8 changed comments, 16334262e renamed pane to chat, 420ad425b removed the semantic publisher and delivery components, and d88332725 renamed the workhorse's component to contextDelivery. It still routes each tool call and notification to the tab session that owns its thread.
- Workhorse links: c29be5e3a and 420ad425b reworded the header comment. A context callback is still correlated with the workhorse that voice is bound to.

Voice coordinator, named but not changed:
- Spoken approval: no commit changed spoken-approval/. Its responsibility and two fallback steps said "falls back to the pane", a word the package never used there. The code says the visual approval surface. The proposal says "an answer on the page", so the board uses the package's words.
- Semantic context: no commit changed semantic-context-publisher.ts. Its responsibility changed for the same reason as on Codex realtime voice: the voice start no longer reads a brief from it (d88332725, 420ad425b). Its events reach the coordinator and the voice only through Archboard announcements.
- Board catalogue (added): archboard-context-source.ts predates the task and is unchanged. d88332725 and 420ad425b changed where the realtime adapter reads the voice start's brief. It now reads the host's coordinator context (`coordinatorContext.read()`), not `freshSemanticBrief`. In Archboard, that context is this catalogue source.

Codex workhorse, changed but not named (the board stays true):
- Workhorse start, Workhorse queue, Thread link, Start contract: ee1f79f9b renamed paneId to linkKey.
- Command admission, Command dispatch: 16334262e renamed pane to chat.
- Typed message actions: 0d0383ee8 changed comments, and 16334262e renamed pane to chat.
- Execution context policy: a185a0ae5 removed citations, and d88332725 renamed semantic_injection to context_injection. Same responsibility.

Codex workhorse, named but not changed: none.

## Code check findings

- `archboard check --code --variant TASK-530.05` compared with `archboard check --code`: after the corrections, no `>` line, and 17 `<` lines. The cleared findings are the anchors to `subscribeSettledChange`, `freshSemanticBrief`, `recording`, `createSemanticContextPublisher`, `createDelivery`, and the deleted packages/workbench/src/runtime/services/coordinator-callbacks/deliver.ts. They also include two RELATIONSHIP_UNDRAWN warnings. a7e1f3bf1 and 420ad425b caused them: deliver.ts now uses `canonicalJson` from runtime/rules/host. The proposals now draw that use on Voice coordinator (Callback delivery -> Shared instruction policy) and on Codex workhorse (Coordinator callbacks -> Shared instruction policy).

Archboard (system board), changed but not named (the board stays true). Every part is bound path-wide to a package:
- codex-realtime-voice, workbench, Workbench example: the task changed their internals. The package dependencies that the board draws did not change, and each drawn anchor holds except the one that step 7 below corrects.
- process, codex-app-server, Codex home: fed6aab58 and d4f93c304 only rewrote comments that cited tasks or named Archboard.
- timing: 5bd6d8bc0, f4533fa7d and d88332725 added the voice client's reconnect key and renamed the context delivery keys. The edge "codex-realtime-voice -> timing" still covers them.
- Workspace packages: the container of all of the above.

## Behind (step 7 of the skill)

Read with `archboard check --code` after the three adoptions. The boards that the task's commits put behind:

- Archboard: the anchor of edge xEGElQkc "workbench -> board" named packages/workbench/src/runtime/rules/coordinator-callbacks/encoding.ts#SemanticSubjectKindSchema. 420ad425b deleted that file. The workbench still reads the board's subject kinds in the selected subject of its instruction context. A TASK-530.05 proposal re-cites the edge at packages/workbench/src/runtime/rules/instructions/context.ts#SemanticSubjectKindSchema, and it is adopted (version 90). The comparison showed one `<` line and no `>` line.
- Archboard server, Live panes: "Semantic context input" (semantic-input.ts). 420ad425b changed only how it spells the cursor token. Its responsibility and edges are still right.
- Live panes: "Shared tab sessions" (browser-tabs.ts). 16334262e renamed pane to chat in the package's own words. The part still keeps one tab session for each browser tab. The board describes Archboard's panes, so it keeps "pane".
- Codex session: "Gate protocol operations" (session-operations.ts). fed6aab58 changed one comment from "a board change" to "a host's context change". No behavior changed.
- Browser application: "Workbench transport", "Browser media owner" and "Conversation controllers". 16334262e and b766ec4cc renamed the package's paneId to chatId. Archboard passes its pane id as the chat id (apps/web/src/ui/state/application/workbench-owners.ts:70), so "pane" stays right on this Archboard board. 04f36b5d1 renamed the media owner's start(presentation) to start(narrative). Archboard's voice session still owns its presentation and hands it over as the narrative (packages/workbench/src/ui/state/voice-session/session.ts:226). f4533fa7d and 5bd6d8bc0 moved the transport's reconnect from PANE_MS.socketReconnect to CODEX_REALTIME_MS.clientReconnect. The board does not name that duration. Every anchor holds, so the board needs no proposal.

Findings that predate the task and stay on their boards:
- Archboard: "Workbench example" and "Codex home" reach codex-app-server (application.ts:91, from 884c8c2cd4, and storage.ts:57). The other RELATIONSHIP_UNDRAWN warnings on this board are older too. The task added no import of a new Archboard package, so it added no undrawn relationship there.
- Archboard server routes: "Codex workbench reaches Repository listing" (wiring.ts:248). At the base, the same call was in repositoryOfCheckout, at line 424.
- Live panes: the RELATIONSHIP_UNDRAWN finding on "Semantic board store".
- Browser application: only EXPOSED_UNUSED information. The task changed none of those parts.

cdd4a2bf8, the commit of the other agent, changes no part that these boards bind. It reaches only the path-wide parts of the Archboard board.

Final `archboard check`: exit 0, `configurationValid: true`, `diagnostics: []`.

Closing evidence (2026-10-25): git grep of packages/codex-realtime-voice for archboard, board, vault, pane, walkthrough, narration, navigator, dock, canvas, semantic change, ADR and TASK citations finds only the browser global navigator (browser-environment.ts) and the two unnamed-host.test.ts assertions that the words are absent. voice-package.test.ts installs the packed package outside the repository, type-checks the README's code and finds no Archboard concept in any packed file. archboard check reports no diagnostics after the adoptions, and the code check comparison has no > line. Gate at 5602f1f86: lint, types, contracts and format pass; the voice package 1142 pass, test:system 260 pass, test:repository 153 pass, test:serial-browser passes; test:modules 4973 pass and 4 fail, all Track first-layout timing cases in packages/renderer (4.3 to 9.1 s on a shared machine at high load). The user waived renderer performance gates because the renderer is being rewritten. PR #2 carries the reviewer's walkthrough, recorded on Codex realtime voice and removed again (5a47f709a).

Follow-up fixes (2026-10-26), after the branch was rebased onto the signed upstream main: bee542ed4 checks the payload object the host passed, because the z.record copy left out an own __proto__ key (a case in announce.test.ts fails without it); 294d54ab6 keys browser-tabs.ts by browserId, which every caller passes; 65d4e0100 says the timing package also times the packages Archboard publishes; 2ae2d45fd renames the dynamic-tool context authority's paneId to linkKey (issueAndRevalidateLinkAuthority, executableLinkKeyFor), because it holds a thread link key while an approval binding's paneId is a real pane. Only the authority's token is stored, so no record changes.

Follow-up review (gpt-6.1-sol, xhigh) of bee542ed4 through 2ae2d45fd: Spec found two gaps in the payload check, fixed in c16f06d79: an array subclass passed the class-instance rule, and values that only an array's iterator yields went unchecked. Three regression cases fail without the fix. Standards found the thread-link rename unfinished in four places, fixed in 73434c41f with no change in behaviour. The voice package 1145 pass, the workbench 390 pass, the packed-package test 1 pass; types, lint and format pass. A second review of the rebase onto the signed main found no merge defect; apps/cli 128 pass and the drawing-integrity tests 6 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The voice package names no Archboard concept in its sources, tests, README, wire contract or packed files. Board news became generic context announcements: agent.announce(change) tells any combination of the workhorses of named checkouts, the coordinator and the voice, and answers one receipt per tab session and audience; a malformed change is refused with a TypeError before anybody is told. Archboard's board changes, focus and selection are one adapter of it (packages/workbench/src/server/services/host/archboard-announcements.ts), and its codec keeps the bytes Codex reads unchanged. The user's names replace Archboard's words: chat and chatId, narrative, unattended, checkoutLabel and label, linkKey. The vault boards Codex realtime voice, Voice coordinator, Codex workhorse and Archboard are adopted and check clean. Open: a hand-built payload with an own __proto__ key passes the JSON check; browser-tabs.ts still says client id; Archboard's dynamic-tool authority uses paneId in two meanings.
<!-- SECTION:FINAL_SUMMARY:END -->
