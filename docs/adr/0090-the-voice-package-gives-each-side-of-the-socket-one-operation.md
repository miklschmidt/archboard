---
status: accepted
---

# The voice package gives each side of the socket one operation

Decided for TASK-653.12, candidate 9 of the archboard-deepen run, under owner decision 22: the
published interface of `@archboard/codex-realtime-voice` may change freely when that makes the
standalone package simpler to use. It applies
[ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md) to the package and keeps
[ADR 0019](0019-the-workbench-owns-one-codex-app-server-session.md)'s wire, leases and refusals.

## Context

The package published 29 runtime names over eight entries. A standalone host assembled socket
factories, a lease ledger, routing extensions, controllers and runtime helpers itself, and most
of those names had one caller: Archboard. Archboard reached past the documented host path with
its own socket owner, a replay loop that accepted every pane socket when a Codex generation
installed, and a hand-written copy of the transport and media ports.

## Decision

- **The server has one connection operation.** `agent.connect(socket, route)` registers a socket
  from any WebSocket library on Bun, before Codex is ready and across Codex restarts, and returns
  `receive(frame)` and `close()`. `receive` answers `false` at once for a frame that is not the
  agent's, so one socket can carry the host's own messages, and it owns the three refusals with
  their envelope, wording and order. A `{ request }` route admits a loopback page of the server's
  own origin and the listed `origins`, and closes anything else with 1008 before it registers; a
  route that names its identity is the host's to admit. `agent.bunHandlers({ path })` is a thin
  Bun adapter over `connect`, so the origin rule lives in one place.
- **The browser has a panel, a client and a socket conversation.** `mountVoice(element, url)`
  draws a working panel with native controls, system colors and replaceable English words.
  `createVoiceClient({ url })` connects by itself, always retries, releases its socket and the
  microphone on `pagehide` and opens again on `pageshow`, and binds each approval to the state
  that delivered it, refusing one from before its current socket. `createSocketConversation`
  serves a page that carries the voice frames on its own socket: each attached socket gets a
  fresh transport and fresh controllers, the transport attaches before the media, the media
  detaches before the transport is disposed, and a superseded attach publishes nothing.
- **React is one hook.** `useVoiceState(client, select?)` takes the client; the provider goes.
- **Four entries, ten runtime names.** `./server`, `./browser`, `./react` and `./contract`.
  Archboard-only helpers (the wait graph, the timeline projection, the speaking threshold and the
  JSON parse helper) moved to workbench, which states the 64-character walkthrough id rule itself.
- **`createVoiceClient` keeps its own ordering.** It keeps one transport for the page's life and
  its last server snapshot across a reconnect, while `createSocketConversation` makes a fresh
  transport per socket generation. The two orderings cannot share one keeper without a policy
  flag, so each keeps its own, each tested at its seam.

## Considered and rejected

- **Keeping the owners as public parts (`./controllers`).** Every host would have to learn the
  ordering rules that the package can keep itself.
- **A host-held lease ledger.** Its reason, a source reload that rebuilt the workbench, is gone.
- **A `node:http` adapter.** The server runs on Bun only (the storage reads Bun's TOML parser);
  `connect` serves any WebSocket library on Bun.
- **A headless package without a panel.** A host then writes a page before it hears anything;
  native controls and system colors keep the panel small.
- **Answering an approval with an intent the page passes.** A click from before a reconnect could
  reach the new connection.
