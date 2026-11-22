// Child processes the harness owns: run to completion with a ceiling, stop on
// cancellation, and never leave one behind. Every spawn goes through here so
// there is one answer to what a timed-out or cancelled process looks like.

import { type Polled, pollUntil, TimedOut, within } from "@archboard/timing";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "@archboard/process/codex-group";
import { listProcessGroupObservations } from "@archboard/process/observation";

/** How to run one process. */
interface ProcessRequest {
	readonly argv: readonly string[];
	readonly cwd: string;
	readonly env: Readonly<Record<string, string>>;
	readonly stdin?: string | undefined;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal | undefined;
	/** Called with each chunk of stdout as it arrives, for streams worth retaining live. */
	readonly onStdout?: ((chunk: string) => void) | undefined;
}

/** How it ended. */
interface ProcessResult {
	readonly exitCode: number | null;
	readonly signalCode: string | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
	readonly cancelled: boolean;
	readonly durationMs: number;
}

const groups = createCodexProcessGroupOperations();

/** How long each phase of stopping an owned group may take: a polled wait `ownProcess` accepts. */
type GroupStop = Extract<Polled, "skillEval.groupStop" | "skillEval.serverGroupStop">;

/**
 * Whether a process has already exited.
 * @param child The process.
 * @returns True once it has.
 */
function exited(child: Bun.Subprocess): boolean {
	return child.exitCode !== null || child.signalCode !== null;
}

/**
 * Whether a promise settles within the reaping bound.
 * @param settled The promise.
 * @returns True when it settled in time.
 */
async function reaped(settled: Promise<unknown>): Promise<boolean> {
	try {
		await within("skillEval.reap", () => settled);
		return true;
	} catch (error) {
		if (error instanceof TimedOut) return false;
		throw error;
	}
}

/**
 * Wait until the recorded group has no runnable members, within one bound.
 * @param identity The captured group.
 * @param stop How long it may take.
 * @returns Whether every group member stopped.
 */
async function groupSettled(
	identity: CodexProcessGroupIdentity,
	stop: GroupStop,
): Promise<boolean> {
	try {
		return await pollUntil(stop, () =>
			groups.inspect(identity) === "quiescent" ? true : undefined,
		);
	} catch (error) {
		if (error instanceof TimedOut) return false;
		throw error;
	}
}

/**
 * Stop the captured group, including descendants that outlived its leader.
 * @param child The exact spawned child.
 * @param identity The identity captured immediately after its detached spawn.
 * @param stop How long each cleanup phase may take.
 */
async function stopGroup(
	child: Bun.Subprocess,
	identity: CodexProcessGroupIdentity,
	stop: GroupStop,
): Promise<void> {
	groups.signal(identity, "SIGTERM");
	if (!(await groupSettled(identity, stop))) {
		groups.signal(identity, "SIGKILL");
		if (!(await groupSettled(identity, stop))) {
			throw new Error(`Evaluation process group ${identity.pgid} did not stop after SIGKILL.`);
		}
	}
	if (!(await reaped(child.exited))) {
		throw new Error(`Evaluation process ${child.pid} did not reap after group cleanup.`);
	}
}

/**
 * Capture a detached child's identity and give it one idempotent cleanup owner.
 * @param child The freshly spawned, detached process.
 * @param stop How long each cleanup phase may take.
 * @returns The stop operation shared by normal completion and every failure path.
 */
async function ownProcess(
	child: Bun.Subprocess,
	stop: GroupStop = "skillEval.groupStop",
): Promise<{ readonly stop: () => Promise<void> }> {
	let identity: CodexProcessGroupIdentity;
	try {
		identity = groups.capture(child.pid);
	} catch (error) {
		if (
			exited(child) &&
			listProcessGroupObservations(child.pid).every((member) => member.state === "zombie")
		) {
			// A short command can be reaped before capture; an empty group needs no signal.
			const stopped = Promise.resolve();
			/**
			 * Return the already proven completion without signalling a stale pid.
			 * @returns The completed cleanup.
			 */
			const alreadyStopped = (): Promise<void> => stopped;
			return { stop: alreadyStopped };
		}
		// Without an identity only the exact child handle may be signalled.
		child.kill("SIGKILL");
		await reaped(child.exited);
		throw error;
	}
	let stopping: Promise<void> | undefined;
	/**
	 * Stop this captured group once, sharing cleanup with every caller.
	 * @returns The shared cleanup result.
	 */
	const stopOnce = (): Promise<void> => (stopping ??= stopGroup(child, identity, stop));
	return { stop: stopOnce };
}

/**
 * Drains a readable stream into text, reporting chunks as they come.
 * @param stream The stream.
 * @param signal Ends a drain if cleanup cannot close its pipe.
 * @param onChunk Where to report each chunk.
 * @returns Everything read.
 */
async function drain(
	stream: ReadableStream<Uint8Array> | undefined,
	signal: AbortSignal,
	onChunk?: (chunk: string) => void,
): Promise<string> {
	if (stream === undefined) return "";
	const reader = stream.getReader();
	/** Cancel a pipe whose process could not be accounted for. */
	const cancel = (): void => {
		void reader.cancel().catch(() => undefined);
	};
	signal.addEventListener("abort", cancel, { once: true });
	const decoder = new TextDecoder();
	let text = "";
	try {
		let done = false;
		while (!done) {
			// oxlint-disable-next-line no-await-in-loop -- consume each stream chunk in order
			const chunk = await reader.read();
			done = chunk.done;
			const piece = decoder.decode(chunk.value, { stream: !done });
			text += piece;
			if (piece) onChunk?.(piece);
		}
		return text;
	} finally {
		signal.removeEventListener("abort", cancel);
		reader.releaseLock();
	}
}

/**
 * Runs items one after another, each starting after the previous settled,
 * for work that is sequential by contract.
 * @param items The items.
 * @param run What to do with each.
 * @returns Every result, in order.
 */
async function sequentially<T, R>(
	items: readonly T[],
	run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	return items.reduce<Promise<R[]>>(async (previous, item, index) => {
		const results = await previous;
		return [...results, await run(item, index)];
	}, Promise.resolve([]));
}

/**
 * Runs one process to completion, or to its ceiling, or to cancellation.
 * @param request What to run.
 * @returns How it ended and what it printed.
 */
async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
	const started = Date.now();
	const signal = request.signal ?? new AbortController().signal;
	signal.throwIfAborted();
	const child = Bun.spawn([...request.argv], {
		cwd: request.cwd,
		env: request.env,
		detached: true,
		stdin: request.stdin === undefined ? "ignore" : new TextEncoder().encode(request.stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	const owner = await ownProcess(child);
	let timedOut = false;
	let cancelled = false;
	const interrupted = Promise.withResolvers<void>();
	const timer = setTimeout(() => {
		timedOut = true;
		interrupted.resolve();
	}, request.timeoutMs);
	/** Stops the child because the run was cancelled. */
	const onAbort = (): void => {
		cancelled = true;
		interrupted.resolve();
	};
	signal.addEventListener("abort", onAbort, { once: true });
	if (signal.aborted) onAbort();
	const drains = new AbortController();
	const output = Promise.all([
		drain(child.stdout, drains.signal, request.onStdout),
		drain(child.stderr, drains.signal),
	]);
	void output.catch(interrupted.reject);
	try {
		await Promise.race([child.exited, interrupted.promise]);
		clearTimeout(timer);
		signal.removeEventListener("abort", onAbort);
		await owner.stop();
		if (!(await reaped(output))) {
			throw new Error(`Evaluation process ${child.pid} left an output pipe open after cleanup.`);
		}
		const [stdout, stderr] = await output;
		return {
			exitCode: child.exitCode,
			signalCode: child.signalCode,
			stdout,
			stderr,
			timedOut,
			cancelled,
			durationMs: Date.now() - started,
		};
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", onAbort);
		try {
			await owner.stop();
		} finally {
			drains.abort();
		}
	}
}

export { exited, ownProcess, runProcess, sequentially, type ProcessResult };
