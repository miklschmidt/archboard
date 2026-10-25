// A stand-in language server: it speaks the Language Server Protocol over
// stdio, so the suite never needs a real one. Run it as
// `bun fake-language-server.ts <state-dir> [mode] [argument...]`.
//
// It answers `textDocument/definition` from `<state-dir>/answers.json`, keyed
// by `<file>:<line>:<word>`: the file relative to its working directory, the
// line from 1 and the whole word at the asked position. Each value is
// `{ "path": <file>, "line": <line>, "character"?: <column> }`, or a list of
// them. It answers `textDocument/documentSymbol` with the outline under
// `outline:<file>`. It appends its pid to `<state-dir>/pids` when it starts,
// each method it receives to `<state-dir>/methods`, and its working directory
// and the `initializationOptions` it was given to `<state-dir>/starts`, one
// JSON line each, so a test can see what was asked, where, and whether the
// process still runs. It appends the arguments after its mode to
// `<state-dir>/argvs`, and its environment to `<state-dir>/environments`, one
// JSON line each. Once initialized it
// asks for its configuration of the sections `python` and `csharp`, and
// appends the client's answer to `<state-dir>/configuration` as one JSON line.
// It refuses a request it does not know, as a server does. A mode, or several
// joined by `,`, makes it behave as a server does, or misbehave:
//
// - `needs-open`: refuses a definition in a file the client has not opened,
//   as sourcekit-lsp does.
// - `hang-initialize`: never answers `initialize`.
// - `hang-definition`: never answers a definition.
// - `delayed-initialize`, `delayed-definition`: answers after 120 ms.
// - `exit-on-definition`: exits with code 3 on the first definition.
// - `deaf`: ignores `shutdown` and `exit`, so only a kill ends it.
// - `refuse-definition`: answers every definition with an error.
// - `indexes`: as clangd does, after the first file opened it reports the
//   work-done progress `backgroundIndexProgress`, if the client declared
//   `window.workDoneProgress`, and ends it 200 ms later; until then it knows
//   no definition.
// - `indexes-never`: reports that progress and never ends it.
// - `primes`: as rust-analyzer does, once initialized and before any file
//   opened it reports the work-done progress `rustAnalyzer/cachePriming`, if
//   the client declared `window.workDoneProgress`, and ends it 200 ms later;
//   until then it knows no definition.
// - `synchronizes`: builds its index during workspace/synchronize before answering.
// - `wrapped`: only runs the stand-in as its child, in the other modes, and
//   waits for it, as nixpkgs' `clangd` script runs `clangd-unwrapped`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [stateDir = ".", mode = "normal"] = process.argv.slice(2);
const modes = new Set(mode.split(","));
const answers = JSON.parse(
	fs.existsSync(path.join(stateDir, "answers.json"))
		? fs.readFileSync(path.join(stateDir, "answers.json"), "utf8")
		: "{}",
) as Record<string, unknown>;
fs.appendFileSync(path.join(stateDir, "pids"), `${process.pid}\n`);
if (modes.has("wrapped")) {
	const inner = [...modes].filter((each) => each !== "wrapped").join(",");
	const args = [process.execPath, import.meta.path, stateDir, inner, ...process.argv.slice(4)];
	process.exit(await Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] }).exited);
}
const extra = process.argv.slice(4);
fs.appendFileSync(path.join(stateDir, "argvs"), `${JSON.stringify(extra)}\n`);
fs.appendFileSync(path.join(stateDir, "environments"), `${JSON.stringify(process.env)}\n`);

/** One message the client sent. */
interface Message {
	readonly id?: number | string;
	readonly method?: string;
	readonly result?: unknown;
	readonly params?: {
		readonly textDocument?: { readonly uri: string };
		readonly position?: { readonly line: number; readonly character: number };
		readonly initializationOptions?: unknown;
		readonly index?: boolean;
		readonly capabilities?: { readonly window?: { readonly workDoneProgress?: boolean } };
	};
}

/** The token of the index progress, as rust-analyzer or clangd names it. */
const INDEX = modes.has("primes") ? "rustAnalyzer/cachePriming" : "backgroundIndexProgress";
/** Whether the client asked for work-done progress. */
let reportsProgress = false;
/** Whether the index is complete; a server that builds none knows every definition at once. */
let indexed = !["indexes", "indexes-never", "synchronizes", "primes"].some((each) =>
	modes.has(each),
);
/** Whether the index has started. */
let indexing = false;

/**
 * Start the index once, after the first file opened: report its progress, and
 * end it a little later unless the mode says it never ends.
 */
function startIndex(): void {
	if (indexed || indexing || !reportsProgress) return;
	indexing = true;
	send({ id: "create-1", method: "window/workDoneProgress/create", params: { token: INDEX } });
	send({
		method: "$/progress",
		params: { token: INDEX, value: { kind: "begin", title: "indexing" } },
	});
	if (modes.has("indexes-never")) return;
	setTimeout(() => {
		indexed = true;
		send({ method: "$/progress", params: { token: INDEX, value: { kind: "end" } } });
	}, 200);
}

/** The files the client opened. */
const opened = new Set<string>();

/**
 * Write one framed message.
 * @param message The message.
 */
function send(message: object): void {
	const body = JSON.stringify({ jsonrpc: "2.0", ...message });
	process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

/**
 * The whole word at a position of a file.
 * @param file The file.
 * @param position The position.
 * @param position.line Its line, from 0.
 * @param position.character Its column, from 0.
 * @returns The word.
 */
function wordAt(file: string, position: { line: number; character: number }): string {
	const line = fs.readFileSync(file, "utf8").split("\n")[position.line] ?? "";
	const before = /[\w$]*$/u.exec(line.slice(0, position.character))?.[0] ?? "";
	const after = /^[\w$]*/u.exec(line.slice(position.character))?.[0] ?? "";
	return before + after;
}

/**
 * The definition answer for one question, from the answers file.
 * @param message The question.
 * @returns The locations.
 */
function definition(message: Message): object[] {
	const uri = message.params?.textDocument?.uri ?? "";
	const position = message.params?.position ?? { line: 0, character: 0 };
	const file = fileURLToPath(uri);
	const key = `${path.relative(process.cwd(), file)}:${position.line + 1}:${wordAt(file, position)}`;
	const found = answers[key];
	const each = (Array.isArray(found) ? found : found === undefined ? [] : [found]) as {
		path: string;
		line: number;
		character?: number;
	}[];
	return each.map((at) => {
		const start = { line: at.line - 1, character: at.character ?? 0 };
		const end = { ...start, character: start.character + 1 };
		return { uri: pathToFileURL(path.resolve(process.cwd(), at.path)).href, range: { start, end } };
	});
}

/**
 * Answer a definition as the mode says.
 * @param message The question.
 */
function answerDefinition(message: Message): void {
	if (modes.has("exit-on-definition")) process.exit(3);
	const closed = modes.has("needs-open") && !opened.has(message.params?.textDocument?.uri ?? "");
	if (modes.has("refuse-definition") || closed)
		send({ id: message.id, error: { code: -32_603, message: "no" } });
	else if (!modes.has("hang-definition")) {
		const answer = () => send({ id: message.id, result: indexed ? definition(message) : [] });
		if (modes.has("delayed-definition")) setTimeout(answer, 120);
		else answer();
	}
}

/**
 * Answer one message as the mode says.
 * @param message The message.
 */
function receive(message: Message): void {
	fs.appendFileSync(path.join(stateDir, "methods"), `${message.method ?? "answer"}\n`);
	if (message.method === "initialize") {
		const start = { cwd: process.cwd(), options: message.params?.initializationOptions ?? null };
		reportsProgress = message.params?.capabilities?.window?.workDoneProgress === true;
		fs.appendFileSync(path.join(stateDir, "starts"), `${JSON.stringify(start)}\n`);
		if (modes.has("hang-initialize")) return;
		const answer = () =>
			send({ id: message.id, result: { capabilities: { definitionProvider: true } } });
		if (modes.has("delayed-initialize")) setTimeout(answer, 120);
		else answer();
		const items = [{ section: "python" }, { section: "csharp" }];
		send({ id: "ask-1", method: "workspace/configuration", params: { items } });
	} else if (message.method === "initialized") {
		if (modes.has("primes")) startIndex();
	} else if (message.id === "ask-1" && message.method === undefined) {
		fs.appendFileSync(path.join(stateDir, "configuration"), `${JSON.stringify(message.result)}\n`);
	} else if (message.method === "textDocument/didOpen") {
		opened.add(message.params?.textDocument?.uri ?? "");
		startIndex();
	} else if (message.method === "textDocument/documentSymbol") {
		const file = fileURLToPath(message.params?.textDocument?.uri ?? "");
		const outline = answers[`outline:${path.relative(process.cwd(), file)}`] ?? [];
		send({ id: message.id, result: outline });
	} else if (message.method === "textDocument/definition") {
		answerDefinition(message);
	} else if (message.method === "workspace/synchronize" && modes.has("synchronizes")) {
		if (message.params?.index === true) {
			setTimeout(() => {
				indexed = true;
				send({ id: message.id, result: null });
			}, 100);
		} else send({ id: message.id, result: null });
	} else if (message.method === "shutdown") {
		if (!modes.has("deaf")) send({ id: message.id, result: null });
	} else if (message.method === "exit") {
		if (!modes.has("deaf")) process.exit(0);
	} else if (message.method !== undefined && message.id !== undefined) {
		send({ id: message.id, error: { code: -32_601, message: `no method ${message.method}` } });
	}
}

let buffered = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
	buffered = Buffer.concat([buffered, chunk]);
	for (let end = buffered.indexOf("\r\n\r\n"); end >= 0; end = buffered.indexOf("\r\n\r\n")) {
		const length = Number(/Content-Length: (\d+)/iu.exec(buffered.toString("ascii", 0, end))?.[1]);
		if (buffered.length < end + 4 + length) break;
		receive(JSON.parse(buffered.toString("utf8", end + 4, end + 4 + length)) as Message);
		buffered = buffered.subarray(end + 4 + length);
	}
});
if (modes.has("deaf")) setInterval(() => undefined, 60_000);
