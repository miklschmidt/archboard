import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import {
	canvasStartupOwnershipRecord,
	canvasStartupTerminalRecord,
	type CanvasStartupProtocolEvent,
} from "../../../shared/canvas-startup-terminal/index.js";
import { CANVAS_STARTUP_READINESS_MS } from "../../../shared/timing/timing.js";
import {
	completeFailedCanvasCleanup,
	createCanvasStartupProtocolReader,
	failedCanvasCleanupTiming,
	type FailedCanvasCleanupOperations,
} from "../canvas-startup-cleanup.js";

const group = Object.freeze({ leaderPid: 41, pgid: 41, leaderStartTime: "100" });

function ownership(): CanvasStartupProtocolEvent {
	return {
		kind: "record",
		record: {
			protocol: "archboard-canvas-startup-terminal/v2",
			kind: "ownership",
			canvasPid: 31,
			codexGroup: group,
		},
	};
}

function terminal(cleanup: "proven" | "unproven"): CanvasStartupProtocolEvent {
	return {
		kind: "record",
		record: {
			protocol: "archboard-canvas-startup-terminal/v2",
			kind: "terminal",
			canvasPid: 31,
			cleanup,
			message: cleanup === "proven" ? null : "injected cleanup failure",
		},
	};
}

function fixture(events: readonly (CanvasStartupProtocolEvent | null)[]) {
	let now = 0;
	let canvasLive = true;
	let canvasStopped = false;
	let groupLive = true;
	const canvasSignals: NodeJS.Signals[] = [];
	const groupSignals: NodeJS.Signals[] = [];
	const waits: number[] = [];
	const pending = [...events];
	const operations: FailedCanvasCleanupOperations = {
		now: () => now,
		wait: (ms) => {
			waits.push(ms);
			now += ms;
			return Promise.resolve();
		},
		canvasExited: () => !canvasLive,
		canvasStopped: () => canvasStopped,
		waitForCanvasExit: (maxWaitMs) => {
			waits.push(maxWaitMs);
			now += canvasLive ? maxWaitMs : 0;
			return Promise.resolve(!canvasLive);
		},
		signalCanvas: (signal) => {
			canvasSignals.push(signal);
			if (signal === "SIGSTOP") canvasStopped = true;
			if (signal === "SIGKILL") canvasLive = false;
		},
		inspectGroup: () => (groupLive ? "owned" : "quiescent"),
		signalGroup: (_identity, signal) => {
			groupSignals.push(signal);
			if (signal === "SIGKILL") groupLive = false;
		},
	};
	return {
		operations,
		protocol: {
			next: (maxWaitMs: number) => {
				const event = pending.shift();
				if (event !== undefined) return Promise.resolve(event);
				now += maxWaitMs;
				return Promise.resolve(null);
			},
		},
		canvasSignals,
		groupSignals,
		waits,
		state: () => ({ now, canvasLive, groupLive }),
	};
}

const timing = Object.freeze({ shutdownDeadlineMs: 80, applicationGraceMs: 30, pollMs: 10 });

describe("failed public canvas cleanup", () => {
	test("keeps production readiness and cleanup inside the reviewed boundaries", () => {
		expect(CANVAS_STARTUP_READINESS_MS).toBe(8_000);
		expect(failedCanvasCleanupTiming()).toEqual({
			shutdownDeadlineMs: 10_000,
			applicationGraceMs: 5_000,
			pollMs: 25,
		});
	});

	test("reads ordered ownership and terminal proof from the launcher pipe", async () => {
		const stream = new PassThrough();
		const reader = createCanvasStartupProtocolReader(stream);
		const owned = canvasStartupOwnershipRecord({ canvasPid: 31, codexGroup: group });
		const proven = canvasStartupTerminalRecord({
			canvasPid: 31,
			cleanupProven: true,
			message: "startup refused",
		});
		stream.write(`${JSON.stringify(owned)}\n${JSON.stringify(proven)}\n`);

		expect(await reader.next(10)).toEqual({ kind: "record", record: owned });
		expect(await reader.next(10)).toEqual({ kind: "record", record: proven });
		expect(reader.terminalMessage()).toBe("startup refused");
		expect(reader.failure()).toBeNull();
		reader.destroy();
	});

	test("turns malformed input and an early fd close into explicit events", async () => {
		const malformedStream = new PassThrough();
		const malformed = createCanvasStartupProtocolReader(malformedStream);
		malformedStream.write("not-json\n");
		expect(await malformed.next(10)).toMatchObject({ kind: "invalid" });
		expect(malformed.failure()).toBeInstanceOf(Error);
		malformed.destroy();

		const closedStream = new PassThrough();
		const closed = createCanvasStartupProtocolReader(closedStream);
		closedStream.destroy();
		expect(await closed.next(10)).toEqual({ kind: "closed" });
		expect(closed.failure()?.message).toContain("closed before terminal proof");
		closed.destroy();
	});

	test("accepts application proof before forcing only the outer canvas", async () => {
		const run = fixture([ownership(), terminal("proven")]);
		const result = await completeFailedCanvasCleanup({
			canvasPid: 31,
			protocol: run.protocol,
			operations: run.operations,
			timing,
		});

		expect(result).toEqual({ cleanup: "proven", owner: "application", group });
		expect(run.canvasSignals).toEqual(["SIGTERM", "SIGKILL"]);
		expect(run.groupSignals).toEqual([]);
		expect(run.state()).toEqual({ now: 0, canvasLive: false, groupLive: true });
	});

	for (const [name, finalEvent] of [
		["cleanup error", terminal("unproven")],
		["malformed protocol", { kind: "invalid", message: "bad record" }],
		["fd close", { kind: "closed" }],
		["protocol timeout", null],
	] as const) {
		test(`takes exact group ownership after ${name}`, async () => {
			const run = fixture([ownership(), finalEvent]);
			const result = await completeFailedCanvasCleanup({
				canvasPid: 31,
				protocol: run.protocol,
				operations: run.operations,
				timing,
			});

			expect(result).toEqual({ cleanup: "proven", owner: "launcher", group });
			expect(run.canvasSignals).toEqual(["SIGTERM", "SIGSTOP", "SIGKILL"]);
			expect(run.groupSignals).toEqual(["SIGTERM", "SIGKILL"]);
			expect(run.state()).toEqual({ now: 30, canvasLive: false, groupLive: false });
		});
	}

	test("cleans every sequential group transferred before readiness", async () => {
		const second = Object.freeze({ leaderPid: 42, pgid: 42, leaderStartTime: "200" });
		let now = 0;
		let canvasStopped = false;
		let canvasExited = false;
		const liveGroups = new Set<number>([group.pgid, second.pgid]);
		const signals: Array<[number, NodeJS.Signals]> = [];
		const events: Array<CanvasStartupProtocolEvent | null> = [
			ownership(),
			{
				kind: "record",
				record: canvasStartupOwnershipRecord({ canvasPid: 31, codexGroup: second }),
			},
			terminal("unproven"),
		];
		const result = await completeFailedCanvasCleanup({
			canvasPid: 31,
			protocol: { next: () => Promise.resolve(events.shift() ?? null) },
			timing,
			operations: {
				now: () => now,
				wait: (ms) => {
					now += ms;
					return Promise.resolve();
				},
				canvasExited: () => canvasExited,
				canvasStopped: () => canvasStopped,
				waitForCanvasExit: () => Promise.resolve(canvasExited),
				signalCanvas: (signal) => {
					if (signal === "SIGSTOP") canvasStopped = true;
					if (signal === "SIGKILL") canvasExited = true;
				},
				inspectGroup: (identity) => (liveGroups.has(identity.pgid) ? "owned" : "quiescent"),
				signalGroup: (identity, signal) => {
					signals.push([identity.pgid, signal]);
					if (signal === "SIGKILL") liveGroups.delete(identity.pgid);
				},
			},
		});

		expect(result).toEqual({ cleanup: "proven", owner: "launcher", group: second });
		expect(signals).toEqual([
			[41, "SIGTERM"],
			[42, "SIGTERM"],
			[41, "SIGKILL"],
			[42, "SIGKILL"],
		]);
		expect(liveGroups.size).toBe(0);
	});

	for (const terminalCase of [
		{
			name: "owned after TERM and KILL",
			inspect: () => "owned" as const,
			signalError: false,
			expectedSignals: ["SIGTERM", "SIGKILL"] as const,
			expectedState: "owned",
			expectedError: null,
		},
		{
			name: "reused",
			inspect: () => "reused" as const,
			signalError: false,
			expectedSignals: [] as const,
			expectedState: "reused",
			expectedError: null,
		},
		{
			name: "unproven",
			inspect: () => "unproven" as const,
			signalError: false,
			expectedSignals: [] as const,
			expectedState: "unproven",
			expectedError: null,
		},
		{
			name: "inspection error",
			inspect: () => {
				throw new Error("injected inspection failure");
			},
			signalError: false,
			expectedSignals: [] as const,
			expectedState: "inspection_error",
			expectedError: "injected inspection failure",
		},
		{
			name: "signalling error",
			inspect: () => "owned" as const,
			signalError: true,
			expectedSignals: ["SIGTERM"] as const,
			expectedState: "signalling_error",
			expectedError: "injected signalling failure",
		},
	] as const) {
		test(`keeps the stopped canvas after ${terminalCase.name}`, async () => {
			const run = fixture([ownership(), terminal("unproven")]);
			const groupSignals: NodeJS.Signals[] = [];
			const result = await completeFailedCanvasCleanup({
				canvasPid: 31,
				protocol: run.protocol,
				timing,
				operations: {
					...run.operations,
					inspectGroup: terminalCase.inspect,
					signalGroup: (_identity, signal) => {
						groupSignals.push(signal);
						if (terminalCase.signalError) throw new Error("injected signalling failure");
					},
				},
			});

			expect(result).toEqual({
				cleanup: "unproven",
				owner: "unknown",
				group,
				reason:
					`Canvas pid 31 remains stopped with Codex group leader pid 41, pgid 41, ` +
					`starttime 100 in state ${terminalCase.expectedState}.` +
					(terminalCase.expectedError === null ? "" : ` ${terminalCase.expectedError}.`),
			});
			expect(run.canvasSignals).toEqual(["SIGTERM", "SIGSTOP"]);
			expect(groupSignals).toEqual([...terminalCase.expectedSignals]);
			expect(run.state().canvasLive).toBeTrue();
		});
	}

	test("fails closed with exact outer identity when no group ownership arrived", async () => {
		const run = fixture([terminal("unproven")]);
		const result = await completeFailedCanvasCleanup({
			canvasPid: 31,
			protocol: run.protocol,
			operations: run.operations,
			timing,
		});

		expect(result).toEqual({
			cleanup: "unproven",
			owner: "unknown",
			group: null,
			reason:
				"The canvas reported failed cleanup before transferring an exact Codex group identity.",
		});
		expect(run.canvasSignals).toEqual(["SIGTERM"]);
		expect(run.groupSignals).toEqual([]);
		expect(run.state().canvasLive).toBeTrue();
	});
});
