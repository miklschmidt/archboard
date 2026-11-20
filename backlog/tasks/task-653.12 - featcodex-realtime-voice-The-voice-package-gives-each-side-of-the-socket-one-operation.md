---
id: TASK-653.12
title: >-
  feat(codex-realtime-voice)!: The voice package gives each side of the socket
  one operation
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-20T00:16:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.11
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 9 of the archboard-deepen run, a breaking npm release of @archboard/codex-realtime-voice. The package is wide (29 names): the socket-owning host assembles server socket factories, routing and ledger extensions, controllers and runtime helpers itself. The package hands each side one operation (createVoiceAgent on the server, createVoiceClient and createSocketConversation in the browser), and the helpers only Archboard uses move to workbench. The landing pull request's title uses feat(codex-realtime-voice)!, with a BREAKING CHANGE footer listing this candidate's own removed and renamed names. The settled design, every decision and its reason: the "Candidate 9, codex-realtime-voice: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-09-voice.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Point 5 of its orchestrator settlement corrects candidate 10's entry: isSpeakingLevel moves to workbench.

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: codex-realtime-voice (packages/codex-realtime-voice), its packing (scripts/pack-codex-realtime-voice.ts, tests/system/process-contracts/voice-package.test.ts), and its callers in packages/workbench, apps/server, apps/web and apps/workbench-example.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on codex-realtime-voice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The package's width is 12: ./server createVoiceAgent, parseTabSessionId, createTextUserInput, additionalContextPolicy and composeRoleInstructions(role, { text, sha256 }); ./browser createVoiceClient and createSocketConversation; ./react VoiceClientProvider, useVoiceClient and useVoiceState; ./schemas createCodexBrowserModel and dynamicApprovalHash({ identity, effect }); ./contract and ./realtime export types only, and ./controllers and ./runtime are gone
- [ ] #2 agent.browser.open(send, route) takes the route at open (browser and tab identities from the upgrade, a chat resolver read on every frame, the checkout for adapters), with close(), drain() and a read-only tab-sessions projection; receive(frame) returns false synchronously for a foreign frame and a Promise for a recognized one; both server socket factories and the four routing and ledger extensions are gone, and the three refusals keep their envelope, wording and order
- [ ] #3 createSocketConversation's attach(socket), called after pane registration, returns the hosted conversation for that socket generation; a superseded attach never publishes; each socket gets a fresh transport, the transport comes before media and media detaches before the transport is disposed; controllers stay keyed on transport identity; openVoiceClient keeps its own ordering across a reconnect
- [ ] #4 The wait graph, timeline projection, isSpeakingLevel and the JSON parse helper move to workbench, and boundedText leaves the package: workbench states the 64-character walkthrough id rule itself, bytes and NUL included, with identical refusals
- [ ] #5 voice-package.test.ts asserts that the installed entries' sorted runtime value names equal a literal list in that file, the three former ./runtime names pass the package-api area test under ./server, and replaceIdentity is gone
- [ ] #6 The landing pull request is titled feat(codex-realtime-voice)!: and carries a BREAKING CHANGE footer listing this candidate's removed and renamed published names; the release version follows whether release PR #133 merged first
- [ ] #7 One ADR records the one-operation-per-side design and why openVoiceClient keeps its own ordering; CONTEXT.md gains no Voice chat term
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. D5 moves to workbench (wait graph, timeline projection, speaking predicate, JSON parse, walkthrough id rule); composeRoleInstructions; ./runtime ./schemas ./realtime fold.
2. Server: agent.connect(socket, route) over a registry kept across generations, three refusals, loopback origin default; bunHandlers over connect; Archboard pane sockets connect per socket; remove attach, factories, ledger, four extensions.
3. Browser: self-connecting client (pagehide/pageshow, approvals bound to their snapshot), createSocketConversation per socket generation, mountVoice panel, useVoiceState(client); Archboard and the example migrate (delegated host migration).
4. README two-file quickstart, migration table, packed-consumer test, ADR 0090, releasing.md, ceiling 62 -> 50.
5. Gates: lanes, pack, check code, quickstart screenshots.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Design amended for standalone usability (owner decision 22): read 'Candidate 9, codex-realtime-voice: AMENDED for standalone usability' in the run's decision log. Four entries, ten names, agent.connect at the core with agent.bunHandlers as a thin Bun adapter, mountVoice panel, one React hook, approvals bound to their snapshot's intent.
<!-- SECTION:NOTES:END -->
