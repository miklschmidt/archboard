# Standalone Codex workbench

This example runs a Codex conversation and live voice in a localhost browser app.
It is a small host for the public `@archboard/codex-realtime-voice` package. It needs no other server.
The source runs from this repository. This example is not a published package.

The example calls `createVoiceAgent` and serves the page's socket with `agent.bunHandlers`. The package owns command identity, approvals and uncertain delivery outcomes. An uncertain delivery is an action whose result the page cannot know. The example adds no command protocol of its own.

## Prerequisites

Use the Bun and Node versions that the repository's root `package.json` requires.
Install the repository dependencies with `bun install`.
The installation supplies the pinned Codex executable.
Live voice also needs a supported Codex account, a microphone, speakers and browser permission to use the microphone.
Read [TESTING.md](../../TESTING.md) for the repository prerequisites.

## Run it

Build the browser files from the repository root:

```bash
bun run example:workbench:build
```

Start the server with a checkout and a separate private state directory. A checkout is the directory that the workhorse works in.

```bash
bun apps/workbench-example/src/server.ts \
  --checkout /absolute/path/to/your/checkout \
  --state /absolute/path/to/private-workbench-state
```

Open the URL in the `workbench_example_ready` JSON line.
The server binds only to `127.0.0.1` and defaults to port 4317.
Use `--port <number>` to choose another port. Use `--port 0` to ask for a free port.
Press `Ctrl+C` to stop the example and its private Codex process.

## What it does

The checkout is the only directory that the example admits for workhorse conversations.
A workhorse is the Codex thread that does sustained work in the checkout.
The coordinator is the Codex thread that talks by voice and hands sustained work to the workhorse.
Their histories stay separate.
Each browser tab keeps its own tab session id in `sessionStorage`, so a reload keeps the tab's conversation.
A new tab gets a separate conversation.

The state directory holds the private Codex home of the example, its database, its ownership records and the coordinator directory.
Use a state directory that no other app or example process uses.
The example does not use the sign-in or home of your personal Codex client.
When the account needs a sign-in, use the sign-in controls in the browser.
The workhorse runs inside the checkout. It reads the agent instructions and the Codex configuration of that checkout.
The coordinator runs in the state directory.

The browser offers text messages, account controls, approval answers and live voice.
Stop voice ends the voice session. The workhorse continues its work.
Stop work interrupts the current workhorse turn. Voice stays active.
The example can decline requests for broader permission and requests for structured data. It never grants them.
If the browser denies the microphone, allow it in the browser's site settings and select Reconnect.

## Host inputs

The host inputs are the checkout, the state directory, the port, the browser build directory and the Codex executable.
By default, the server serves `dist/workbench-example/index.html`, `app.js` and `app.css` from this repository.
Use `--browser-directory <path>` to serve another build directory that holds those three files.
Use `--codex /absolute/path/to/executable` to give an executable that reports the exact pinned Codex version.
When you leave out this flag, `resolveCodexExecutable` finds the executable that the repository installed.
The server checks the version of the executable before it starts the agent.

The browser reads `GET /api/config` for the label and path of the checkout and for the socket path `/api/workbench`.
The socket URL carries `chatId=main` and the `tabSessionId` of the tab.
The server fixes the checkout of every socket on that path to the admitted checkout.

## Test it

Run the backend process test from the repository root:

```bash
bun test tests/system/server-state/workbench-example.test.ts
```

The test starts the actual example entry against a controlled Codex executable.
It covers text, approvals, separate histories, tab isolation, workhorse completion and independent stop actions.
It also covers SDP, the session description protocol that negotiates voice connections.
The controlled SDP answer proves the negotiation and the lifecycle of the server.
It does not prove microphone capture, audible playback or live model speech.
Those need browser evidence and a live microphone check.
