import type { ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

type FakeChild = ChildProcessByStdio<PassThrough, PassThrough, PassThrough>;
type TestTimer = ReturnType<typeof setTimeout>;
type GroupStatus = "owned" | "quiescent" | "reused" | "unproven";

export interface ManualScheduler {
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => TestTimer;
	readonly cancel: (timer: TestTimer) => void;
	readonly runNext: () => boolean;
}

export function manualScheduler(): ManualScheduler {
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
		if (!next) return false;
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

export function fakeLifecycle(autoSpawn = true, closeOnKill = true) {
	const clock = manualScheduler();
	let child: FakeChild | undefined;
	let nextPid = 40_000;
	let groupStatus: GroupStatus = "owned";
	let nextGroupStatus: GroupStatus = "owned";
	let captureFails = false;
	const signals: string[] = [];
	const dependencies = {
		spawn: () => {
			groupStatus = nextGroupStatus;
			nextGroupStatus = "owned";
			child = fakeChild(++nextPid, () => {
				if (closeOnKill) child?.emit("close", null, "SIGKILL");
			});
			if (autoSpawn) queueMicrotask(() => child?.emit("spawn"));
			return child!;
		},
		processGroup: {
			capture: (leaderPid: number) => {
				if (captureFails) throw new Error("injected process-group capture failure");
				return {
					leaderPid,
					pgid: leaderPid,
					leaderStartTime: `test-start-${leaderPid}`,
				};
			},
			inspect: () => groupStatus,
			signal: (_identity: unknown, signal: "SIGTERM" | "SIGKILL") => {
				signals.push(signal);
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

export async function driveManual<T>(
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
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		if (settled) break;
		clock.runNext();
		if (options.yieldToProcessEvents) await new Promise<void>((resolve) => setImmediate(resolve));
	}
	return promise;
}
