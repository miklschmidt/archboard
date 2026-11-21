# @archboard/codex-realtime-voice

This package adds a realtime Codex voice agent to your own Bun project. A person talks to a voice coordinator in a browser page. The coordinator answers short questions itself. It hands sustained work to workhorses. A workhorse is a Codex thread that works in one checkout, which is a directory of code that your server admits.

The package runs one private Codex app-server process, which is the process that hosts the Codex threads. It keeps the history of each conversation. It relays approvals to the page. It also tells the page when it cannot know whether an action arrived. The package is for developers who want voice-driven Codex work inside their own tool, with their own page, on their own machine. [Concepts](#concepts) defines the terms that this page uses.

## Requirements

- Bun 1.4.4 or newer. The server runs on Bun only.
- The `@openai/codex` package at exactly version 0.166.0. The package refuses every other version.
- Node.js on `PATH`, because `@openai/codex` starts Codex with a Node.js script. A server that you start with `bun run <script>` needs no Node.js: `bun run` puts its own `node` on `PATH`.
- Linux or macOS.
- A Codex account that supports realtime voice. The person signs in from the page.
- For voice: a browser with a microphone and speakers. Browsers give microphone access only to pages on `https` or on a local address such as `127.0.0.1`.
- For the React entry: React 19.2.8 or a newer React 19.
- For TypeScript: `@types/bun`.

## Install

```bash
bun add @archboard/codex-realtime-voice @openai/codex@0.166.0
bun add -d @types/bun
```

`@openai/codex` is a peer dependency, so you install it yourself. `react` is an optional peer dependency: install `react` and `react-dom` only for `@archboard/codex-realtime-voice/react`. `@types/bun` is an optional peer dependency too, for type checking.

## Quickstart

The quickstart is two files in the root of your project: a server and a page. The workhorse works in the directory where you start the server.

`server.ts` starts the agent and a `Bun.serve` server that serves the page and the agent's socket on `/voice`:

<!-- checked: server.ts -->

```ts
import { homedir } from "node:os";
import path from "node:path";
import { createVoiceAgent } from "@archboard/codex-realtime-voice/server";

const page = await Bun.build({ entrypoints: [path.join(import.meta.dir, "page.ts")] });
const script = await page.outputs[0]?.text();
const html = `<!doctype html><meta name="color-scheme" content="light dark"><title>Voice</title><main></main><script type="module" src="/page.js"></script>`;

const agent = createVoiceAgent({
	directory: path.join(homedir(), ".voice-agent"),
	checkouts: [process.cwd()],
});
await agent.start();

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 4100,
	routes: {
		"/": new Response(html, { headers: { "Content-Type": "text/html" } }),
		"/page.js": new Response(script, { headers: { "Content-Type": "text/javascript" } }),
	},
	...agent.bunHandlers({ path: "/voice" }),
});
console.log(`Open ${server.url}`);

process.once("SIGINT", async () => {
	await agent.shutdown();
	await server.stop();
});
```

`page.ts` draws a working voice panel in the page's `<main>`:

<!-- checked: page.ts -->

```ts
import { mountVoice } from "@archboard/codex-realtime-voice/browser";

mountVoice(document.querySelector("main"), "/voice");
```

Start the server from the directory that the workhorse works in:

```bash
bun server.ts
```

Then do these steps:

1. Open `http://127.0.0.1:4100`.
2. Select "Sign in with ChatGPT", then "Continue sign-in", and finish the sign-in in that browser. Select "I signed in" when the panel still asks for the sign-in.
3. Type a message to Codex and select "Send".
4. Select "Start voice", allow the microphone, and talk to the coordinator.
5. Press `Ctrl+C` in the terminal to stop the server and its Codex process.

The panel uses the browser's own controls and the system's light and dark colors. It connects by itself, opens its socket again after the server restarts, and releases the socket and the microphone while the page is hidden. It answers command approvals; a page that answers every approval kind uses the client below.

## Your own page

`mountVoice` is a panel over the client that `createVoiceClient` makes. A page that draws its own conversation uses the client directly, with any framework or none:

<!-- checked: plain.ts -->

```ts
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";

const client = createVoiceClient({ url: "/voice" });
const status = document.createElement("output");
const talk = document.createElement("button");
talk.textContent = "Start voice";
talk.addEventListener("click", () => void client.startVoice());
document.body.append(status, talk);

client.subscribe(() => {
	const state = client.snapshot();
	status.textContent = `${state.connection}, voice ${state.voice.phase}`;
	talk.disabled = !state.voice.available;
});
```

`subscribe` calls the listener after each change, and `snapshot()` returns the current state. Each state is a new frozen object.

A React page reads the same client with `useVoiceState(client)`, whole or through a selector:

<!-- checked: react-page.tsx -->

```tsx
import { createRoot } from "react-dom/client";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { useVoiceState } from "@archboard/codex-realtime-voice/react";

const client = createVoiceClient({ url: "/voice" });

function App() {
	const state = useVoiceState(client);
	if (state.server?.account.state !== "ready")
		return <button onClick={() => void client.signIn()}>Sign in with ChatGPT</button>;
	const pending = state.server.approvals.filter(
		(approval) => approval.lifecycle.state === "pending",
	);
	return (
		<main>
			<p role="status">Voice: {state.voice.phase}</p>
			<button disabled={!state.voice.available} onClick={() => void client.startVoice()}>
				Start voice
			</button>
			<button onClick={() => void client.stopVoice()}>Stop voice</button>
			{pending.map((approval) =>
				approval.approvalKind === "command_execution" ? (
					<p key={String(approval.requestId)}>
						<code>{approval.command}</code>
						<button
							onClick={() =>
								void client.answerApproval(approval, {
									approvalKind: "command_execution",
									decision: "accept",
								})
							}
						>
							Run
						</button>
					</p>
				) : null,
			)}
		</main>
	);
}

createRoot(document.body).render(<App />);
```

For `.tsx` pages, your `tsconfig.json` needs `"jsx": "react-jsx"`, the `DOM` library and the `bun` types.

## Concepts

The coordinator is the Codex thread that the person talks to. It speaks through the realtime voice model, answers short questions, uses ordinary Codex tools for quick looks, and decides what the voice says. It does not do sustained work. It runs in its own directory inside the state directory, and that directory is not a checkout.

A workhorse is the Codex thread that does sustained work in one checkout. The coordinator gives it work with its own tools: it delegates, inspects, steers, queues and stops. A workhorse keeps its own history and never sees the coordinator's history. A text message from the page goes straight to the workhorse of the page's checkout.

An admitted checkout is a directory that your server lets a workhorse work in. You list the checkouts, or give a function that admits a checkout by name. Each workhorse reads the repository instructions and the Codex configuration of its checkout.

A tab session is one browser tab's conversation: one coordinator, and one workhorse for each checkout that the tab works in. The browser client keeps the tab session id in `sessionStorage`, so a reload keeps the conversation and another tab gets its own. When 60 seconds pass after the last chat of a tab closes, the tab session ends. The package then settles its open approvals, stops its voice and lets Codex unload its threads. A tab that comes back after that starts a new conversation.

A chat is one place in your page that shows the conversation, such as a panel. A chat id names it. Each chat has one socket. A chat that connects again replaces its earlier socket. All chats of a tab show the same conversation.

An approval is a request from Codex that the person must answer, such as running a command. The page receives each open approval in the server state and answers it with `answerApproval(approval, response)`. The client binds each approval to the state that delivered it: the server refuses an answer to a conversation that changed since, and the client itself refuses an approval from before its current socket.

A spoken approval is an answer given aloud. Only a command approval that offers exactly "accept" or "decline" and grants nothing broader can be answered by voice. The coordinator classifies what the person said and settles the approval once through its own tool. When the words are unclear, the approval stays on the page for the person to answer there.

An uncertain delivery is an action whose result the client cannot know, for example because the socket closed before the server answered. The client then publishes a failure with `uncertain: true` and does not try the action again, because a second try can do the work twice. Refresh the state and look before you act again. The coordinator and the workhorse follow the same rule for their own tools, and the coordinator tells the person what is uncertain.

The state directory is the directory that you give as `directory`. It holds the private Codex home (`codex-home`, the `CODEX_HOME` of the Codex process), the Codex database (`sqlite-home`) and the process-owner records (`owner`). The sign-in of the agent lives in this Codex home, not in the Codex home of your own Codex client. One running server owns one state directory.

## Configuration

### `createVoiceAgent(options)`

`createVoiceAgent` creates the agent and starts nothing. It throws when a listed checkout is not a readable directory, when an origin or an `identity` value has the wrong shape, or when an instruction is empty. Without `codex.executablePath`, it also finds the installed Codex and proves it: an absolute, regular, executable file that reports exactly `codex-cli 0.166.0`, never looked up on `PATH`. When the proof fails, it throws a `CodexExecutableError` with a `code`. Each `start()` proves the executable again, a given `executablePath` included.

| Field                      | Default                                      | What it does                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directory`                | Required                                     | The state directory. The package creates it with mode `0700`. An existing directory must have mode `0700`, belong to you, and not be a symbolic link. A link above it that you or root own, in directories no other user can change, such as `/tmp` on macOS, is resolved once. Keep it outside every checkout: a workhorse writes in its checkout. |
| `ownerDirectory`           | `<directory>/owner`                          | Where the process-owner lock and records live.                                                                                                                                                                                                                                                                                                      |
| `checkouts`                | Required                                     | The admitted checkouts: a list of directories, or a function that returns the admitted path for a named checkout and `null` for a refused one. The package resolves each to its real path.                                                                                                                                                          |
| `origins`                  | None                                         | More page origins that may open the agent's sockets, each exactly, such as `https://voice.example.com`. See [Security](#security).                                                                                                                                                                                                                  |
| `instructions.coordinator` | A line that keeps the coordinator to its job | Your text for the coordinator. The package appends it to the built-in coordinator role.                                                                                                                                                                                                                                                             |
| `instructions.workhorse`   | A line that keeps the workhorse to its job   | Your text for each workhorse, appended to the built-in workhorse role.                                                                                                                                                                                                                                                                              |
| `onFatal`                  | Writes the fault to the console              | Receives a fault that the agent cannot recover from. You decide whether to stop.                                                                                                                                                                                                                                                                    |
| `codex.executablePath`     | The installed `@openai/codex` package        | An absolute path of the Codex executable, in place of the installed package. `start()` proves it.                                                                                                                                                                                                                                                   |
| `codex.installedIn`        | None                                         | Refuses an installed `@openai/codex` that is not in `<installedIn>/node_modules`, such as a global install. It does not apply to `executablePath`.                                                                                                                                                                                                  |
| `codex.releasedIn`         | None                                         | For a host's compiled release: the platform package whose `@openai/codex-<os>-<cpu>` dependency holds the native binary. It does not apply to `executablePath`.                                                                                                                                                                                     |
| `codex.hostEnvironment`    | None                                         | Extra environment variables for the Codex process. They replace inherited values, but never `CODEX_HOME` or `CODEX_SQLITE_HOME`.                                                                                                                                                                                                                    |
| `codex.pathPrefixes`       | None                                         | Absolute directories that go first on the `PATH` of the Codex process, in order.                                                                                                                                                                                                                                                                    |
| `codex.diagnosticSecrets`  | None                                         | Strings that the package removes from the Codex output it keeps for diagnostics.                                                                                                                                                                                                                                                                    |
| `codex.onGroupOwned`       | None                                         | Receives the identity of the Codex process group before the process is ready, for a host that cleans up processes itself.                                                                                                                                                                                                                           |
| `identity`                 | See the identity table below                 | How the agent names itself to Codex and to the person.                                                                                                                                                                                                                                                                                              |
| `extensions`               | None                                         | Your own context, voice behavior and tools. See [Extensions](#extensions).                                                                                                                                                                                                                                                                          |

The agent that `createVoiceAgent` returns has these members:

| Member                   | What it does                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start()`                | Starts the private Codex process and resolves with the status once it is ready. When Codex cannot start, it rejects with an error whose `code` is `startup_failed` and whose `cause` names the reason. Call it again after a failure or a shutdown to start a new process. A call while the process is ready, or during `shutdown()`, rejects. |
| `status()`               | Reads the status without starting anything: `state` (`idle`, `starting`, `ready`, `stopping` or `failed`), `ready`, `failure` (a message or `null`), `childPid` and `generation`.                                                                                                                                                              |
| `bunHandlers(options)`   | Returns the `fetch` and `websocket` handlers of a `Bun.serve` server that serves the agent's sockets on one path. Spread them into the options of `Bun.serve`. See [A `Bun.serve` server](#a-bunserve-server).                                                                                                                                 |
| `connect(socket, route)` | Connects one socket from any WebSocket library on Bun. See [Any WebSocket library](#any-websocket-library).                                                                                                                                                                                                                                    |
| `shutdown()`             | Closes the sockets that the agent admitted from their requests, releases every connection, stops the Codex process and forgets every tab session. A later `start()` serves the sockets that connect again.                                                                                                                                     |
| `tabs`                   | The browser tabs as the agent's sockets name them: `of(browserId)`, `shown(tabSessionId, pin)`, `current(tabSessionId)`, `show(tabSessionId, checkout)` and `onShownChange(listener)`.                                                                                                                                                         |
| `instructions`           | The exact coordinator and workhorse profiles that the threads start with: identity, instruction text, tools and the SHA-256 of each. Record the digests to notice when a change of your instructions or tools reaches Codex.                                                                                                                   |
| `announce(change)`       | Tells the agents that something changed. See [Announcing a change](#announcing-a-change).                                                                                                                                                                                                                                                      |
| `voiceStartTrace()`      | What happened in the last voice starts of this process: the stages of each, with sizes, states and the words of whatever refused it. It holds no audio and no prompt text.                                                                                                                                                                     |

`identity` names the agent. A field that you leave out takes its default. Keep every value once threads exist: a thread keeps the names that it started with, a stored record keeps its prefix, and the agent drives only threads with its own thread source.

| Field            | Default                                                                                      | What it does                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceName`    | `"codex-realtime-voice"`                                                                     | The client service name that Codex records on each thread.                                                                                                                                                                                                 |
| `threadSource`   | `"codex-realtime-voice"`                                                                     | The thread source that Codex records on each thread and that the agent requires.                                                                                                                                                                           |
| `productName`    | `"Codex"`                                                                                    | What the person talks with, as the workhorse and the spoken-approval prompt are told. One line of 1 to 64 characters without quotes, backslashes or braces.                                                                                                |
| `toolNamespaces` | `{ workhorse: "voice_workhorse", voice: "voice_channel", coordinator: "voice_coordinator" }` | The Codex tool namespaces of the built-in tools: the coordinator's workhorse tools, its spoken-approval tool, and the tool that a workhorse uses to reach the coordinator. Give all three. Each matches `^[a-z][a-z0-9_]{0,63}$`, and no two are the same. |
| `recordPrefix`   | `"voice"`                                                                                    | The first part of every id that the agent creates and stores, as in `voice:<kind>:<token>`. It matches `^[a-z][a-z0-9-]{0,15}$`. A stored record keeps the prefix that it was written with.                                                                |

#### A `Bun.serve` server

`bunHandlers` takes these options. It throws a `TypeError` when `path` does not start with `/`, when `checkout` is not admitted, or when the agent admits more than one checkout and `checkout` names none.

| Field       | Default                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`      | Required                 | The socket path, such as `/voice`. A request that is not a socket upgrade on this path goes to `routes` and `fetch`.                                                                                                                                                                                                                                                                                              |
| `checkout`  | The only listed checkout | The admitted checkout that every socket on this path works in.                                                                                                                                                                                                                                                                                                                                                    |
| `fetch`     | Answers `404`            | Your handler of every other request. It receives the request and the server, as the `fetch` of `Bun.serve` does, and it can upgrade sockets of its own.                                                                                                                                                                                                                                                           |
| `websocket` | None                     | Your handlers of the sockets that your `fetch` upgrades. Bun has one handler set for each server, so the package tells its own sockets apart by their `data` and gives every other socket to these handlers. Their options, such as `maxPayloadLength`, apply to every socket of the server. When `backpressureLimit` makes Bun drop a frame to the page, the package closes that socket and the page reconnects. |

When `fetch` upgrades sockets of its own, name the type of their `data`, as in `agent.bunHandlers<{ room: string }>({ path, fetch, websocket })`.

A socket that arrives before `start()` is ready stays open: its requests are refused with "The Codex workbench is unavailable." until Codex is ready, and the client asks again by itself. `shutdown()` closes the agent's sockets with `1001`, and the same handlers serve the sockets that connect after the next `start()`.

#### Any WebSocket library

`agent.connect(socket, route)` connects one socket. `socket` has `send(data)`, which returns or resolves once the socket took the text frame and throws or rejects when it cannot, and `close(code, reason)`. The route `{ request }` takes the upgrade request, its absolute URL and its headers: the agent checks its origin as `bunHandlers` does, reads the tab session and chat from the URL, and closes a refused socket with `1008`. `connect` returns the connection: give it each parsed frame with `receive(frame)`, and call `close()` when the socket closes. `receive` returns `false` at once for a frame that is not the agent's, so one socket can carry your own messages too. This server writes Bun's socket handlers by hand:

<!-- checked: connect.ts -->

```ts
import { homedir } from "node:os";
import path from "node:path";
import { createVoiceAgent, type VoiceConnection } from "@archboard/codex-realtime-voice/server";

const agent = createVoiceAgent({
	directory: path.join(homedir(), ".voice-agent"),
	checkouts: [process.cwd()],
});

interface SocketData {
	readonly request: { readonly url: string; readonly headers: Headers };
	voice?: VoiceConnection;
}

Bun.serve({
	hostname: "127.0.0.1",
	port: 4100,
	fetch(request, server) {
		const data: SocketData = { request: { url: request.url, headers: request.headers } };
		if (new URL(request.url).pathname === "/voice" && server.upgrade(request, { data })) return;
		return new Response("Not found", { status: 404 });
	},
	websocket: {
		data: {} as SocketData,
		open(ws) {
			const socket = {
				send(text: string) {
					if (ws.readyState !== 1) throw new Error("The voice socket is not open.");
					if (ws.send(text) !== 0) return;
					ws.terminate();
					throw new Error("The voice socket dropped a frame.");
				},
				close: ws.close.bind(ws),
			};
			ws.data.voice = agent.connect(socket, { request: ws.data.request });
		},
		message(ws, message) {
			const frame: unknown = JSON.parse(String(message));
			if (ws.data.voice?.receive(frame) === false) ws.send(String(message));
		},
		close(ws) {
			void ws.data.voice?.close();
		},
	},
});
await agent.start();
```

A host that admits its sockets itself, and knows who each one is, names the identity in the route instead of the request: `{ tabSessionId, browserId, chat, checkout }`. `tabSessionId` comes from `parseTabSessionId`, `browserId` names the chat's socket so that a later socket of the same chat replaces it, `chat` is the chat id or a function that the agent reads on every frame, and `checkout` is an admitted checkout or a function that the agent reads when the tab first needs one. Your server admits the origin for an identity route. The agent checks a checkout you pass as a string against its configured checkouts. When you pass a function, your server must return an admitted checkout. A socket without a `browserId` or a `tabSessionId` still connects, and the agent refuses its requests with "The Codex workbench requires an authoritative browser connection identity." or "The Codex workbench requires the browser tab session identity.", in that order. A route never makes `connect` throw for a Codex that is not ready, and its registration lasts across Codex restarts until you close the connection.

### `mountVoice(element, url, options)`

`mountVoice` draws the panel in `element` and connects it to the socket at `url`, a path such as `/voice` or a full URL. It returns the function that removes the panel and releases its client. It throws a `TypeError` when `element` is `null`. `options.chatId` names the chat (default `main`), and `options.text` replaces any of the panel's English words, such as `{ signIn: "Anmelden" }`. A host that keeps its words in a file of their own types them as `Partial<VoicePanelText>`.

### `createVoiceClient(options)`

`createVoiceClient` makes the client of one chat and opens its socket at once. Its `options` have the type `VoiceClientOptions`.

| Field    | Default  | What it does                                                                                                                            |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `url`    | Required | The socket URL of the server, or its path. A path resolves against the page address. `http:` becomes `ws:` and `https:` becomes `wss:`. |
| `chatId` | `"main"` | The chat that this client shows. Use letters, digits, `_` and `-`, at most 128 characters.                                              |

A socket that does not open, or closes, is opened again after 3 seconds, and again after each failed attempt, until one opens or the client is disposed. On `pagehide` the client releases its socket and the microphone, and on `pageshow` it opens the socket again.

Every action returns a promise that resolves to `true` when the action completed and to `false` when it failed. The reason is then in `failure` of the state. Only one action runs at a time: an action that you call while another runs, or while the socket opens, resolves to `false` at once and changes nothing. `stopVoice` and `stopWork` also run while another action runs. After `dispose()`, every action resolves to `false`.

| Action                               | What it does                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `refresh()`                          | Reads the server state again without repeating a command.                                                             |
| `signIn(login?)`                     | Starts a sign-in. The default is the ChatGPT sign-in. `{ type: "apiKey", apiKey }` signs in with an API key.          |
| `cancelSignIn()`                     | Cancels the pending sign-in.                                                                                          |
| `signOut()`                          | Signs the account out.                                                                                                |
| `send(message)`                      | Sends a message to the workhorse, and creates the conversation on first use.                                          |
| `startVoice()`                       | Starts the coordinator's voice, and creates the conversation on first use.                                            |
| `stopVoice()`                        | Stops voice. The workhorse keeps working.                                                                             |
| `setMuted(muted)`                    | Mutes or unmutes the microphone of the running voice.                                                                 |
| `stopWork()`                         | Interrupts the running workhorse turn. Voice keeps running.                                                           |
| `answerApproval(approval, response)` | Answers one approval from the state that delivered it. The client refuses an approval from before its current socket. |
| `snapshot()`                         | Returns the current state.                                                                                            |
| `subscribe(listener)`                | Calls the listener after each change of the state. Returns the function that stops it.                                |
| `dispose()`                          | Stops voice, releases the socket and ends every subscription.                                                         |

The state has these fields:

| Field        | What it holds                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection` | `connected`, `reconnecting` or `stopped`.                                                                                                                                        |
| `server`     | What the server published last: the account, the sign-in, the workhorse timeline, approvals, the queue and the voice transcript. `null` before the first publication.            |
| `voice`      | The voice run: `phase`, `available` (a new voice run can start) and `problem` (why voice cannot start or why the last run failed).                                               |
| `busy`       | An action runs, or the socket opens.                                                                                                                                             |
| `failure`    | Why the last action failed, or why the socket did not open: `message` and `uncertain`. The next action clears it when it starts, and a socket that opens clears why one did not. |

### React

`useVoiceState(client)` returns the client's whole state and renders again on each change. `useVoiceState(client, select)` returns one part and renders again only when that part changes. The selector runs once for each change of the state. Return a part of the state or a primitive value: a new object counts as a change, so the component then renders again on each change. Create the client outside React, as the React page above does: a disposed client never connects again.

## Security

The agent can run commands and change files in the admitted checkouts. Anyone who can use its socket can ask it to.

- Your server owns the listener. The package opens no port. Bind to `127.0.0.1`, as the quickstart does, unless you put your own authentication in front of the socket.
- A `{ request }` route, and so `bunHandlers`, admits an upgrade whose `Host` is a loopback address (`127.0.0.1`, `localhost` or `[::1]`) and whose `Origin`, when present, is exactly the server's own origin, scheme and port included. Each origin in `origins` admits itself and its host. Every other upgrade is refused: `bunHandlers` answers `403` before the upgrade, and `connect` closes the socket with `1008`. This stops other web sites, and pages that reach the server under another name, from opening the socket from a browser. A client that sends no `Origin` header, such as a local script, passes this check, so every process that can reach the port can drive the agent.
- A workhorse works only in an admitted checkout. The browser never chooses the checkout: `bunHandlers` and the route fix it for each socket. The coordinator can delegate to every admitted checkout.
- Codex runs with a private `CODEX_HOME` in the state directory, never your own `~/.codex`. Keep the state directory outside every checkout, so that no workhorse can write into it. The package fixes its policy, and no option changes it: commands run in the `workspace-write` sandbox with network access, approvals are on request, and the approvals reviewer is `auto_review`. With `auto_review`, Codex gives an action that the sandbox refuses to a reviewer agent, which approves or denies it instead of asking the person.
- The Codex process receives only a fixed list of environment variables from your server: the user and shell (`HOME`, `USER`, `LOGNAME`, `SHELL`, `PATH`), the locale and time zone, the terminal, the temporary and XDG directories, the proxy and certificate variables, and `SSH_AUTH_SOCK`. Other variables, such as API keys, reach Codex only when you pass them in `codex.hostEnvironment`.
- An approval answer is bound to the state that delivered the approval. The server refuses the answer when the conversation changed since. Speech alone never settles an approval: a spoken answer is classified and settled once, and an unclear answer goes back to the page.

The package never looks up Codex on `PATH`, never uses your personal Codex sign-in, never lets the browser choose a checkout, and never repeats an action whose result is unknown. It writes only in the state directory and in `ownerDirectory`. Codex writes in the admitted checkouts under its sandbox.

## Advanced hosting

### Extensions

A host without a domain of its own passes no `extensions`. These fields add your own domain to the agent:

| Field                                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context`                              | What the coordinator is told about your application, as text. `read()` returns the current text, and `subscribe(onChange, onError)` calls `onChange` when the text changes. The coordinator receives the text as data, never as a request. The default lists the admitted checkouts.                                                                                                                                                                                                                                          |
| `voice`                                | How voice starts: `start(narrative)` returns the voice `prompt`, `suppressCoordinatorSpeech` and `delegationAckFiller`. The optional `subscribe` sends extra speech or quiet context to the voice. `narrative` is the one the session presents, or null. The default is plain live voice.                                                                                                                                                                                                                                     |
| `tools.coordinator`, `tools.workhorse` | Extra Codex dynamic tools for each role, in the `dynamicTools` shape of the Codex `thread/start` request. The package adds them after its own coordination tools. A tool cannot use a namespace of `identity.toolNamespaces`.                                                                                                                                                                                                                                                                                                 |
| `domainTools`                          | The handler of your tools: `registrations` lists each namespace with the SHA-256 of its manifest, and `install(scope)` returns the domain whose `dispatch(request)` answers each call and whose `dispose()` cleans up. The agent installs it for each Codex process.                                                                                                                                                                                                                                                          |
| `contextCodec`                         | How execution context is encoded into the text that a thread reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `checkoutLabel`                        | The name that the workhorse list shows for a checkout. The default is the name of the checkout's directory.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `narrative`                            | The narrative that a voice session starts to present: JSON whose meaning is yours, which the media owner's `start(narrative)` sends as `realtimeStart.narrative`. `validate` refuses it before a running session changes, `prepare` turns it into the narrative the session presents, `opened` and `forget` follow the session. `unattended` says that nobody listens to the session live: the coordinator then gets no workhorse outcome, and the state that the server publishes shows `server.voice.unattended` as `true`. |

The remaining fields (`coordinatorContextFor`, `voiceFor`, `contextForOperation` and `onGeneration`) replace the package's own owners for a host with a domain of its own. `composeRoleInstructions(role, { text, sha256 })`, `createTextUserInput` and `additionalContextPolicy()` in `./server` serve such a host's instructions and tools; `createCodexBrowserModel()` in `./contract` checks the state that the server publishes, for a host that settles dynamic approvals and for tests.

The extension types are not exported by name. Derive them from `VoiceAgentExtensions`. This context source tells the coordinator what the person selected:

<!-- checked: context.ts -->

```ts
import type { VoiceAgentExtensions } from "@archboard/codex-realtime-voice/server";

type ContextSource = NonNullable<VoiceAgentExtensions["context"]>;

let selected = "nothing";
const listeners = new Set<() => void>();

export const context: ContextSource = {
	read: () => `The person has selected ${selected}.`,
	subscribe: (onChange) => {
		listeners.add(onChange);
		return () => listeners.delete(onChange);
	},
};

export function select(next: string): void {
	selected = next;
	for (const listener of listeners) listener();
}
```

Pass it as `extensions: { context }` to `createVoiceAgent`.

### Announcing a change

When something changes that the agents must know about, call `agent.announce(change)`. Import its input type, `ContextChange`, from `@archboard/codex-realtime-voice/server`. TypeScript infers the receipt types from the returned promise. The promise from `announce` rejects with a `TypeError` when the change is malformed, for example when it names no audience. It rejects with an `Error` while `agent.status()` does not read `ready`. The change names its audience: `workhorse` for the workhorses of some checkouts, `coordinator`, `voice`, or any combination. Each audience gets its own `text`, or `withheld` with the reason that you tell it nothing.

A workhorse gets the text as a developer message that starts no turn, also while a turn runs. Its `payload` is your own JSON data, which the context codec encodes with the execution facts. A payload that holds a function, a symbol, a bigint, a number that is not finite, a class instance or a cycle makes the change malformed. The coordinator gets the text as a developer message. The voice gets it as quiet context, or with `speech: true` as speech that waits for the audio in progress. The coordinator and the voice get a change only while voice is live.

A workhorse hears one `feed` and `sequence` at most once, and refuses a sequence that does not pass the last one of its feed. The coordinator and the voice keep no such promise: they answer a repeat with its first receipt only while it is among the last 64 deliveries of the tab. Give the thread that made the change as `author`: nobody hears their own change. By default every live tab session hears the change. Name `tabSessions` to limit it. The change counts as fresh for 30 seconds from `capturedAtMs`, which defaults to now and cannot be later than now. A workhorse is not told a change that went stale. While a change for the coordinator or the voice waits, a later change with the same `feed` and `topic` replaces it. The audiences are told at the same time, in no fixed order.

<!-- checked: announce.ts -->

```ts
import type { VoiceAgent } from "@archboard/codex-realtime-voice/server";

let sequence = 0;

export async function fileSaved(agent: VoiceAgent, checkout: string, file: string): Promise<void> {
	const receipts = await agent.announce({
		feed: "editor",
		sequence: sequence++,
		workhorse: { checkouts: [checkout], text: `The person saved ${file}.` },
		voice: { text: `${file} is saved.` },
	});
	for (const receipt of receipts) {
		if (receipt.outcome !== "delivered") console.info(receipt.audience, receipt.reason);
	}
}
```

`announce` resolves with one receipt for each tab session and audience, and for each checkout of a workhorse. A receipt with `outcome_unknown` means that the message possibly arrived. The agent never sends it again.

A receipt for an audience that you told nothing has the reason `withheld`, unless a reason that is checked first applies, such as `voice_inactive` or `no_workhorse`. The receipt does not hold your reason text. The page does: each entry of `voiceContext.entries` in the state from `./contract` has a `withheld` field. For the coordinator and the voice, it holds the text that you gave as `withheld`, and it is `null` for every entry that has another reason. The agent cuts the text at 256 UTF-8 bytes and replaces each NUL character, so a long reason never stops the page from showing its state.

### A page that carries the voice on its own socket

A page whose socket also carries its own messages draws the conversation with `createSocketConversation({ chatId, media })`. The server connects that socket with `agent.connect` and a route that names its identity. Attach each socket after your server registered it: `attach(socket)` gives the socket a fresh transport and fresh controllers, attaches the voice after the transport, and returns the hosted conversation of that socket. An attach that a later attach, a `detach` or a `dispose` superseded returns `null` and publishes nothing. The conversation never closes your socket.

<!-- checked: host-page.ts -->

```ts
import { createSocketConversation } from "@archboard/codex-realtime-voice/browser";

const conversation = createSocketConversation({ chatId: "chat-1" });
const status = document.createElement("output");
document.body.append(status);

const socket = new WebSocket(new URL("/socket", location.href));
socket.addEventListener("message", (event) => {
	const message: unknown = JSON.parse(String(event.data));
	if (message === "registered")
		void conversation.attach(socket).then((hosted) => {
			hosted?.subscribe(() => {
				status.textContent = `${hosted.state().connection}, voice ${conversation.media.state().state}`;
			});
		});
});
socket.addEventListener("close", () => void conversation.detach(socket));
```

The hosted conversation holds the state of its socket (`state`, `snapshot`, `subscribe`, `refresh`, `capabilities`), the `controllers` of the conversation (the thread link and sign-in, the composer with queue and steer, the queue and the approvals) and the conversation's `media`. `media` also takes where the voice is played and heard: `audioElements` makes the audio element, and `receivers` hears the voice's receivers.

### Entry points

| Entry        | What it holds                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./server`   | `createVoiceAgent` and its types, `parseTabSessionId`, and `composeRoleInstructions`, `createTextUserInput` and `additionalContextPolicy` for a host with a domain of its own.         |
| `./browser`  | `mountVoice`, `createVoiceClient` and `createSocketConversation`, and their types.                                                                                                     |
| `./react`    | `useVoiceState`.                                                                                                                                                                       |
| `./contract` | The types of the state that the server publishes, such as `BrowserSnapshot`, `BrowserApproval`, `BrowserTimeline` and `RealtimeState`, and `createCodexBrowserModel`, which checks it. |

## Migrating from 0.5

This release changes the package for a standalone host. A host on 0.5 changes these imports and calls. The table also holds the names that the previous release removed.

| 0.5                                                                                                                                                                                                                                         | Now                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createVoiceAgent({ storage: { directory, ownerDirectory } })`                                                                                                                                                                              | `createVoiceAgent({ directory, ownerDirectory })`                                                                                                                                                 |
| `instructions` and `onFatal` required                                                                                                                                                                                                       | Both optional.                                                                                                                                                                                    |
| `bunHandlers({ path, origin, checkout, fetch, websocket })`                                                                                                                                                                                 | `bunHandlers({ path, checkout, fetch, websocket })`. The origin is the loopback same-origin default; more origins go to `origins` on the agent.                                                   |
| `bunHandlers` closes a socket before `start()` with `1011`, and serves no socket after `shutdown()`                                                                                                                                         | The socket stays and is served once Codex is ready; the same handlers serve again after the next `start()`.                                                                                       |
| `agent.attach(server, { path, origin, checkout })`                                                                                                                                                                                          | Removed. Use `agent.connect(socket, route)` with any WebSocket library on Bun, or `bunHandlers`.                                                                                                  |
| `agent.browser` (`accept`, `handle`, `close`, `drain`) and the type `VoiceAgentBrowserPort`                                                                                                                                                 | `agent.connect(socket, route)`, which returns `receive(frame)` and `close()`.                                                                                                                     |
| `createServerCodexBrowserSocketOwner`, `createServerCodexBrowserSocketSend`, `createBrowserLeaseLedger`, `parseWorkhorseLinkKey`, `projectCodexBrowserState`, `BrowserProjectionInput` from `./server`                                      | Removed. `agent.connect` owns the sockets, the leases and the snapshot.                                                                                                                           |
| `liveWorkhorseCheckouts(session)` from `./server`                                                                                                                                                                                           | `scope.sessions.liveCheckouts(tabSessionId)` on a domain scope.                                                                                                                                   |
| `mountVoiceStartTraceRoute(app)` from `./server`                                                                                                                                                                                            | `agent.voiceStartTrace()`. Answer it on a route of your own.                                                                                                                                      |
| `resolveCodexExecutable` from `./server`                                                                                                                                                                                                    | Leave `codex` out, or pass `codex: { executablePath, installedIn, releasedIn }`.                                                                                                                  |
| `extensions.onBrowserGateway`, `installBrowserSessions`, `browserLeaseLedger`, `browserCheckoutOf`                                                                                                                                          | Removed. Read the tabs from `agent.tabs`; a route's `checkout` may be a function.                                                                                                                 |
| The `CodexTransport` of a domain scope has `replaceIdentity`                                                                                                                                                                                | Removed.                                                                                                                                                                                          |
| `createVoiceClient({ socketPath, chatId })` and `client.connect()`                                                                                                                                                                          | `createVoiceClient({ url, chatId })`, which connects by itself, retries every first socket too, and follows `pagehide` and `pageshow`.                                                            |
| `client.answerApproval(approval, response, intent)` and the state's `intent`                                                                                                                                                                | `client.answerApproval(approval, response)`; the client binds each approval to the state that delivered it.                                                                                       |
| `VoiceClientProvider`, `useVoiceClient()` and `useVoiceState(select?)` from `./react`                                                                                                                                                       | `useVoiceState(client, select?)`.                                                                                                                                                                 |
| `./controllers`: `createBrowserWorkbenchTransport`, `createBrowserWorkbenchMediaOwner`, `createConversationControllers`, `browserAudioElements` and the type `BrowserWorkbenchTransport`                                                    | `createSocketConversation({ chatId, media })` from `./browser`, whose `attach(socket)` returns the hosted conversation of that socket. Build an audio element yourself for `media.audioElements`. |
| `./controllers`: `mergeConversation`, `projectTimelineTurns`, `ConversationTurn`, `VOICE_OUTPUT_SPEAKING_LEVEL`                                                                                                                             | Removed. Read the turns of `server.timeline`; a level of 0.02 or more is speech.                                                                                                                  |
| `./controllers` types `BrowserWorkbenchState`, `BrowserWorkbenchMediaOwner`, `BrowserAudioElementPort`, `VoiceOutputLevelSource`, `ConversationControllers`, `ApprovalChoice`                                                               | The same types from `./browser`.                                                                                                                                                                  |
| `./runtime`: `createTextUserInput`, `ADDITIONAL_CONTEXT_POLICY`, and the types `OperationOutcome` and `DeepReadonly`                                                                                                                        | `createTextUserInput`, `additionalContextPolicy()`, `OperationOutcome` and `DeepReadonly` from `./server`.                                                                                        |
| `./runtime`: `readWorkbenchInstructionDocument` with `composeWorkbenchRoleInstructions`                                                                                                                                                     | `composeRoleInstructions(role, { text, sha256 })` from `./server`.                                                                                                                                |
| `./runtime`: `createCodexWaitGraph`, `createCodexRealtimeAdapter`, `CodexRealtimeAdapter`, `CodexRealtimeAdapterOptions`, `CodexRealtimeBinding`, `EMPTY_SPOKEN_APPROVAL_SNAPSHOT`, `emptyManifest`                                         | Removed.                                                                                                                                                                                          |
| `./schemas`: `createCodexBrowserModel` and the types `BrowserSchemas`, `DynamicApprovalCanonicalEffect`, `BrowserDynamicApprovalEffect`, `BrowserDynamicApprovalResponse`                                                                   | The same names from `./contract`. `createCodexBrowserModel()` takes no argument for the wire identities.                                                                                          |
| `./schemas`: `canonicalDynamicApprovalJson`, `dynamicApprovalHashForCanonicalJson`                                                                                                                                                          | The members of the same names of `createCodexBrowserModel()`.                                                                                                                                     |
| `./schemas`: `JsonValueSchema`, `boundedText`, `BROWSER_IDLE_SPOKEN_APPROVAL`, `BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES`, `CodexBrowserModel`                                                                                            | Removed. Use `z.json()` of zod for JSON.                                                                                                                                                          |
| `./realtime`: the types `RealtimePhase` and `RealtimeState`                                                                                                                                                                                 | The same types from `./contract`.                                                                                                                                                                 |
| `./realtime`: `INITIAL_REALTIME_STATE`, `REALTIME_PHASES`, `REALTIME_TRANSITIONS`, `transitionRealtimeState`, `parseRealtimeCorrelationId`, `parseRealtimeItemId`, `parseRealtimeSessionId`, `RealtimeCorrelation`, `RealtimeSemanticEvent` | Removed.                                                                                                                                                                                          |

## Troubleshooting

### Codex reports another version

`createVoiceAgent` throws `CodexExecutableError` with code `wrong_version` and the message "The configured Codex executable reported an unexpected version; expected codex-cli 0.166.0." The executable it found is not Codex 0.166.0. When you pass `executablePath`, `start()` rejects instead, with code `startup_failed` and this reason in its `cause`.

1. Run `bun add @openai/codex@0.166.0` in your project.
2. If you pass `executablePath`, make sure that it names a Codex 0.166.0 executable.

### The Codex executable is not found

`createVoiceAgent` throws `CodexExecutableError`. Code `missing` means that `@openai/codex` is not installed where the package can find it, or that `executablePath` names no file. Code `not_absolute` means that `executablePath` is a relative path or a bare name: the package never looks on `PATH`. Code `version_unavailable` means that the executable did not run. With the installed package, the usual cause is that no `node` is on `PATH`. When you pass `executablePath`, `start()` rejects instead, with code `startup_failed` and the reason in its `cause`.

1. Run `bun add @openai/codex@0.166.0` in the project that runs the server. Package managers that skip peer dependencies leave it out.
2. If you pass `executablePath`, give an absolute path.
3. For `version_unavailable`, start the server with `bun run <script>`, or install Node.js.

### The page asks for a sign-in

`server.account.state` is `signed_out`. The agent has its own Codex home, so the sign-in of your own Codex client does not count.

1. Call `client.signIn()` and open `server.login.authUrl`.
2. Finish the sign-in in a browser on the machine that runs the server. The ChatGPT sign-in returns to `http://127.0.0.1:1455` on that machine.
3. If the page still shows the sign-in, call `client.refresh()`.

To sign in with an API key, call `client.signIn({ type: "apiKey", apiKey })`.

### The microphone is denied

`voice.available` is `false` and `voice.problem` is "Microphone permission was denied." The browser refused the microphone.

1. Allow the microphone for the page address in the browser's site settings.
2. Reload the page, then start voice again. After every failed voice start, `voice.available` stays `false` until the client opens a new socket.

If `voice.problem` is "This browser cannot install realtime microphone and audio support.", the page has no microphone and WebRTC support. This happens when you open the page over `http` on an address that is not local. Open the page on `127.0.0.1`, `localhost` or `https`.

### The socket is refused

`connection` stays `reconnecting`, and `failure` reads "The voice connection failed. Reconnect to try again." or "The voice connection closed.". The browser's network panel shows the socket upgrade answered with `403`, or the socket closed at once with `1008`. The page's origin is not admitted: its address is not a loopback address of the server's own origin, and it is not in `origins`. For example, the server answers on `0.0.0.0` and you opened its LAN address, or a development server on another port serves the page.

1. Open the page on `127.0.0.1` or `localhost`, on the server's own port, or add the page's origin to `origins`.
2. Serve the page and the socket from the same server.

A `400` answer means that the socket URL has no valid `tabSessionId` or `chatId`. `createVoiceClient` always sends both, so look at a custom `chatId`.

### The page stays on reconnecting

`connection` reads `reconnecting` while no socket is open, for example because the server stopped, or while the server refuses the socket's requests with "The Codex workbench is unavailable." because `start()` has not resolved or Codex failed. The client tries again every 3 seconds. The attempts leave the failure of an action as it is, so the failure of an action that the lost socket ended, such as an uncertain delivery, stays on the page. If the server speaks a contract that this browser cannot read, the attempts stop: `connection` reads `stopped`, and `failure` says why unless it already holds another failure. Build the page with the same package version as the server, then reload the page.

1. Make sure that the server runs and that `start()` resolved.
2. If the server logs no error, look at the attempts in the browser's network panel. A `403` or `400` answer has the causes in [The socket is refused](#the-socket-is-refused).

## License

MIT. See [LICENSE](LICENSE).
