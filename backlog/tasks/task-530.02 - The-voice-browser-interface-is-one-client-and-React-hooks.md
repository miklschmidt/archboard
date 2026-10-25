---
id: TASK-530.02
title: The voice browser interface is one client and React hooks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T02:10:00Z'
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
<!-- SECTION:NOTES:END -->
