// One language server process, from its start to its stop.
//
// It starts in the root of a project, a checkout or a package in one, and is
// told that root is its one workspace, so it finds the project there itself.
// The client asks it only for definitions and for the outline of a file, and
// never asks it to build or to run a command. It starts with the options its
// language's row names, is told the project's settings, such as the Python
// environment, when it asks for its configuration, and before the first
// question it is asked once to load what it reads, where the row names such
// a request. A server that reads
// each file from disk, as the code check does, gets no file opened; one whose
// row says it answers only about an open file gets each file opened once,
// with its text on disk. A server whose row names the progress of its index
// is asked nothing until that index is complete, after its first file opened.
// It runs the command it is given with the user's environment, in a process
// group of its own. Stopping asks it to shut down and
// exit, and kills the group if it has not ended within the bound; a cancelled
// pass kills it at once. Either way the stop returns only once the process
// has ended.

import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
	connect,
	killGroup,
	RequestFailure,
	type Connection,
	type RequestBounds,
	type ServerProcess,
} from "@/runtime/language-servers/lib/connection";
import { LANGUAGES, languageOf, type Language } from "@/runtime/language-servers/lib/languages";
import { outlineOf, type OutlineSymbol } from "@/runtime/language-servers/lib/outline";
import type { LANGUAGE_SERVER_TIMEOUTS } from "@/shared/timing/timing";

/** How long a server is waited for. */
type ServerTimeouts = Readonly<Record<keyof typeof LANGUAGE_SERVER_TIMEOUTS, number>>;

/** A place in a file, as the protocol counts: from 0, in UTF-16 code units. */
interface Position {
	readonly line: number;
	readonly character: number;
}

/** Where a server says a definition is: an absolute path, a line from 1 and a column from 0. */
interface DefinitionLocation {
	readonly path: string;
	readonly line: number;
	readonly character: number;
}

/** A started server. */
interface Server {
	/** Where the name at a position of a file is defined; rejects when the server fails. */
	readonly definition: (file: string, position: Position) => Promise<DefinitionLocation[]>;
	/** The outline of a file: what it declares, and where; rejects when the server fails. */
	readonly outline: (file: string) => Promise<OutlineSymbol[]>;
	/** Stop it, and return once its process has ended. */
	readonly stop: (graceful: boolean) => Promise<void>;
}

/** What one server needs to start. */
interface ServerStart {
	readonly language: Language;
	readonly argv: readonly [string, ...string[]];
	/** The project's root, where it starts. */
	readonly root: string;
	/** What it is told when it asks for its configuration, by section. */
	readonly settings?: Readonly<Record<string, unknown>> | undefined;
	readonly signal: AbortSignal;
	readonly timeouts: ServerTimeouts;
}

/** The start of a range, which is all of it the check reads. */
const RangeSchema = z.object({
	start: z.object({ line: z.int().nonnegative(), character: z.int().nonnegative() }),
});

/** One location as a server spells it, a `LocationLink` or a `Location`, as a URI and a line from 0. */
const SpelledLocationSchema = z.union([
	z
		.object({ targetUri: z.string(), targetSelectionRange: RangeSchema })
		.transform((link) => ({ uri: link.targetUri, ...link.targetSelectionRange.start })),
	z
		.object({ uri: z.string(), range: RangeSchema })
		.transform((location) => ({ uri: location.uri, ...location.range.start })),
]);

/** A definition answer: `null`, one `Location`, or a list of locations or links. */
const DefinitionResultSchema = z.union([
	z.null(),
	SpelledLocationSchema,
	z.array(SpelledLocationSchema.nullable().catch(null)),
]);

/**
 * The locations of a definition answer in files. An answer of another shape has none.
 * @param result The answer.
 * @returns Each location in a file.
 */
function locationsOf(result: unknown): DefinitionLocation[] {
	const answer = DefinitionResultSchema.safeParse(result);
	const spelled = answer.success ? [answer.data].flat() : [];
	return spelled.flatMap((each) =>
		each?.uri.startsWith("file:") === true
			? [{ path: fileURLToPath(each.uri), line: each.line + 1, character: each.character }]
			: [],
	);
}

/**
 * Why a process ended.
 * @param code Its exit code.
 * @param signal The signal that ended it, if one did.
 * @returns The reason.
 */
function exitReason(code: number, signal: string | null): string {
	return signal === null ? `exited with code ${code}` : `ended by ${signal}`;
}

/**
 * The `initialize` request: the project as the one workspace, a client that
 * asks for definitions and outlines and nothing else, and the options the
 * language's row names.
 * @param root The project.
 * @param language Its language.
 * @returns Its params.
 */
function initializeParams(root: string, language: Language): object {
	const uri = pathToFileURL(root).href;
	const { initializationOptions, indexProgress } = LANGUAGES[language];
	return {
		processId: process.pid,
		clientInfo: { name: "archboard" },
		rootUri: uri,
		workspaceFolders: [{ uri, name: "checkout" }],
		capabilities: {
			general: { positionEncodings: ["utf-16"] },
			workspace: { configuration: true },
			textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true } },
			...(indexProgress === undefined ? {} : { window: { workDoneProgress: true } }),
		},
		...(initializationOptions === undefined ? {} : { initializationOptions }),
	};
}

/**
 * Ask a server once to load what it reads, where its language's row names
 * such a request. A server that refuses it, as one that does not know it
 * does, is asked the questions anyway.
 * @param connection Its connection.
 * @param language Its language.
 * @param bounds How long to wait, and the pass's signal.
 * @param bounds.timeoutMs How long to wait.
 * @param bounds.signal The pass's signal.
 */
async function settle(
	connection: Connection,
	language: Language,
	bounds: { readonly timeoutMs: number; readonly signal: AbortSignal },
): Promise<void> {
	const request = LANGUAGES[language].settle;
	if (request === undefined) return;
	try {
		await connection.request(request.method, request.params, bounds);
	} catch (error) {
		if (!(error instanceof RequestFailure && error.kind === "answered")) throw error;
	}
}

/**
 * Open a file with its text on disk. An unreadable file stays closed, and the
 * server refuses to answer about it.
 * @param connection The server's connection.
 * @param file The file, absolute.
 * @returns Whether it opened.
 */
async function openFile(connection: Connection, file: string): Promise<boolean> {
	const text = await fs.readFile(file, "utf8").catch(() => undefined);
	if (text === undefined) return false;
	const languageId = languageOf(file)?.languageId ?? "plaintext";
	const textDocument = { uri: pathToFileURL(file).href, languageId, version: 0, text };
	connection.notify("textDocument/didOpen", { textDocument });
	return true;
}

/**
 * A function that opens a file once, for a server that answers only about an
 * open file, and does nothing for any other. Where the row names the progress
 * of the index the server builds once it has opened a file, it resolves only
 * once that index is complete, so no answer depends on which files the pass
 * happened to open before.
 * @param connection The server's connection.
 * @param language Its language.
 * @param bounds How long to wait for the index, and the pass's signal.
 * @returns The function.
 */
function opener(
	connection: Connection,
	language: Language,
	bounds: RequestBounds,
): (file: string) => Promise<void> {
	const { opensFiles, indexProgress } = LANGUAGES[language];
	if (opensFiles !== true) return () => Promise.resolve();
	const opened = new Map<string, Promise<boolean>>();
	let indexed: Promise<void> | undefined;
	return async (file) => {
		let open = opened.get(file);
		if (open === undefined) {
			open = openFile(connection, file);
			opened.set(file, open);
		}
		if (!(await open) || indexProgress === undefined) return;
		indexed ??= connection.progressEnd(indexProgress, bounds);
		await indexed;
	};
}

/**
 * Wait for a process to end, at most a while.
 * @param exited Resolves when it has ended.
 * @param ms How long to wait.
 * @returns True when it ended in time.
 */
async function endedWithin(exited: Promise<unknown>, ms: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<false>((resolve) => {
		timer = setTimeout(resolve, ms, false);
	});
	const ended = await Promise.race([exited.then(() => true), late]);
	clearTimeout(timer);
	return ended;
}

/**
 * Ask a server to shut down and exit.
 * @param connection Its connection.
 * @param timeouts How long to wait for the answer.
 */
async function askToExit(connection: Connection, timeouts: ServerTimeouts): Promise<void> {
	const bounds = { timeoutMs: timeouts.stopMs, signal: new AbortController().signal };
	await connection.request("shutdown", undefined, bounds).catch(() => undefined);
	connection.notify("exit");
}

/**
 * Stop a process: ask it to exit, unless it must die at once, then kill it
 * and its group if it has not ended within the bound, which counts from the
 * stop.
 * @param child The process.
 * @param connection Its connection.
 * @param graceful Ask it to exit first.
 * @param timeouts How long to wait.
 */
async function stopProcess(
	child: ServerProcess,
	connection: Connection,
	graceful: boolean,
	timeouts: ServerTimeouts,
): Promise<void> {
	const deadline = performance.now() + (graceful ? timeouts.stopMs : 0);
	if (graceful && child.exitCode === null) await askToExit(connection, timeouts);
	try {
		await child.stdin.end();
	} catch {
		// The process has closed its input already.
	}
	if (await endedWithin(child.exited, Math.max(0, deadline - performance.now()))) return;
	killGroup(child);
	await child.exited;
}

/**
 * Start a server in a checkout and initialize it.
 * @param start The command, the checkout, the pass's signal and the bounds.
 * @returns The server, or a rejection that says why it did not start.
 */
async function startServer(start: ServerStart): Promise<Server> {
	const child = Bun.spawn([...start.argv], {
		cwd: start.root,
		env: process.env,
		detached: true,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "ignore",
	});
	const closed = child.exited.then((code) => exitReason(code, child.signalCode));
	const connection = connect(child, closed, start.settings ?? {});
	let stopping: Promise<void> | undefined;
	/**
	 * Stop the process, once, and wait until it has ended.
	 * @param graceful Ask it to exit first, rather than kill it at once.
	 * @returns Once it has ended.
	 */
	const stop = (graceful: boolean): Promise<void> => {
		stopping ??= stopProcess(child, connection, graceful, start.timeouts);
		return stopping;
	};
	const bounds = { timeoutMs: start.timeouts.requestMs, signal: start.signal };
	try {
		const starting = { timeoutMs: start.timeouts.startMs, signal: start.signal };
		await connection.request("initialize", initializeParams(start.root, start.language), starting);
		connection.notify("initialized", {});
		await settle(connection, start.language, bounds);
	} catch (error) {
		await stop(false);
		throw error;
	}
	const open = opener(connection, start.language, bounds);
	return {
		/**
		 * Where the name at a position of a file is defined.
		 * @param file The file, absolute.
		 * @param position The position.
		 * @returns Each location in a file.
		 */
		definition: async (file, position) => {
			await open(file);
			const params = { textDocument: { uri: pathToFileURL(file).href }, position };
			return locationsOf(await connection.request("textDocument/definition", params, bounds));
		},
		/**
		 * The outline of a file.
		 * @param file The file, absolute.
		 * @returns Its symbols.
		 */
		outline: async (file) => {
			await open(file);
			const params = { textDocument: { uri: pathToFileURL(file).href } };
			return outlineOf(await connection.request("textDocument/documentSymbol", params, bounds));
		},
		stop,
	};
}

export { type DefinitionLocation, type Position, type Server, type ServerTimeouts, startServer };
