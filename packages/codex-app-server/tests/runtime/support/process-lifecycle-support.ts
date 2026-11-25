import type { ChildProcessByStdio } from "node:child_process";
import { expect, jest } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

/**
 * The reviewed Codex shutdown durations, which timing's tests pin, as the test numbers these
 * cases measure the fake clock against.
 */
const REVIEWED_SHUTDOWN_MS = Object.freeze({
	stdinEofGrace: 1000,
	termGrace: 5000,
	groupFreeze: 500,
	composedShutdown: 10_000,
});

const MICROTASK_HOPS = 16;
/**
 * The most a freeze takes past the TERM grace: two agreeing censuses a few short polls apart. A
 * test number, not the product's.
 */
const FREEZE_WINDOW_MS = 100;
/** Real time a real process is given to act on a signal between two driven timers. */
const PROCESS_EVENT_MS = 10;

type FakeChild = ChildProcessByStdio<PassThrough, PassThrough, PassThrough>;
type GroupStatus = "owned" | "quiescent" | "reused" | "unproven";

interface ManualScheduler {
	/** Time since the scheduler started, on the fake clock. */
	readonly now: () => number;
	/** Run something on the fake clock. */
	readonly schedule: (callback: () => void, delayMs: number) => void;
	/** Move the fake clock to the next timer and run it. */
	readonly runNext: () => boolean;
}

/**
 * Put the ambient timers on Bun's fake clock. Each test file restores real timers after each test.
 * @returns The fake clock, read from where it started.
 */
function manualScheduler(): ManualScheduler {
	jest.useFakeTimers();
	const start = Date.now();
	return Object.freeze({
		now: () => Date.now() - start,
		schedule: (callback: () => void, delayMs: number) => {
			setTimeout(callback, delayMs);
		},
		runNext: () => {
			if (jest.getTimerCount() === 0) return false;
			jest.advanceTimersToNextTimer();
			return true;
		},
	});
}

function fakeChild(pid: number, onKill: () => void): FakeChild {
	const child = new EventEmitter() as unknown as FakeChild;
	Object.assign(child, {
		pid,
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: () => {
			onKill();
			return true;
		},
	});
	return child;
}

function fakeLifecycle(autoSpawn = true, closeOnKill = true) {
	const clock = manualScheduler();
	let child: FakeChild | undefined;
	let nextPid = 40_000;
	let groupStatus: GroupStatus = "owned";
	let nextGroupStatus: GroupStatus = "owned";
	let captureFails = false;
	const signals: string[] = [];
	// The group's members and whether each can run: a child can join late, as a fork does.
	const members = new Map<number, "live" | "stopped">();
	let censuses = 0;
	let lateForkAtCensus: number | undefined;
	// A member SIGSTOP cannot stop, as one in a killable kernel wait reads, which KILL still ends.
	let holdUnstoppable = false;
	const unstoppable = new Set<number>();
	let membersAtKill: string[] = [];
	const dependencies = {
		spawn: () => {
			groupStatus = nextGroupStatus;
			nextGroupStatus = "owned";
			members.clear();
			members.set(nextPid + 1, "live");
			child = fakeChild(++nextPid, () => {
				if (closeOnKill) {
					child?.emit("close", null, "SIGKILL");
				}
			});
			if (autoSpawn) {
				queueMicrotask(() => child?.emit("spawn"));
			}
			return child!;
		},
		processGroup: {
			capture: (leaderPid: number) => {
				if (captureFails) {
					throw new Error("injected process-group capture failure");
				}
				return {
					leaderPid,
					pgid: leaderPid,
					leaderStartTime: `test-start-${leaderPid}`,
				};
			},
			inspect: () => groupStatus,
			members: (identity: { readonly pgid: number }) => {
				censuses += 1;
				if (censuses === lateForkAtCensus) members.set(identity.pgid + 1000, "live");
				if (holdUnstoppable && unstoppable.size === 0) {
					unstoppable.add(identity.pgid + 2000);
					members.set(identity.pgid + 2000, "live");
				}
				if (groupStatus === "quiescent") return [];
				return [...members].map(([pid, state]) => ({
					pid,
					parentPid: 1,
					pgid: identity.pgid,
					state,
					startTime: `test-start-${pid}`,
				}));
			},
			signal: (_identity: unknown, signal: "SIGTERM" | "SIGKILL" | "SIGSTOP" | "SIGCONT") => {
				signals.push(signal);
				if (signal === "SIGSTOP" || signal === "SIGCONT") {
					for (const pid of members.keys())
						if (!unstoppable.has(pid)) members.set(pid, signal === "SIGSTOP" ? "stopped" : "live");
				}
				if (signal === "SIGKILL")
					membersAtKill = [...members].map(([pid, state]) => `${pid}:${state}`);
				if (signal === "SIGKILL" && closeOnKill) {
					groupStatus = "quiescent";
					child?.emit("close", null, "SIGKILL");
				}
			},
		},
	};
	return Object.freeze({
		clock,
		dependencies,
		signals,
		/** A child joins the group at the n-th census, after the signal that stopped its parent. */
		forkAtCensus: (census: number) => {
			lateForkAtCensus = census;
		},
		/** A member that SIGSTOP never stops joins the group at the next census. */
		holdUnstoppableMember: () => {
			holdUnstoppable = true;
		},
		/** Each member of the group as it stood when KILL was sent. */
		membersAtKill: () => membersAtKill,
		child: () => child,
		markGroupQuiescent: () => {
			groupStatus = "quiescent";
		},
		closeChild: () => child?.emit("close", null, "SIGKILL"),
		quiesce: () => {
			groupStatus = "quiescent";
			child?.emit("close", null, "SIGKILL");
		},
		reuse: () => {
			groupStatus = "reused";
			nextGroupStatus = "reused";
		},
		failCapture: () => {
			captureFails = true;
		},
	});
}

async function driveManual<T>(
	promise: Promise<T>,
	clock: ManualScheduler,
	options: { readonly yieldToProcessEvents?: boolean } = {},
): Promise<T> {
	let settled = false;
	void promise.then(
		() => {
			settled = true;
			return undefined;
		},
		() => {
			settled = true;
			return undefined;
		},
	);
	for (let turn = 0; turn < 128; turn += 1) {
		// Enough microtask turns for the driven code's chained awaits to schedule their next timer.
		for (let hop = 0; hop < MICROTASK_HOPS; hop += 1) await Promise.resolve();
		if (settled) {
			break;
		}
		clock.runNext();
		if (options.yieldToProcessEvents) {
			// A real process needs real time to act on a signal, and its events a turn of the loop.
			Bun.sleepSync(PROCESS_EVENT_MS);
			await new Promise((resolve) => setImmediate(resolve));
		}
	}
	return promise;
}

/** KILL waits for the TERM grace, then for the freeze's few polls and no longer. */
function expectKillAfterGrace(killedAtMs: number, graceMs: number): void {
	expect(killedAtMs).toBeGreaterThanOrEqual(graceMs);
	expect(killedAtMs).toBeLessThanOrEqual(graceMs + FREEZE_WINDOW_MS);
}

export {
	type ManualScheduler,
	manualScheduler,
	fakeLifecycle,
	driveManual,
	expectKillAfterGrace,
	REVIEWED_SHUTDOWN_MS,
};
