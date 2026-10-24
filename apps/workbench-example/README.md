# Standalone Codex workbench

This example runs a Codex conversation and live voice in a localhost browser app.
It uses the public `@archboard/agent-workbench` and Codex SDK interfaces.
It needs no Archboard server, board, or vault.
The source runs from this repository. This example is not a published package.

Use the Bun and Node versions required by the repository's root `package.json`.
Install the repository dependencies with `bun install`.
The installation supplies the pinned Codex executable.
Live voice also needs a supported Codex account, a browser microphone permission, a microphone, and speakers.
Read [TESTING.md](../../TESTING.md) for the repository prerequisites.

From the repository root, build the browser files:

```bash
bun run example:workbench:build
```

Start the server with a checkout and a separate private state directory:

```bash
bun apps/workbench-example/src/server.ts \
  --checkout /absolute/path/to/your/checkout \
  --state /absolute/path/to/private-workbench-state
```

Open the URL in the `workbench_example_ready` JSON line.
The server binds only to `127.0.0.1` and defaults to port 4317.
Use `--port <number>` to choose another port, or `--port 0` to request an available port.
Use `Ctrl+C` to stop the example and its private Codex process.

The checkout is the only directory that the host admits for workhorse conversations.
A workhorse is the agent that performs sustained work.
The coordinator manages voice and gives sustained work to the workhorse.
Their histories remain separate.
Each browser tab keeps its own conversation identity in `sessionStorage`, so a reload retains the tab's conversation.
A new tab gets a separate conversation.

The state directory holds the example's private Codex home, database, ownership records, and coordinator directory.
Use a state directory that no other app or example process uses.
The example does not use the sign-in or home of your personal Codex client or an Archboard server.
Sign in through the browser controls when the account needs authentication.
The workhorse runs inside the admitted checkout and reads that checkout's agent instructions and Codex configuration.
The coordinator runs in the private state directory.

The browser offers text messages, a new conversation, account controls, approval responses, and live voice.
Stop voice ends the voice session while the workhorse continues its work.
Stop work interrupts the current workhorse while voice stays active.
The shared workbench owns command identity, approvals, and uncertain delivery outcomes.
The example forwards its browser requests to that same implementation.

The host inputs are the checkout, state directory, listener port, browser build directory, and Codex executable.
By default, the server serves `dist/workbench-example/index.html`, `app.js`, and `app.css` from this repository.
Use `--browser-directory <path>` to supply another build directory with those three files.
Use `--codex /absolute/path/to/executable` to supply an executable that reports the exact pinned Codex version.
The SDK resolves the repository's installed executable when this flag is absent.
The server makes sure that the executable reports the required version before it starts the workbench.

The browser reads `GET /api/config` for the checkout label, path, and `/api/workbench` socket path.
The WebSocket URL carries `paneId=main` and the tab's `tabSessionId`.
The server pins the socket registration to its admitted checkout and forwards the exact socket identity to the shared factory.
Browser requests use the core workbench envelopes without an application-specific command protocol.

Run the backend process proof from the repository root:

```bash
bun test tests/system/server-state/workbench-example.test.ts
```

This proof starts the actual example entry against the existing controlled Codex executable.
It exercises text, approvals, separate histories, tab isolation, workhorse completion, and independent stop actions.
It also exercises SDP, the session description protocol that negotiates voice connections.
The controlled SDP answer proves server negotiation and lifecycle behavior.
It does not prove microphone capture, audible playback, or live model speech.
Those behaviors require browser evidence and a live microphone acceptance.
