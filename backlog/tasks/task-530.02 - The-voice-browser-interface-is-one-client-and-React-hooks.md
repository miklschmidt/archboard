---
id: TASK-530.02
title: The voice browser interface is one client and React hooks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T04:46:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 940000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A host writes a 272-line client to combine the transport and media owners, and generic browser state (approvals, queue, composer, thread link, voice session, sign-in) lives in Archboard packages/workbench.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A framework-agnostic client owns connection, conversation, approvals and voice state
- [x] #2 React hooks at the react entry expose that client
- [ ] #3 Archboard and the example UI use the client and hooks
- [x] #4 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
createVoiceClient (./browser) owns the socket, tab session id, transport, media owner, one frozen state and the page actions; uncertain delivery stays visible as failure.uncertain. ./react: VoiceClientProvider, useVoiceClient, useVoiceState. The example uses only these; its private client is deleted. The generic thread-link, composer, queue, approval and timeline controllers moved from packages/workbench into the voice package; ./controllers serves a socket-owning host (Archboard) with the transport and media owners, createConversationControllers and the timeline projection. ./contract is the 6 snapshot types a UI renders; ./schemas holds the model schemas and dynamic approval wire rules for the host server. Voice 230 -> 229 names (browser+react 14, contract 6), workbench 152 -> 140. Left: Archboard's panes still compose transport + media + controllers through ./controllers instead of the client (AC #3 open for Archboard).

Merged 9e5844d6a (createVoiceAgent). Ceilings lowered: codex-realtime-voice 158, workbench 138. AC #3 for Archboard stays open by design finding: Archboard's panes are a richer client than VoiceClient (steer vs queue, held drafts, queue reorder, dynamic approvals, decision errors, per-socket transport generations, 14 transport readers). Moving them onto VoiceClient means either growing VoiceClient to the controllers' width or keeping Archboard on ./controllers, which an outside developer building a full UI would also use. Next step if wanted: a host-socket mode in which the client owns the pane socket owner's generations (apps/web clients/pane-session/workbench-socket.ts) and exposes the controllers as client state.

Automatic reconnect added on request of the owner (commit e9af773a3): after a lost socket the client opens a new one at the transport's retryAtMs and retries every PANE_MS.socketReconnect until one opens or it is disposed; a failed first connect is not retried. Tests: voice-client.test.ts 'a lost socket opens again by itself, also after failed attempts' and 'a dispose ends a reconnect that waits, and a first connect that fails is not retried' (both fail without the change).

Browser and example review (review/voice-browser-example): a7df3fab6 fixes two reconnect bugs from e9af773a3: an automatic attempt no longer clears the page's failure (an uncertain delivery cut off by the lost socket stayed visible for only about 3 s before), and the loop stops for good on incompatible_contract instead of reopening a socket every 3 s; tests fail against the old client. 403 and 400 refusals stay retried, because the browser's WebSocket cannot tell them from a server that is down; the loop starts only after a socket was accepted. fe045462a restores Cache-Control: no-store on the example's asset 500 lost in the move to Bun.serve.

Seam review (review/voice-socket-client): a socket the server closes with 1011 before its first snapshot now fails connect with the server's close reason (0832c1b2b, 01c7f73f3); tests/system/server-state/voice-client-socket.test.ts covers that and the reconnect after shutdown, start and server.reload. Merged with the browser review's rule (32a9c0560): an automatic attempt that opens clears only the failure of a connect that did not open. Open: two page views with the same tab session and pane replace each other and each is stale until its next request (Duplicate tab copies sessionStorage); a paneId outside ^[a-zA-Z0-9_-]{1,128}$ fails with advice that cannot help.
<!-- SECTION:NOTES:END -->
