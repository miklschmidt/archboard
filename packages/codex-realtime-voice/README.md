# @archboard/codex-realtime-voice

This package adds a realtime Codex voice agent to your own Bun project. A person talks to a voice coordinator in a browser page. The coordinator answers short questions itself and hands sustained work to Codex workhorse threads that work in the checkouts your server admits. The package runs one private Codex app-server process and keeps the history of each conversation. It relays approvals to the page, and it tells the page when it cannot know whether an action arrived. It is for developers who want voice-driven Codex work inside their own tool, with their own page, on their own machine.

## Requirements

- Bun 1.4.3 or newer.
- The `@openai/codex` package at exactly version 0.160.0. The package refuses every other version.
- Linux or macOS.
- A Codex account that supports realtime voice. The person signs in from the page.
- For voice: a browser with a microphone and speakers. Browsers give microphone access only to pages on `https` or on a local address such as `127.0.0.1`.
- For the React entry: React 19.

## Install

```bash
bun add @archboard/codex-realtime-voice @openai/codex@0.160.0 react react-dom
bun add -d @types/bun @types/react @types/react-dom
```

`@openai/codex` is a peer dependency, so you install it yourself. `react` is an optional peer dependency. You need it only for `@archboard/codex-realtime-voice/react`.

## Quickstart

The quickstart is two files in the root of your project: a server and a React page. The workhorse works in the directory where you start the server.

`server.ts` starts the agent, serves the page and accepts the page's socket:

<!-- checked: server.ts -->

```ts
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { createVoiceAgent, resolveCodexExecutable } from "@archboard/codex-realtime-voice/server";

const port = 4100;
const origin = `http://127.0.0.1:${port}`;

const agent = createVoiceAgent({
	storage: { directory: path.join(homedir(), ".my-voice-agent") },
	codex: { executablePath: resolveCodexExecutable() },
	checkouts: [process.cwd()],
	instructions: {
		coordinator: "Answer short questions yourself. Give sustained work to the workhorse.",
		workhorse: "Do the work the person asks for in this checkout.",
	},
	onFatal: (error) => {
		console.error(error);
		void stop();
	},
});

const page = await Bun.build({ entrypoints: [path.join(import.meta.dir, "page.tsx")] });
const script = await page.outputs[0]!.text();
const html = `<!doctype html><title>Voice</title><div id="root"></div><script type="module" src="/page.js"></script>`;

const server = createServer((request, response) => {
	if (request.url === "/page.js") {
		response.writeHead(200, { "Content-Type": "text/javascript" }).end(script);
		return;
	}
	response.writeHead(200, { "Content-Type": "text/html" }).end(html);
});

const status = await agent.start();
if (!status.ready) throw new Error(`Codex did not start: ${status.failure}`);
agent.attach(server, { path: "/voice", origin });
server.listen(port, "127.0.0.1", () => console.log(`Open ${origin}`));

async function stop(): Promise<void> {
	server.close();
	await agent.shutdown();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
```

`page.tsx` connects to the socket and offers sign-in, text messages, voice, the two stops and command approvals:

<!-- checked: page.tsx -->

```tsx
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
	createVoiceClient,
	type VoiceApproval,
	type VoiceApprovalResponse,
} from "@archboard/codex-realtime-voice/browser";
import {
	VoiceClientProvider,
	useVoiceClient,
	useVoiceState,
} from "@archboard/codex-realtime-voice/react";

function App() {
	const client = useVoiceClient();
	const failure = useVoiceState((state) => state.failure);
	return (
		<main>
			{failure && <p role="alert">{failure.message}</p>}
			{failure?.uncertain && <button onClick={() => void client.refresh()}>Refresh</button>}
			<Conversation />
		</main>
	);
}

function Conversation() {
	const client = useVoiceClient();
	const state = useVoiceState();
	if (state.connection !== "connected")
		return <button onClick={() => void client.connect()}>Connect ({state.connection})</button>;
	if (state.server?.account.state !== "ready") return <SignIn />;
	const pending = state.server.approvals.filter(
		(approval) => approval.lifecycle.state === "pending",
	);
	return (
		<>
			<Voice />
			<Work />
			{pending.map((approval) => (
				<Approval key={String(approval.requestId)} approval={approval} />
			))}
		</>
	);
}

function SignIn() {
	const client = useVoiceClient();
	const login = useVoiceState((state) => state.server?.login);
	if (login?.state !== "pending")
		return <button onClick={() => void client.signIn()}>Sign in with ChatGPT</button>;
	return (
		<p>
			{login.authUrl && (
				<a href={login.authUrl} target="_blank" rel="noreferrer">
					Continue sign-in
				</a>
			)}{" "}
			<button onClick={() => void client.refresh()}>I signed in</button>
		</p>
	);
}

const LIVE = [
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"speaking",
];

function Voice() {
	const client = useVoiceClient();
	const voice = useVoiceState((state) => state.voice);
	const server = useVoiceState((state) => state.server);
	const live = LIVE.includes(voice.phase);
	return (
		<section>
			<h2>Voice: {voice.phase}</h2>
			<button disabled={live || !voice.available} onClick={() => void client.startVoice()}>
				Start voice
			</button>
			<button disabled={!live} onClick={() => void client.stopVoice()}>
				Stop voice
			</button>
			{voice.problem && <p role="alert">{voice.problem}</p>}
			{server?.voice.transcript.map((line) => (
				<p key={line.itemId}>
					{line.speaker}: {line.text}
				</p>
			))}
		</section>
	);
}

function Work() {
	const client = useVoiceClient();
	const timeline = useVoiceState((state) => state.server?.timeline);
	const [message, setMessage] = useState("");
	const running = timeline?.turns.some((turn) => turn.status === "inProgress") ?? false;
	const send = async () => {
		if (await client.send(message)) setMessage("");
	};
	return (
		<section>
			<h2>Workhorse</h2>
			{timeline?.turns.flatMap((turn) =>
				turn.items.map((item) =>
					item.media === "prompt" || item.media === "text" ? (
						<p key={item.itemId}>{item.text}</p>
					) : null,
				),
			)}
			<textarea value={message} onChange={(event) => setMessage(event.target.value)} />
			<button disabled={running || message.trim() === ""} onClick={() => void send()}>
				Send
			</button>
			<button disabled={!running} onClick={() => void client.stopWork()}>
				Stop work
			</button>
		</section>
	);
}

function Approval({ approval }: { readonly approval: VoiceApproval }) {
	const client = useVoiceClient();
	const intent = useVoiceState((state) => state.intent);
	const answer = (response: VoiceApprovalResponse) => {
		if (intent) void client.answerApproval(approval, response, intent);
	};
	if (approval.approvalKind !== "command_execution")
		return <p>Codex asks a {approval.approvalKind} question that this page does not answer.</p>;
	return (
		<section>
			<h2>Run this command?</h2>
			<pre>{approval.command}</pre>
			{approval.availableDecisions.map((decision) =>
				typeof decision === "string" ? (
					<button
						key={decision}
						onClick={() => answer({ approvalKind: "command_execution", decision })}
					>
						{decision}
					</button>
				) : null,
			)}
		</section>
	);
}

const client = createVoiceClient({ socketPath: "/voice" });
void client.connect();
addEventListener("pagehide", () => void client.dispose());
createRoot(document.getElementById("root")!).render(
	<VoiceClientProvider client={client}>
		<App />
	</VoiceClientProvider>,
);
```

Start the server from the directory that the workhorse works in:

```bash
bun server.ts
```

Then do these steps:

1. Open `http://127.0.0.1:4100`. Use this exact address, because the socket accepts only the origin that you give to `attach`.
2. Select "Sign in with ChatGPT", then "Continue sign-in", and finish the sign-in in that browser. Select "I signed in" when the page still shows the sign-in.
3. Type a message to the workhorse and select "Send".
4. Select "Start voice", allow the microphone, and talk to the coordinator.
5. Press `Ctrl+C` in the terminal to stop the server and its Codex process.

Bun bundles `page.tsx` when the server starts, so the quickstart needs no build step. For type checking, your `tsconfig.json` needs `"jsx": "react-jsx"`, the `DOM` library and the `bun` types. The page answers command approvals only. A complete page answers each approval kind. The example host in the [repository](https://github.com/miklschmidt/archboard/tree/main/apps/workbench-example) shows one.

### A page without React

`@archboard/codex-realtime-voice/browser` works with any framework or none. The React hooks are a thin reading of this client:

<!-- checked: plain.ts -->

```ts
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";

const client = createVoiceClient({ socketPath: "/voice" });
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
await client.connect();
```

`subscribe` calls the listener after each change, and `snapshot()` returns the current state. Each state is a new frozen object.

## Concepts

The coordinator is the Codex thread that the person talks to. It speaks through the realtime voice model, answers short questions, uses ordinary Codex tools for quick looks, and decides what the voice says. It does not do sustained work. It runs in a directory of its own inside the state directory, which is no checkout.

A workhorse is the Codex thread that does sustained work in one checkout. The coordinator gives it work with its own tools: it delegates, inspects, steers, queues and stops. A workhorse keeps its own history and never sees the coordinator's history. A text message from the page goes straight to the workhorse of the page's checkout.

An admitted checkout is a directory that your server lets a workhorse work in. You list the checkouts, or give a function that admits a checkout by name. Each workhorse reads the repository instructions and the Codex configuration of its checkout.

A tab session is one browser tab's conversation: one coordinator, and one workhorse for each checkout that the tab works in. The browser client keeps the tab session id in `sessionStorage`, so a reload keeps the conversation and another tab gets its own. When 60 seconds pass after the last pane of a tab closes, the tab session ends. The package then settles its open approvals, stops its voice and lets Codex unload its threads. A tab that comes back after that starts a new conversation.

A pane is one view in the page that shows the conversation, named by its pane id. Each pane has one socket. A pane that connects again replaces its earlier socket. All panes of a tab show the same conversation.

An approval is a request from Codex that the person must answer, such as running a command. The page receives each open approval in the server state and answers it with `answerApproval`. The answer carries the `intent` of the state that showed the approval, so the server refuses an answer to a conversation that changed since.

A spoken approval is an answer given aloud. Only a command approval that offers exactly "accept" or "decline" and grants nothing broader can be answered by voice. The coordinator classifies what the person said and settles the approval once through its own tool. When the words are unclear, the approval stays on the page for the person to answer there.

An uncertain delivery is an action whose result the client cannot know, for example because the socket closed before the server answered. The client then publishes a failure with `uncertain: true` and does not try the action again, because a second try can do the work twice. Refresh the state and look before you act again. The coordinator and the workhorse follow the same rule for their own tools, and the coordinator tells the person what is uncertain.

The state directory is the directory that you give as `storage.directory`. It holds the private Codex home (`codex-home`, the `CODEX_HOME` of the Codex process), the Codex database (`sqlite-home`) and the process-owner records (`owner`). The sign-in of the agent lives in this Codex home, not in the Codex home of your own Codex client. One running server owns one state directory.

## Configuration

### `createVoiceAgent(options)`

`createVoiceAgent` creates the agent and starts nothing. It throws when a listed checkout is not a readable directory or when an instruction is empty.

| Field                      | Default                        | What it does                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage.directory`        | Required                       | The state directory. The package creates it with mode `0700`. An existing directory must have mode `0700`, belong to you, and have no symbolic link in its path. Keep it outside every checkout.                                                                        |
| `storage.ownerDirectory`   | `<directory>/owner`            | Where the process-owner lock and records live.                                                                                                                                                                                                                          |
| `codex.executablePath`     | Required                       | The absolute path of the Codex executable. Use `resolveCodexExecutable()`.                                                                                                                                                                                              |
| `codex.hostEnvironment`    | None                           | Extra environment variables for the Codex process. They replace inherited values, but never `CODEX_HOME` or `CODEX_SQLITE_HOME`.                                                                                                                                        |
| `codex.pathPrefixes`       | None                           | Absolute directories that go first on the `PATH` of the Codex process, in order.                                                                                                                                                                                        |
| `codex.diagnosticSecrets`  | None                           | Strings that the package removes from the Codex output it keeps for diagnostics.                                                                                                                                                                                        |
| `codex.onGroupOwned`       | None                           | Receives the identity of the Codex process group before the process is ready, for a host that cleans up processes itself.                                                                                                                                               |
| `checkouts`                | Required                       | The admitted checkouts: a list of directories, or a function that returns the admitted path for a named checkout and `null` for a refused one. The package resolves each to its real path.                                                                              |
| `instructions.coordinator` | Required                       | Your text for the coordinator. The package appends it to the built-in coordinator role. It must not be empty.                                                                                                                                                           |
| `instructions.workhorse`   | Required                       | Your text for each workhorse, appended to the built-in workhorse role. It must not be empty.                                                                                                                                                                            |
| `identity`                 | `DEFAULT_VOICE_AGENT_IDENTITY` | How the agent's threads name themselves to Codex: `serviceName` and `threadSource`, both `"codex-realtime-voice"` by default. The agent drives only threads with its own thread source, so if you change it, the agent no longer reaches the threads it started before. |
| `onFatal`                  | Required                       | Receives a fault that the agent cannot recover from. You decide whether to stop.                                                                                                                                                                                        |
| `extensions`               | None                           | Your own context, voice behavior and tools. See [Advanced hosting](#advanced-hosting).                                                                                                                                                                                  |

The agent that `createVoiceAgent` returns has these members:

| Member                    | What it does                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start()`                 | Starts the private Codex process and waits for it. It resolves with the status. When Codex cannot start, it rejects with an error whose `code` is `startup_failed` and whose `cause` names the reason. Call it again after a failure or a shutdown to start a new process. |
| `status()`                | Reads the status without starting anything: `state` (`idle`, `starting`, `ready`, `stopping` or `failed`), `ready`, `failure` (a message or `null`), `childPid` and `generation`.                                                                                          |
| `attach(server, options)` | Serves the page's sockets on one path of a `node:http` server, which Bun runs. Call it after `start()` resolves. It returns a function that detaches: it stops accepting, closes those sockets and waits for their work.                                                   |
| `shutdown()`              | Detaches every attached server, stops the Codex process and forgets every tab session.                                                                                                                                                                                     |
| `instructions`            | The exact coordinator and workhorse profiles that the threads start with: identity, instruction text, tools and the SHA-256 of each. Record the digests to notice when a change of your instructions or tools reaches Codex.                                               |
| `browser`                 | The browser connection port for a host that serves sockets itself. See [Advanced hosting](#advanced-hosting).                                                                                                                                                              |

`attach` takes these options:

| Field      | Default                  | What it does                                                                                                                                                  |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`     | Required                 | The socket path, such as `/voice`. Upgrades to other paths go to the other listeners of the server.                                                           |
| `origin`   | Required                 | The HTTP origin of your listener, such as `http://127.0.0.1:4100`. See [Security](#security).                                                                 |
| `checkout` | The only listed checkout | The admitted checkout that every socket on this path works in. You must name it when the agent admits more than one checkout, or admits them with a function. |

### `resolveCodexExecutable(options)`

`resolveCodexExecutable` finds the Codex executable and proves it before anything runs it. It must be an absolute path to a regular, executable file that reports exactly `codex-cli 0.160.0`. It never looks on `PATH`. It returns the absolute path, and throws a `CodexExecutableError` with a `code` when the proof fails.

| Field            | Default                               | What it does                                                                                                                                       |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executablePath` | The installed `@openai/codex` package | An absolute path to prove in place of the installed package.                                                                                       |
| `installedIn`    | None                                  | Refuses an installed `@openai/codex` that is not in `<installedIn>/node_modules`, such as a global install. It does not apply to `executablePath`. |

### `createVoiceClient(options)`

`createVoiceClient` makes the client of one page view. It opens nothing until you call `connect()`.

| Field        | Default  | What it does                                                                                                                               |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `socketPath` | Required | The socket path of the server, or a full URL. A path resolves against the page address. `http:` becomes `ws:` and `https:` becomes `wss:`. |
| `paneId`     | `"main"` | The pane that this client shows. Use letters, digits, `_` and `-`, at most 128 characters.                                                 |

Every action returns a promise that resolves to `true` when the action completed and to `false` when it was refused or failed. The reason is then in `failure` of the state. Only one action runs at a time: an action that you call while another runs resolves to `false` at once and sets no failure. `stopVoice` and `stopWork` also run while another action runs.

| Action                                       | What it does                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `connect()`                                  | Opens the socket, or opens it again. The client does not open a lost socket again by itself.                 |
| `refresh()`                                  | Reads the server state again without repeating a command.                                                    |
| `signIn(login?)`                             | Starts a sign-in. The default is the ChatGPT sign-in. `{ type: "apiKey", apiKey }` signs in with an API key. |
| `cancelSignIn()`                             | Cancels the pending sign-in.                                                                                 |
| `signOut()`                                  | Signs the account out.                                                                                       |
| `send(message)`                              | Sends a message to the workhorse, and creates the conversation on first use.                                 |
| `startVoice()`                               | Starts the coordinator's voice, and creates the conversation on first use.                                   |
| `stopVoice()`                                | Stops voice. The workhorse keeps working.                                                                    |
| `setMuted(muted)`                            | Mutes or unmutes the microphone of the running voice.                                                        |
| `stopWork()`                                 | Interrupts the running workhorse turn. Voice keeps running.                                                  |
| `answerApproval(approval, response, intent)` | Answers one approval that the page showed, with the `intent` of the state that showed it.                    |
| `snapshot()`                                 | Returns the current state.                                                                                   |
| `subscribe(listener)`                        | Calls the listener after each change of the state. Returns the function that stops it.                       |
| `dispose()`                                  | Stops voice, releases the socket and ends every subscription.                                                |

The state has these fields:

| Field        | What it holds                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection` | `connected`, `reconnecting` or `stopped`.                                                                                                                             |
| `server`     | What the server published last: the account, the sign-in, the workhorse timeline, approvals, the queue and the voice transcript. `null` before the first publication. |
| `voice`      | The voice run: `phase`, `available` (a new voice run can start) and `problem` (why voice cannot start or why the last run failed).                                    |
| `busy`       | An action is running.                                                                                                                                                 |
| `failure`    | Why the last action failed: `message` and `uncertain`. `null` after an action succeeds.                                                                               |
| `intent`     | The value to pass with an approval answer, or `null` while no answer can be sent.                                                                                     |

### React

`VoiceClientProvider` takes a `client` and offers it to the components inside it. You connect and dispose the client yourself. `useVoiceClient()` returns the client for its actions. `useVoiceState()` returns the whole state and renders again on each change. `useVoiceState(select)` returns one part and renders again only when that part changes. The selector must return a part of the state or a primitive value, never a new object, or the component renders without end.

## Security

The agent can run commands and change files in the admitted checkouts. Anyone who can use its socket can ask it to.

- Your server owns the listener. The package opens no port. Bind to `127.0.0.1`, as the quickstart does, unless you put your own authentication in front of the socket.
- `attach` refuses a socket upgrade with `403` when the `Host` header is not the host of `origin`, or when the `Origin` header is present and is not exactly `origin`. This stops other web sites from opening the socket from a browser. A client that sends no `Origin` header, such as a local script, passes this check, so every process that can reach the port can drive the agent.
- A workhorse works only in an admitted checkout. The browser never chooses the checkout: `attach` fixes it for each socket path. The coordinator can delegate to every admitted checkout.
- Codex runs with a private `CODEX_HOME` in the state directory, never your own `~/.codex`. At each start, the package adds these settings to `config.toml` in that home when they are missing: `approval_policy = "on-request"`, `approvals_reviewer = "auto_review"`, `sandbox_mode = "workspace-write"` and network access for that sandbox. A setting that the file already has stays. With `auto_review`, Codex gives an action that the sandbox refuses to a reviewer agent instead of asking the person. To answer every approval yourself, stop the server, set `approvals_reviewer = "user"` in `<directory>/codex-home/config.toml`, and start it again. The file must keep mode `0600`.
- The Codex process receives only a fixed list of environment variables from your server: the user and shell (`HOME`, `USER`, `LOGNAME`, `SHELL`, `PATH`), the locale and time zone, the terminal, the temporary and XDG directories, the proxy and certificate variables, and `SSH_AUTH_SOCK`. Other variables, such as API keys, reach Codex only when you pass them in `codex.hostEnvironment`.
- An approval answer carries the `intent` of the state that showed it. The server refuses the answer when the conversation changed since. Speech alone never settles an approval: a spoken answer is classified and settled once, and an unclear answer goes back to the page.

The package never looks up Codex on `PATH`, never uses your personal Codex sign-in, never lets the browser choose a checkout, and never repeats an action whose result is unknown. It writes only in the state directory and in `storage.ownerDirectory`. Codex writes in the admitted checkouts under its sandbox.

## Advanced hosting

### Extensions

A host without a domain of its own passes no `extensions`. These fields add your own domain to the agent:

| Field                                  | What it does                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `context`                              | What the coordinator is told about your application, as text. `read()` returns the current text, and `subscribe(onChange, onError)` calls `onChange` when the text changes. The coordinator receives the text as data, never as a request. The default lists the admitted checkouts. |
| `voice`                                | How voice starts: `start(presentation)` returns the voice `prompt`, `suppressCoordinatorSpeech` and `delegationAckFiller`. The optional `subscribe` sends extra speech or quiet context to the voice. The default is plain live voice.                                               |
| `tools.coordinator`, `tools.workhorse` | Extra Codex dynamic tools for each role, in the `dynamicTools` shape of the Codex `thread/start` request. The package adds them after its own coordination tools. A tool cannot reuse a namespace of the built-in tools.                                                             |
| `domainTools`                          | The handler of your tools: `registrations` lists each namespace with the SHA-256 of its manifest, and `install(scope)` returns the domain whose `dispatch(request)` answers each call and whose `dispose()` cleans up. The agent installs it for each Codex process.                 |
| `contextCodec`                         | How execution context is encoded into the text that a thread reads.                                                                                                                                                                                                                  |
| `repositoryOfCheckout`                 | The repository name that the page shows for a checkout.                                                                                                                                                                                                                              |
| `presentation`, `recording`            | How a voice presentation reaches the page, and whether a presentation is a recording.                                                                                                                                                                                                |

The remaining fields (`coordinatorContextFor`, `voiceFor`, `sessionContextFor`, `workhorseContextFor`, `contextForOperation`, `onGeneration`, `onBrowserGateway`, `browserCheckoutOf`, `installBrowserSessions` and `browserLeaseLedger`) replace the package's own owners. They are for a host that routes its sockets itself.

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

### A host that owns its sockets

`attach` covers one `node:http` server. A host that serves sockets in another way uses `agent.browser` on the server instead: `accept` registers a socket with its pane, tab session and checkout, `handle` passes each parsed request, `close` ends a socket, and `drain` waits for accepted work. `attach` in the package source is the reference use.

In the browser, `@archboard/codex-realtime-voice/controllers` holds the parts under `createVoiceClient`. Use them to draw your own conversation UI over a socket that you open: the transport and the media owner, the conversation controllers of one pane (the conversation link and sign-in, the composer with queue and steer, the queue and the approvals), and the conversation projected from the server timelines.

### Entry points

| Entry           | What it holds                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./server`      | `createVoiceAgent`, `resolveCodexExecutable` and their types. The remaining exports are seams that Archboard uses. A host that uses `attach` needs none of them. |
| `./browser`     | `createVoiceClient` and its types.                                                                                                                               |
| `./react`       | `VoiceClientProvider`, `useVoiceClient` and `useVoiceState`.                                                                                                     |
| `./controllers` | The transport, media and conversation parts under the client.                                                                                                    |
| `./contract`    | The types of the state that the server publishes, such as `BrowserSnapshot`, `BrowserApproval` and `BrowserTimeline`.                                            |
| `./schemas`     | The schemas of that state, for a server that extends it and for tests.                                                                                           |
| `./realtime`    | The phases and transitions of a voice run.                                                                                                                       |
| `./runtime`     | Lower-level runtime parts, such as coordinator callbacks and the realtime adapter.                                                                               |

## Troubleshooting

### Codex reports another version

`resolveCodexExecutable` throws `CodexExecutableError` with code `wrong_version` and the message "The configured Codex executable reported an unexpected version; expected codex-cli 0.160.0." The executable it found is not Codex 0.160.0.

1. Run `bun add @openai/codex@0.160.0` in your project.
2. If you pass `executablePath`, make sure that it names a Codex 0.160.0 executable.

### The Codex executable is not found

`resolveCodexExecutable` throws `CodexExecutableError`. Code `missing` means that `@openai/codex` is not installed where the package can find it, or that `executablePath` names no file. Code `not_absolute` means that `executablePath` is a relative path or a bare name: the package never looks on `PATH`.

1. Run `bun add @openai/codex@0.160.0` in the project that runs the server. Package managers that skip peer dependencies leave it out.
2. If you pass `executablePath`, give an absolute path.

### The page asks for a sign-in

`server.account.state` is `signed_out`. The agent has its own Codex home, so the sign-in of your own Codex client does not count.

1. Call `client.signIn()` and open `server.login.authUrl`.
2. Finish the sign-in in a browser on the machine that runs the server. The ChatGPT sign-in returns to `http://127.0.0.1:1455` on that machine.
3. If the page still shows the sign-in, call `client.refresh()`.

To sign in with an API key, call `client.signIn({ type: "apiKey", apiKey })`.

### The microphone is denied

`voice.available` is `false` and `voice.problem` is "Microphone permission was denied." The browser refused the microphone.

1. Allow the microphone for the page address in the browser's site settings.
2. Call `client.connect()` or reload the page, then start voice again. After every failed voice start, `voice.available` stays `false` until the next `connect()`.

If `voice.problem` is "This browser cannot install realtime microphone and audio support.", the page has no microphone and WebRTC support. This happens when you open the page over `http` on an address that is not local. Open the page on `127.0.0.1`, `localhost` or `https`.

### The socket is refused

The page shows "The voice connection failed. Reconnect to try again." and `connection` stays `stopped`. The browser's network panel shows the socket upgrade answered with `403`. The page address is not the `origin` that you gave to `attach`. For example, you opened `http://localhost:4100` and the origin is `http://127.0.0.1:4100`.

1. Open the page at exactly the address in `origin`.
2. Serve the page and the socket from the same server. A page from a development server on another port has another origin.

A `400` answer means that the socket URL has no valid `tabSessionId` or `paneId`. `createVoiceClient` always sends both, so look at a custom `paneId`. A socket that closes at once with code `1011` and "The voice agent is unavailable. Restart the server." reached the server before `start()` resolved, after Codex failed, or on a path whose `checkout` the agent does not admit.

### The state directory is in use

`start()` rejects with code `startup_failed`. Its `cause` is "Another server owns this Codex state at `<directory>/owner`. Stop the other owner (pid `<pid>`) before retrying." Another process runs an agent on the same state directory.

1. Stop the process with that pid, or give each process its own `storage.directory`.
2. Start again. A lock whose owner has exited is set aside by the next start.

The same rejection also names a state directory that the package cannot use:

- "must have mode 0700, received 0755": run `chmod 700` on the directory, or let the package create it.
- "Refusing symlink-escaped Codex storage path component": a directory in the path is a symbolic link. On macOS, `/tmp` and `/var` are symbolic links. Use a real path, such as a directory in your home directory.

### Other errors from `createVoiceAgent` and `attach`

- "A workbench role requires app identity and domain instructions.": an instruction or an identity value is empty. Give text for both roles.
- "The allowed checkout `<path>` is not a readable directory.": a listed checkout does not exist. Create it or remove it from `checkouts`.
- "Name the checkout these sockets work in: the agent admits more than one.": pass `checkout` to `attach`.

### The page stays on reconnecting

The socket closed, for example because the server restarted. The client does not open a lost socket again by itself. Call `client.connect()`, as the quickstart's "Connect" button does.

## License

MIT. See [LICENSE](LICENSE).
