// Child processes the harness owns: run to completion with a ceiling, stop on
// cancellation, and never leave one behind. Every spawn goes through here so
// there is one answer to what a timed-out or cancelled process looks like.

import {
	PROCESS_GROUP_OBSERVATION_POLL_MS,
	SKILL_EVAL_CODEX_TERM_GRACE_MS,
} from "@/shared/timing/timing";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "@/runtime/codex-process/process-group";
import { listProcessGroupObservations } from "@/shared/process-observation";

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

/**
 * Waits for a delay.
 * @param ms The delay.
 * @returns A promise resolved after the delay.
 */
async function pause(ms: number): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Whether a promise settles before a delay passes.
 * @param settled The promise.
 * @param ms The delay.
 * @returns True when it settled first.
 */
async function settlesWithin(settled: Promise<unknown>, ms: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			settled.then(() => true),
			new Promise<false>((resolve) => {
				timer = setTimeout(() => resolve(false), ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

const groups = createCodexProcessGroupOperations();

/**
 * Wait until the recorded group has no runnable members, within one bound.
 * @param identity The captured group.
 * @param ms The bound.
 * @returns Whether every group member stopped.
 */
async function groupSettled(identity: CodexProcessGroupIdentity, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (groups.inspect(identity) !== "quiescent") {
		if (Date.now() >= deadline) return false;
		// oxlint-disable-next-line no-await-in-loop -- each group observation decides whether another poll is needed
		await pause(Math.min(PROCESS_GROUP_OBSERVATION_POLL_MS, deadline - Date.now()));
	}
	return true;
}

/**
 * Stop the captured group, including descendants that outlived its leader.
 * @param child The exact spawned child.
 * @param identity The identity captured immediately after its detached spawn.
 * @param graceMs How long each cleanup phase may take.
 */
async function stopGroup(
	child: Bun.Subprocess,
	identity: CodexProcessGroupIdentity,
	graceMs: number,
): Promise<void> {
	groups.signal(identity, "SIGTERM");
	if (!(await groupSettled(identity, graceMs))) {
		groups.signal(identity, "SIGKILL");
		if (!(await groupSettled(identity, graceMs))) {
			throw new Error(`Evaluation process group ${identity.pgid} did not stop after SIGKILL.`);
		}
	}
	if (!(await settlesWithin(child.exited, graceMs))) {
		throw new Error(`Evaluation process ${child.pid} did not reap after group cleanup.`);
	}
}

/**
 * Capture a detached child's identity and give it one idempotent cleanup owner.
 * @param child The freshly spawned, detached process.
 * @param graceMs How long each cleanup phase may take.
 * @returns The stop operation shared by normal completion and every failure path.
 */
async function ownProcess(
	child: Bun.Subprocess,
	graceMs = SKILL_EVAL_CODEX_TERM_GRACE_MS,
): Promise<{ readonly stop: () => Promise<void> }> {
	let identity: CodexProcessGroupIdentity;
	try {
		identity = groups.capture(child.pid);
	} catch (error) {
		if (
			(await settlesWithin(child.exited, 0)) &&
			listProcessGroupObservations(child.pid).every((member) => member.state === "zombie")
		) {
			// A short command can be reaped before capture; an empty group needs no signal.
			const stopped = Promise.resolve();
			/**
			 * Return the already proven completion without signalling a stale pid.
			 * @returns The completed cleanup.
			 */
			const stop = (): Promise<void> => stopped;
			return { stop };
		}
		// Without an identity only the exact child handle may be signalled.
		child.kill("SIGKILL");
		await settlesWithin(child.exited, graceMs);
		throw error;
	}
	let stopping: Promise<void> | undefined;
	/**
	 * Stop this captured group once, sharing cleanup with every caller.
	 * @returns The shared cleanup result.
	 */
	const stop = (): Promise<void> => (stopping ??= stopGroup(child, identity, graceMs));
	return { stop };
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
		if (!(await settlesWithin(output, SKILL_EVAL_CODEX_TERM_GRACE_MS))) {
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

export {
	ownProcess,
	pause,
	runProcess,
	sequentially,
	settlesWithin,
	type ProcessRequest,
	type ProcessResult,
};
