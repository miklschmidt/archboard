// A stand-in for clangd that this owner runs as a program: it speaks the
// Language Server Protocol over stdio, so no test needs a real clangd. Run it
// as `bun clangd-stand-in.ts <answers.json>`.
//
// It answers `textDocument/definition` from the answers file, keyed by
// `<file>:<line>:<word>`: the file relative to its working directory, the
// line from 1, and the whole word at the asked position; each value is a
// location or a list of locations `{ path, line, character? }`, the path
// relative to its working directory. It answers `textDocument/documentSymbol`
// from the key `outline:<file>`. As clangd does, it reports the work-done
// progress `backgroundIndexProgress` once the first file is opened, when the
// client declared `window.workDoneProgress`, and ends it at once. It refuses a
// request it does not know.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [answersFile = "answers.json"] = process.argv.slice(2);
const answers = JSON.parse(fs.readFileSync(answersFile, "utf8")) as Record<string, unknown>;

/** One message the client sent. */
interface Message {
	readonly id?: number | string;
	readonly method?: string;
	readonly params?: {
		readonly textDocument?: { readonly uri: string };
		readonly position?: { readonly line: number; readonly character: number };
		readonly capabilities?: { readonly window?: { readonly workDoneProgress?: boolean } };
	};
}

/** Whether the client asked for work-done progress, and whether the index has run. */
let reportsProgress = false;
let indexed = false;

/**
 * Write one framed message.
 * @param message The message.
 */
function send(message: object): void {
	const body = JSON.stringify({ jsonrpc: "2.0", ...message });
	process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

/**
 * The definition answer for one question, from the answers file.
 * @param message The question.
 * @returns The locations.
 */
function definition(message: Message): object[] {
	const file = fileURLToPath(message.params?.textDocument?.uri ?? "");
	const { line = 0, character = 0 } = message.params?.position ?? {};
	const text = fs.readFileSync(file, "utf8").split("\n")[line] ?? "";
	const word =
		(/[\w$]*$/u.exec(text.slice(0, character))?.[0] ?? "") +
		(/^[\w$]*/u.exec(text.slice(character))?.[0] ?? "");
	const found = answers[`${path.relative(process.cwd(), file)}:${line + 1}:${word}`] ?? [];
	const each = [found].flat() as { path: string; line: number; character?: number }[];
	return each.map((at) => {
		const start = { line: at.line - 1, character: at.character ?? 0 };
		const range = { start, end: { ...start, character: start.character + 1 } };
		return { uri: pathToFileURL(path.resolve(process.cwd(), at.path)).href, range };
	});
}

/**
 * Report the index once, after the first file opened, and end it.
 */
function index(): void {
	if (indexed || !reportsProgress) return;
	indexed = true;
	const token = "backgroundIndexProgress";
	send({ method: "$/progress", params: { token, value: { kind: "begin", title: "indexing" } } });
	send({ method: "$/progress", params: { token, value: { kind: "end" } } });
}

/**
 * Answer one message.
 * @param message The message.
 */
function receive(message: Message): void {
	if (message.method === "initialize") {
		reportsProgress = message.params?.capabilities?.window?.workDoneProgress === true;
		send({ id: message.id, result: { capabilities: { definitionProvider: true } } });
	} else if (message.method === "textDocument/didOpen") {
		index();
	} else if (message.method === "textDocument/definition") {
		send({ id: message.id, result: definition(message) });
	} else if (message.method === "textDocument/documentSymbol") {
		const file = fileURLToPath(message.params?.textDocument?.uri ?? "");
		send({
			id: message.id,
			result: answers[`outline:${path.relative(process.cwd(), file)}`] ?? [],
		});
	} else if (message.method === "shutdown") {
		send({ id: message.id, result: null });
	} else if (message.method === "exit") {
		process.exit(0);
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
