import type { ChildProcessByStdio } from "node:child_process";
import { expect } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { PROCESS_GROUP_OBSERVATION_POLL_MS } from "../../../shared/timing/timing.js";

const MICROTASK_HOPS = 16;
const FREEZE_POLLS = 4;

type FakeChild = ChildProcessByStdio<PassThrough, PassThrough, PassThrough>;
type TestTimer = ReturnType<typeof setTimeout>;
type GroupStatus = "owned" | "quiescent" | "reused" | "unproven";

interface ManualScheduler {
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => TestTimer;
	readonly cancel: (timer: TestTimer) => void;
	readonly runNext: () => boolean;
}

function manualScheduler(): ManualScheduler {
	let time = 0;
	let sequence = 0;
	const timers = new Map<
		TestTimer,
		{ readonly at: number; readonly order: number; readonly callback: () => void }
	>();
	const schedule = (callback: () => void, delayMs: number): TestTimer => {
		const timer = {} as TestTimer;
		timers.set(timer, { at: time + delayMs, order: sequence++, callback });
		return timer;
	};
	const cancel = (timer: TestTimer): void => {
		timers.delete(timer);
	};
	const runNext = (): boolean => {
		const next = [...timers.entries()].toSorted(
			([, left], [, right]) => left.at - right.at || left.order - right.order,
		)[0];
		if (!next) {
			return false;
		}
		timers.delete(next[0]);
		time = next[1].at;
		next[1].callback();
		return true;
	};
	return Object.freeze({ now: () => time, schedule, cancel, runNext });
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
						members.set(pid, signal === "SIGSTOP" ? "stopped" : "live");
				}
				if (signal === "SIGKILL")
					membersAtKill = [...members].map(([pid, state]) => `${pid}:${state}`);
				if (signal === "SIGKILL" && closeOnKill) {
					groupStatus = "quiescent";
					child?.emit("close", null, "SIGKILL");
				}
			},
		},
		now: clock.now,
		schedule: clock.schedule,
		cancel: clock.cancel,
	};
	return Object.freeze({
		clock,
		dependencies,
		signals,
		/** A child joins the group at the n-th census, after the signal that stopped its parent. */
		forkAtCensus: (census: number) => {
			lateForkAtCensus = census;
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
	for (let turn = 0; turn < 32; turn += 1) {
		// Enough microtask turns for the driven code's chained awaits to schedule their next timer.
		for (let hop = 0; hop < MICROTASK_HOPS; hop += 1) await Promise.resolve();
		if (settled) {
			break;
		}
		clock.runNext();
		if (options.yieldToProcessEvents) {
			// A real process needs real time to act on a signal: every driven poll
			// gives it the product's own poll interval, not one event-loop turn.
			await Bun.sleep(PROCESS_GROUP_OBSERVATION_POLL_MS);
		}
	}
	return promise;
}

/** KILL waits for the TERM grace, then for the freeze's few polls and no longer. */
function expectKillAfterGrace(killedAtMs: number, graceMs: number): void {
	expect(killedAtMs).toBeGreaterThanOrEqual(graceMs);
	expect(killedAtMs).toBeLessThanOrEqual(
		graceMs + FREEZE_POLLS * PROCESS_GROUP_OBSERVATION_POLL_MS,
	);
}

export { type ManualScheduler, manualScheduler, fakeLifecycle, driveManual, expectKillAfterGrace };
