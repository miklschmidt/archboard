// One language server process, from its start to its stop.
//
// It starts in the root of a checkout and is told that root is its one
// workspace, so it finds the project there itself. The client asks it only
// for definitions, and never asks it to build or to run a command. It reads
// each file from disk, as the code check does, so the client opens none.
// Stopping asks it to shut down and exit, and kills it if it has not ended
// within the bound; a cancelled pass kills it at once. Either way the stop
// returns only once the process has ended.

import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
	connect,
	type Connection,
	type ServerProcess,
} from "@/runtime/language-servers/lib/connection";
import type { LANGUAGE_SERVER_TIMEOUTS } from "@/shared/timing/timing";

/** How long a server is waited for. */
type ServerTimeouts = Readonly<Record<keyof typeof LANGUAGE_SERVER_TIMEOUTS, number>>;

/** A place in a file, as the protocol counts: from 0, in UTF-16 code units. */
interface Position {
	readonly line: number;
	readonly character: number;
}

/** Where a server says a definition is: an absolute path and a line from 1. */
interface DefinitionLocation {
	readonly path: string;
	readonly line: number;
}

/** A started server. */
interface Server {
	/** Where the name at a position of a file is defined; rejects when the server fails. */
	readonly definition: (file: string, position: Position) => Promise<DefinitionLocation[]>;
	/** Stop it, and return once its process has ended. */
	readonly stop: (graceful: boolean) => Promise<void>;
}

/** What one server needs to start. */
interface ServerStart {
	readonly argv: readonly [string, ...string[]];
	readonly root: string;
	readonly signal: AbortSignal;
	readonly timeouts: ServerTimeouts;
}

/** The start of a range, which is all of it the check reads. */
const RangeSchema = z.object({ start: z.object({ line: z.int().nonnegative() }) });

/** One location as a server spells it, a `LocationLink` or a `Location`, as a URI and a line from 0. */
const SpelledLocationSchema = z.union([
	z
		.object({ targetUri: z.string(), targetSelectionRange: RangeSchema })
		.transform((link) => ({ uri: link.targetUri, line: link.targetSelectionRange.start.line })),
	z
		.object({ uri: z.string(), range: RangeSchema })
		.transform((location) => ({ uri: location.uri, line: location.range.start.line })),
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
			? [{ path: fileURLToPath(each.uri), line: each.line + 1 }]
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
 * The `initialize` request: the checkout as the one workspace, and a client
 * that asks for definitions and nothing else.
 * @param root The checkout.
 * @returns Its params.
 */
function initializeParams(root: string): object {
	const uri = pathToFileURL(root).href;
	return {
		processId: process.pid,
		clientInfo: { name: "archboard" },
		rootUri: uri,
		workspaceFolders: [{ uri, name: "checkout" }],
		capabilities: { general: { positionEncodings: ["utf-16"] } },
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
 * Stop a process: ask it to exit, unless it must die at once, then kill it if
 * it has not ended within the bound.
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
	if (graceful && child.exitCode === null) await askToExit(connection, timeouts);
	try {
		await child.stdin.end();
	} catch {
		// The process has closed its input already.
	}
	if (await endedWithin(child.exited, graceful ? timeouts.stopMs : 0)) return;
	child.kill("SIGKILL");
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
		stdin: "pipe",
		stdout: "pipe",
		stderr: "ignore",
	});
	const closed = child.exited.then((code) => exitReason(code, child.signalCode));
	const connection = connect(child, closed);
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
	try {
		const bounds = { timeoutMs: start.timeouts.startMs, signal: start.signal };
		await connection.request("initialize", initializeParams(start.root), bounds);
	} catch (error) {
		await stop(false);
		throw error;
	}
	connection.notify("initialized", {});
	const bounds = { timeoutMs: start.timeouts.requestMs, signal: start.signal };
	return {
		/**
		 * Where the name at a position of a file is defined.
		 * @param file The file, absolute.
		 * @param position The position.
		 * @returns Each location in a file.
		 */
		definition: async (file, position) => {
			const params = { textDocument: { uri: pathToFileURL(file).href }, position };
			return locationsOf(await connection.request("textDocument/definition", params, bounds));
		},
		stop,
	};
}

export { type DefinitionLocation, type Position, type Server, type ServerTimeouts, startServer };
