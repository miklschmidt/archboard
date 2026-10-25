import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import {
	serverStartupOwnershipRecord,
	serverStartupTerminalRecord,
	type ServerStartupProtocolEvent,
} from "#runtime/protocol/server-startup-terminal.ts";
import { SERVER_LIFECYCLE_MS } from "@archboard/timing";
import {
	completeFailedServerCleanup,
	createServerStartupProtocolReader,
	failedServerCleanupTiming,
	type FailedServerCleanupOperations,
} from "#runtime/operations/server-startup-cleanup.ts";

const group = Object.freeze({ leaderPid: 41, pgid: 41, leaderStartTime: "100" });

function ownership(): ServerStartupProtocolEvent {
	return {
		kind: "record",
		record: {
			protocol: "archboard-server-startup-terminal/v2",
			kind: "ownership",
			serverPid: 31,
			codexGroup: group,
		},
	};
}

function terminal(cleanup: "proven" | "unproven"): ServerStartupProtocolEvent {
	return {
		kind: "record",
		record: {
			protocol: "archboard-server-startup-terminal/v2",
			kind: "terminal",
			serverPid: 31,
			cleanup,
			message: cleanup === "proven" ? null : "injected cleanup failure",
		},
	};
}

function fixture(events: readonly (ServerStartupProtocolEvent | null)[]) {
	let now = 0;
	let serverLive = true;
	let serverStopped = false;
	let groupLive = true;
	const serverSignals: NodeJS.Signals[] = [];
	const groupSignals: NodeJS.Signals[] = [];
	const waits: number[] = [];
	const pending = [...events];
	const operations: FailedServerCleanupOperations = {
		now: () => now,
		wait: (ms) => {
			waits.push(ms);
			now += ms;
			return Promise.resolve();
		},
		serverExited: () => !serverLive,
		serverStopped: () => serverStopped,
		waitForServerExit: (maxWaitMs) => {
			waits.push(maxWaitMs);
			now += serverLive ? maxWaitMs : 0;
			return Promise.resolve(!serverLive);
		},
		signalServer: (signal) => {
			serverSignals.push(signal);
			if (signal === "SIGSTOP") {
				serverStopped = true;
			}
			if (signal === "SIGKILL") {
				serverLive = false;
			}
		},
		inspectGroup: () => (groupLive ? "owned" : "quiescent"),
		signalGroup: (_identity, signal) => {
			groupSignals.push(signal);
			if (signal === "SIGKILL") {
				groupLive = false;
			}
		},
	};
	return {
		operations,
		protocol: {
			next: (maxWaitMs: number) => {
				const event = pending.shift();
				if (event !== undefined) {
					return Promise.resolve(event);
				}
				now += maxWaitMs;
				return Promise.resolve(null);
			},
		},
		serverSignals,
		groupSignals,
		waits,
		state: () => ({ now, serverLive, groupLive }),
	};
}

const timing = Object.freeze({ shutdownDeadlineMs: 80, applicationGraceMs: 30, pollMs: 10 });

describe("failed public server cleanup", () => {
	test("keeps production readiness and cleanup inside the reviewed boundaries", () => {
		expect(SERVER_LIFECYCLE_MS.startupReadiness).toBe(8_000);
		expect(failedServerCleanupTiming()).toEqual({
			shutdownDeadlineMs: 10_000,
			applicationGraceMs: 5_000,
			pollMs: 25,
		});
	});

	test("reads ordered ownership and terminal proof from the launcher pipe", async () => {
		const stream = new PassThrough();
		const reader = createServerStartupProtocolReader(stream);
		const owned = serverStartupOwnershipRecord({ serverPid: 31, codexGroup: group });
		const proven = serverStartupTerminalRecord({
			serverPid: 31,
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
		const malformed = createServerStartupProtocolReader(malformedStream);
		malformedStream.write("not-json\n");
		expect(await malformed.next(10)).toMatchObject({ kind: "invalid" });
		expect(malformed.failure()).toBeInstanceOf(Error);
		malformed.destroy();

		const closedStream = new PassThrough();
		const closed = createServerStartupProtocolReader(closedStream);
		closedStream.destroy();
		expect(await closed.next(10)).toEqual({ kind: "closed" });
		expect(closed.failure()?.message).toContain("closed before terminal proof");
		closed.destroy();
	});

	test("accepts application proof before forcing only the outer server", async () => {
		const run = fixture([ownership(), terminal("proven")]);
		const result = await completeFailedServerCleanup({
			serverPid: 31,
			protocol: run.protocol,
			operations: run.operations,
			timing,
		});

		expect(result).toEqual({ cleanup: "proven", owner: "application", group });
		expect(run.serverSignals).toEqual(["SIGTERM", "SIGKILL"]);
		expect(run.groupSignals).toEqual([]);
		expect(run.state()).toEqual({ now: 0, serverLive: false, groupLive: true });
	});

	for (const [name, finalEvent] of [
		["cleanup error", terminal("unproven")],
		["malformed protocol", { kind: "invalid", message: "bad record" }],
		["fd close", { kind: "closed" }],
		["protocol timeout", null],
	] as const) {
		test(`takes exact group ownership after ${name}`, async () => {
			const run = fixture([ownership(), finalEvent]);
			const result = await completeFailedServerCleanup({
				serverPid: 31,
				protocol: run.protocol,
				operations: run.operations,
				timing,
			});

			expect(result).toEqual({ cleanup: "proven", owner: "launcher", group });
			expect(run.serverSignals).toEqual(["SIGTERM", "SIGSTOP", "SIGKILL"]);
			expect(run.groupSignals).toEqual(["SIGTERM", "SIGKILL"]);
			expect(run.state()).toEqual({ now: 30, serverLive: false, groupLive: false });
		});
	}

	test("cleans every sequential group transferred before readiness", async () => {
		const second = Object.freeze({ leaderPid: 42, pgid: 42, leaderStartTime: "200" });
		let now = 0;
		let serverStopped = false;
		let serverExited = false;
		const liveGroups = new Set<number>([group.pgid, second.pgid]);
		const signals: Array<[number, NodeJS.Signals]> = [];
		const events: Array<ServerStartupProtocolEvent | null> = [
			ownership(),
			{
				kind: "record",
				record: serverStartupOwnershipRecord({ serverPid: 31, codexGroup: second }),
			},
			terminal("unproven"),
		];
		const result = await completeFailedServerCleanup({
			serverPid: 31,
			protocol: { next: () => Promise.resolve(events.shift() ?? null) },
			timing,
			operations: {
				now: () => now,
				wait: (ms) => {
					now += ms;
					return Promise.resolve();
				},
				serverExited: () => serverExited,
				serverStopped: () => serverStopped,
				waitForServerExit: () => Promise.resolve(serverExited),
				signalServer: (signal) => {
					if (signal === "SIGSTOP") {
						serverStopped = true;
					}
					if (signal === "SIGKILL") {
						serverExited = true;
					}
				},
				inspectGroup: (identity) => (liveGroups.has(identity.pgid) ? "owned" : "quiescent"),
				signalGroup: (identity, signal) => {
					signals.push([identity.pgid, signal]);
					if (signal === "SIGKILL") {
						liveGroups.delete(identity.pgid);
					}
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

	test("reports the exact earlier group whose signal fails", async () => {
		const second = Object.freeze({ leaderPid: 42, pgid: 42, leaderStartTime: "200" });
		let serverStopped = false;
		const serverSignals: NodeJS.Signals[] = [];
		const inspectedGroups: number[] = [];
		const groupSignals: Array<[number, NodeJS.Signals]> = [];
		const events: Array<ServerStartupProtocolEvent | null> = [
			ownership(),
			{
				kind: "record",
				record: serverStartupOwnershipRecord({ serverPid: 31, codexGroup: second }),
			},
			terminal("unproven"),
		];
		const result = await completeFailedServerCleanup({
			serverPid: 31,
			protocol: { next: () => Promise.resolve(events.shift() ?? null) },
			timing,
			operations: {
				now: () => 0,
				wait: () => Promise.resolve(),
				serverExited: () => false,
				serverStopped: () => serverStopped,
				waitForServerExit: () => Promise.resolve(false),
				signalServer: (signal) => {
					serverSignals.push(signal);
					if (signal === "SIGSTOP") {
						serverStopped = true;
					}
				},
				inspectGroup: (identity) => {
					inspectedGroups.push(identity.pgid);
					return identity === group ? "owned" : "quiescent";
				},
				signalGroup: (identity, signal) => {
					groupSignals.push([identity.pgid, signal]);
					if (identity === group && signal === "SIGTERM") {
						throw new Error("injected first-group signalling failure");
					}
				},
			},
		});

		expect(result).toEqual({
			cleanup: "unproven",
			owner: "unknown",
			group,
			reason:
				"Server pid 31 remains stopped with Codex group leader pid 41, pgid 41, " +
				"starttime 100 in state signalling_error. injected first-group signalling failure.",
		});
		expect(serverSignals).toEqual(["SIGTERM", "SIGSTOP"]);
		expect(inspectedGroups).toEqual([41, 42]);
		expect(groupSignals).toEqual([[41, "SIGTERM"]]);
	});

	test("reports every non-quiescent group identity and selects the first", async () => {
		const second = Object.freeze({ leaderPid: 42, pgid: 42, leaderStartTime: "200" });
		let serverStopped = false;
		const serverSignals: NodeJS.Signals[] = [];
		const events: Array<ServerStartupProtocolEvent | null> = [
			ownership(),
			{
				kind: "record",
				record: serverStartupOwnershipRecord({ serverPid: 31, codexGroup: second }),
			},
			terminal("unproven"),
		];
		const result = await completeFailedServerCleanup({
			serverPid: 31,
			protocol: { next: () => Promise.resolve(events.shift() ?? null) },
			timing,
			operations: {
				now: () => 0,
				wait: () => Promise.resolve(),
				serverExited: () => false,
				serverStopped: () => serverStopped,
				waitForServerExit: () => Promise.resolve(false),
				signalServer: (signal) => {
					serverSignals.push(signal);
					if (signal === "SIGSTOP") {
						serverStopped = true;
					}
				},
				inspectGroup: (identity) => (identity === group ? "reused" : "unproven"),
				signalGroup: () => {},
			},
		});

		expect(result).toEqual({
			cleanup: "unproven",
			owner: "unknown",
			group,
			reason:
				"Server pid 31 remains stopped with non-quiescent Codex groups: " +
				"leader pid 41, pgid 41, starttime 100 in state reused; " +
				"leader pid 42, pgid 42, starttime 200 in state unproven.",
		});
		expect(serverSignals).toEqual(["SIGTERM", "SIGSTOP"]);
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
		test(`keeps the stopped server after ${terminalCase.name}`, async () => {
			const run = fixture([ownership(), terminal("unproven")]);
			const groupSignals: NodeJS.Signals[] = [];
			const result = await completeFailedServerCleanup({
				serverPid: 31,
				protocol: run.protocol,
				timing,
				operations: {
					...run.operations,
					inspectGroup: terminalCase.inspect,
					signalGroup: (_identity, signal) => {
						groupSignals.push(signal);
						if (terminalCase.signalError) {
							throw new Error("injected signalling failure");
						}
					},
				},
			});

			expect(result).toEqual({
				cleanup: "unproven",
				owner: "unknown",
				group,
				reason:
					`Server pid 31 remains stopped with Codex group leader pid 41, pgid 41, ` +
					`starttime 100 in state ${terminalCase.expectedState}.` +
					(terminalCase.expectedError === null ? "" : ` ${terminalCase.expectedError}.`),
			});
			expect(run.serverSignals).toEqual(["SIGTERM", "SIGSTOP"]);
			expect(groupSignals).toEqual([...terminalCase.expectedSignals]);
			expect(run.state().serverLive).toBeTrue();
		});
	}

	test("fails closed with exact outer identity when no group ownership arrived", async () => {
		const run = fixture([terminal("unproven")]);
		const result = await completeFailedServerCleanup({
			serverPid: 31,
			protocol: run.protocol,
			operations: run.operations,
			timing,
		});

		expect(result).toEqual({
			cleanup: "unproven",
			owner: "unknown",
			group: null,
			reason:
				"The server reported failed cleanup before transferring an exact Codex group identity.",
		});
		expect(run.serverSignals).toEqual(["SIGTERM"]);
		expect(run.groupSignals).toEqual([]);
		expect(run.state().serverLive).toBeTrue();
	});
});
