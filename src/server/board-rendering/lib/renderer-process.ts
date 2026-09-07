import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { type ProcessIdentity } from "@/runtime/engine/process-group";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "@/runtime/codex-process/process-group";
import { BoardRendererError, isJsonRecord } from "@/server/board-rendering/lib/renderer-failure";

/** The checkout the renderer runs from, which is also its working directory. */
const repositoryRoot = resolve(import.meta.dir, "../../../..");

/** The process-group operations this owner proves its Chromium tree through. */
const processGroups = createCodexProcessGroupOperations();

// Chromium adds two long singleton-directory segments below TMPDIR. Keep the
// owned root short enough for Linux's Unix-socket path limit even when the
// canvas itself inherited a deeply nested test or launcher TMPDIR.
const rendererTempParent = process.platform === "linux" ? "/tmp" : tmpdir();

/** How long each process poll waits before looking again. */
const PROCESS_POLL_MS = 25;

/**
 * The local executable the renderer needs, refused by name when it is not
 * installed or the configured path does not exist.
 * @param name The executable.
 * @param explicit The configured path, when one was given.
 * @returns Its path.
 */
function requiredExecutable(name: string, explicit?: string): string {
	const candidate = explicit ?? Bun.which(name);
	if (!candidate || !existsSync(candidate)) {
		throw new BoardRendererError(
			`Board rendering requires the local ${name} executable. Install it or set the renderer path before starting Archboard.`,
			"preflight",
		);
	}
	return candidate;
}

/**
 * Reserve a loopback port for Chromium's private DevTools endpoint, by binding
 * it briefly and letting it go: the kernel will not hand the same port to
 * another listener in the moment between.
 * @returns The port.
 */
async function reserveLoopbackPort(): Promise<number> {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		/**
		 * Nothing calls the reservation; it exists to hold a port for an instant.
		 * @returns A bare acknowledgement.
		 */
		fetch: () => new Response("reserved"),
	});
	const port = server.port;
	await server.stop(true);
	if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0) {
		throw new Error("Board renderer could not reserve a loopback control port.");
	}
	return port;
}

/**
 * Whether a port this owner used is free again, which is how teardown proves
 * Chromium really let its control port go.
 * @param port The port, or null when none was reserved.
 * @returns True when it can be bound again.
 */
async function loopbackPortIsAvailable(port: number | null): Promise<boolean> {
	if (port === null) {
		return true;
	}
	let server: ReturnType<typeof Bun.serve> | null = null;
	try {
		server = Bun.serve({
			hostname: "127.0.0.1",
			port,
			/**
			 * Nothing calls the audit; binding at all is the answer.
			 * @returns A bare acknowledgement.
			 */
			fetch: () => new Response("audit"),
		});
		return true;
	} catch {
		return false;
	} finally {
		if (server) {
			await server.stop(true);
		}
	}
}

/**
 * One of a spawned child's output pipes, refusing a child that was not given
 * one.
 * @param stream The pipe as Bun reports it.
 * @returns The readable stream.
 */
function readablePipe(
	stream: ReadableStream<Uint8Array> | number | undefined,
): ReadableStream<Uint8Array> {
	if (!stream || typeof stream === "number") {
		throw new Error("Renderer child has no output pipe.");
	}
	return stream;
}

/** One captured output pipe: its tail, its failure, and when it finished. */
interface CapturedPipe {
	readonly settled: Promise<void>;
	tail(): string;
	error(): string | null;
}

const OUTPUT_TAIL_CHARACTERS = 8_192;

/**
 * Read one output pipe to its end, keeping only its tail, so a renderer
 * failure can quote what the process said without holding its whole output.
 * @param stream The pipe.
 * @returns The captured pipe.
 */
function capturePipe(stream: ReadableStream<Uint8Array>): CapturedPipe {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let output = "";
	let failure: string | null = null;
	/**
	 * Keep the tail of what has been read so far.
	 * @param chunk The text just decoded.
	 */
	const append = (chunk: string): void => {
		output = (output + chunk).slice(-OUTPUT_TAIL_CHARACTERS);
	};
	const settled = (async () => {
		try {
			for (;;) {
				// oxlint-disable-next-line no-await-in-loop -- a stream is read chunk by chunk, in order
				const next = await reader.read();
				if (next.done) {
					break;
				}
				append(decoder.decode(next.value, { stream: true }));
			}
			append(decoder.decode());
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	})();
	return Object.freeze({
		settled,
		/**
		 * The tail of what the pipe produced.
		 * @returns The text.
		 */
		tail: () => output,
		/**
		 * Why reading the pipe failed, if it did.
		 * @returns The message, or null.
		 */
		error: () => failure,
	});
}

/**
 * The error a cancelled piece of renderer work throws: whatever the caller
 * aborted with, as an Error.
 * @param signal The caller's signal.
 * @returns The error.
 */
function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new Error(
				signal.reason === undefined ? "Board renderer work was canceled." : String(signal.reason),
			);
}

/**
 * Run work that cannot itself be cancelled, and stop waiting for it when the
 * caller aborts.
 * @param work The work.
 * @param signal The caller's signal, when it has one.
 * @returns The work's result.
 */
async function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) {
		return await work;
	}
	signal.throwIfAborted();
	let cancel!: (reason: Error) => void;
	const canceled = new Promise<never>((_resolve, reject) => {
		cancel = reject;
	});
	/** Stop waiting, with the caller's own reason. */
	const onAbort = (): void => {
		cancel(abortReason(signal));
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		return await Promise.race([work, canceled]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}

/**
 * Whether a promise settles, either way, before a deadline: teardown needs to
 * know that something finished, not what it produced.
 * @param promise The promise.
 * @param deadline When to give up.
 * @returns True when it settled in time.
 */
async function settlesBefore(promise: Promise<unknown>, deadline: number): Promise<boolean> {
	return await Promise.race([
		promise.then(
			() => true,
			() => true,
		),
		Bun.sleep(Math.max(0, deadline - Date.now())).then(() => false),
	]);
}

/**
 * Wait until a process group is provably gone, giving up at once when it was
 * reused or was never proved to be this owner's.
 * @param identity The process group.
 * @param deadline When to give up.
 * @returns True when the group is gone.
 */
async function waitForGroupAbsence(
	identity: CodexProcessGroupIdentity,
	deadline: number,
): Promise<boolean> {
	while (Date.now() < deadline) {
		const state = processGroups.inspect(identity);
		if (state === "quiescent") {
			return true;
		}
		if (state === "reused" || state === "unproven") {
			return false;
		}
		// oxlint-disable-next-line no-await-in-loop -- the group is polled: each look waits for the previous pause
		await Bun.sleep(Math.min(PROCESS_POLL_MS, Math.max(0, deadline - Date.now())));
	}
	return processGroups.inspect(identity) === "quiescent";
}

/**
 * Whether a process group is gone, read directly rather than through the
 * process-group owner: the only answer left when a leader exited before its
 * group could be captured.
 * @param groupId The group's leader pid.
 * @returns True when nothing is left in it.
 */
function rawProcessGroupAbsent(groupId: number): boolean {
	try {
		process.kill(-groupId, 0);
		return false;
	} catch (error) {
		if (isJsonRecord(error) && error["code"] === "ESRCH") {
			return true;
		}
		throw error;
	}
}

/**
 * Capture the dedicated process group a spawned renderer leads, retrying
 * until it has one and refusing a leader whose identity changed meanwhile.
 * @param candidate The spawned leader.
 * @param deadline When to give up.
 * @returns The captured group.
 */
async function captureGroup(
	candidate: ProcessIdentity,
	deadline: number,
): Promise<CodexProcessGroupIdentity> {
	let failure: unknown = null;
	while (Date.now() < deadline) {
		try {
			const group = processGroups.capture(candidate.pid);
			if (group.leaderStartTime !== candidate.startTime) {
				throw new Error("Renderer process identity changed before group capture.");
			}
			return group;
		} catch (error) {
			failure = error;
			// oxlint-disable-next-line no-await-in-loop -- capture is retried in place: each attempt waits for the previous pause
			await Bun.sleep(Math.min(PROCESS_POLL_MS, Math.max(0, deadline - Date.now())));
		}
	}
	throw new Error(
		`Renderer process ${candidate.pid} did not establish its dedicated group: ${
			failure instanceof Error ? failure.message : String(failure)
		}.`,
		{ cause: failure },
	);
}

/**
 * Every process now under one leader, read from the process tree, so teardown
 * can prove each of them went.
 * @param pid The leader.
 * @returns The pids, lowest first.
 */
function ownedProcessIds(pid: number): number[] {
	const seen = new Set<number>();
	visitProcessTree(pid, seen);
	return [...seen].toSorted((left, right) => left - right);
}

/**
 * Walk one process and its children into the set, tolerating a child that
 * exits between the directory check and the process-tree read.
 * @param candidate The process.
 * @param seen Where to record it.
 */
function visitProcessTree(candidate: number, seen: Set<number>): void {
	if (seen.has(candidate) || !existsSync(`/proc/${candidate}`)) {
		return;
	}
	seen.add(candidate);
	for (const child of childProcessIds(candidate)) {
		visitProcessTree(child, seen);
	}
}

/**
 * The processes one process has now, read from its task's children list.
 * @param candidate The process.
 * @returns Its children's pids, or none when the list cannot be read.
 */
function childProcessIds(candidate: number): number[] {
	let listed: string;
	try {
		listed = readFileSync(`/proc/${candidate}/task/${candidate}/children`, "utf8");
	} catch {
		// A child can exit between the directory check and the process-tree read.
		return [];
	}
	return listed
		.trim()
		.split(/\s+/)
		.map((child) => Number(child))
		.filter((parsed) => Number.isInteger(parsed) && parsed > 0);
}

export {
	abortReason,
	abortable,
	capturePipe,
	captureGroup,
	loopbackPortIsAvailable,
	ownedProcessIds,
	processGroups,
	rawProcessGroupAbsent,
	readablePipe,
	rendererTempParent,
	repositoryRoot,
	requiredExecutable,
	reserveLoopbackPort,
	settlesBefore,
	waitForGroupAbsence,
};
export type { CapturedPipe };
