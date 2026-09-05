import type {
	CanvasStartupProcessGroupIdentity,
	CanvasStartupProtocolEvent,
} from "../../shared/canvas-startup-terminal/index.js";
import { parseCanvasStartupProtocolRecord } from "../../shared/canvas-startup-terminal/index.js";
import type { Readable } from "node:stream";
import type {
	CodexProcessGroupInspection,
	CodexProcessGroupSignal,
} from "../codex-process/process-group.js";
import { CODEX_COMPOSED_SHUTDOWN_MS, CODEX_TERM_GRACE_MS } from "../../shared/timing/timing.js";

export interface FailedCanvasCleanupTiming {
	readonly shutdownDeadlineMs: number;
	readonly applicationGraceMs: number;
	readonly pollMs: number;
}

/** Production policy. Tests replace this function through a preload-only partial mock. */
export function failedCanvasCleanupTiming(): FailedCanvasCleanupTiming {
	return Object.freeze({
		shutdownDeadlineMs: CODEX_COMPOSED_SHUTDOWN_MS,
		applicationGraceMs: CODEX_TERM_GRACE_MS,
		pollMs: 25,
	});
}

export interface FailedCanvasCleanupProtocol {
	/** Null means no protocol event arrived within this slice of the one cleanup deadline. */
	readonly next: (maxWaitMs: number) => Promise<CanvasStartupProtocolEvent | null>;
}

export interface CanvasStartupProtocolReader extends FailedCanvasCleanupProtocol {
	readonly failure: () => Error | null;
	readonly terminalMessage: () => string | null;
	readonly destroy: () => void;
}

export function createCanvasStartupProtocolReader(
	stream: Readable | null,
): CanvasStartupProtocolReader {
	const events: CanvasStartupProtocolEvent[] = [];
	let buffer = "";
	let closed = stream === null;
	let protocolFailure: Error | null = null;
	let message: string | null = null;
	let terminalSeen = false;
	let waiter: {
		readonly resolve: (event: CanvasStartupProtocolEvent | null) => void;
		readonly timer: ReturnType<typeof setTimeout>;
	} | null = null;
	const push = (event: CanvasStartupProtocolEvent): void => {
		if (waiter !== null) {
			const current = waiter;
			waiter = null;
			clearTimeout(current.timer);
			current.resolve(event);
			return;
		}
		events.push(event);
	};
	const onData = (chunk: Buffer | string): void => {
		buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			try {
				const record = parseCanvasStartupProtocolRecord(line);
				if (record.kind === "terminal") {
					terminalSeen = true;
					message = record.message;
				}
				push({ kind: "record", record });
			} catch (error) {
				protocolFailure = error instanceof Error ? error : new Error(String(error));
				push({ kind: "invalid", message: protocolFailure.message });
			}
			newline = buffer.indexOf("\n");
		}
	};
	const onClose = (): void => {
		closed = true;
		if (!terminalSeen) {
			protocolFailure = new Error(
				"The canvas startup cleanup protocol closed before terminal proof.",
			);
		}
		push({ kind: "closed" });
	};
	stream?.on("data", onData);
	stream?.once("close", onClose);
	if (stream === null) {
		events.push({ kind: "closed" });
	}
	return {
		failure: () => protocolFailure,
		terminalMessage: () => message,
		next: (maxWaitMs) => {
			const ready = events.shift();
			if (ready !== undefined) {
				return Promise.resolve(ready);
			}
			if (closed) {
				return Promise.resolve({ kind: "closed" });
			}
			if (maxWaitMs <= 0) {
				return Promise.resolve(null);
			}
			if (waiter !== null) {
				return Promise.reject(
					new Error("The canvas startup cleanup protocol already has a waiter."),
				);
			}
			return new Promise((resolve) => {
				const timer = setTimeout(() => {
					waiter = null;
					resolve(null);
				}, maxWaitMs);
				waiter = { resolve, timer };
			});
		},
		destroy: () => {
			stream?.off("data", onData);
			stream?.off("close", onClose);
			stream?.destroy();
			if (waiter !== null) {
				const current = waiter;
				waiter = null;
				clearTimeout(current.timer);
				current.resolve(null);
			}
		},
	};
}

export interface FailedCanvasCleanupOperations {
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
	readonly canvasExited: () => boolean;
	readonly canvasStopped: () => boolean;
	readonly waitForCanvasExit: (maxWaitMs: number) => Promise<boolean>;
	readonly signalCanvas: (signal: NodeJS.Signals) => void;
	readonly inspectGroup: (
		identity: CanvasStartupProcessGroupIdentity,
	) => CodexProcessGroupInspection;
	readonly signalGroup: (
		identity: CanvasStartupProcessGroupIdentity,
		signal: CodexProcessGroupSignal,
	) => void;
}

export type FailedCanvasCleanupResult =
	| {
			readonly cleanup: "proven";
			readonly owner: "application" | "launcher";
			readonly group: CanvasStartupProcessGroupIdentity | null;
	  }
	| {
			readonly cleanup: "unproven";
			readonly owner: "unknown";
			readonly group: CanvasStartupProcessGroupIdentity | null;
			readonly reason: string;
	  };

export interface CompleteFailedCanvasCleanupOptions {
	readonly canvasPid: number;
	readonly protocol: FailedCanvasCleanupProtocol;
	readonly operations: FailedCanvasCleanupOperations;
	readonly timing: FailedCanvasCleanupTiming;
}

function remaining(now: () => number, deadlineAtMs: number): number {
	return Math.max(0, deadlineAtMs - now());
}

function stoppedCanvasGroup(
	canvasPid: number,
	identity: CanvasStartupProcessGroupIdentity,
	state: CodexProcessGroupInspection | "inspection_error" | "signalling_error",
): string {
	return (
		`Canvas pid ${canvasPid} remains stopped with Codex group leader pid ${identity.leaderPid}, ` +
		`pgid ${identity.pgid}, starttime ${identity.leaderStartTime} in state ${state}.`
	);
}

function stoppedCanvasGroups(
	canvasPid: number,
	states: readonly {
		readonly identity: CanvasStartupProcessGroupIdentity;
		readonly status: CodexProcessGroupInspection;
	}[],
): string {
	return (
		`Canvas pid ${canvasPid} remains stopped with non-quiescent Codex groups: ` +
		states
			.map(
				({ identity, status }) =>
					`leader pid ${identity.leaderPid}, pgid ${identity.pgid}, ` +
					`starttime ${identity.leaderStartTime} in state ${status}`,
			)
			.join("; ") +
		"."
	);
}

function validateTiming(timing: FailedCanvasCleanupTiming): void {
	for (const [name, value] of Object.entries(timing)) {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error(`Failed canvas cleanup ${name} must be a non-negative finite duration.`);
		}
	}
	if (timing.pollMs <= 0) {
		throw new Error("Failed canvas cleanup pollMs must be greater than zero.");
	}
	if (timing.applicationGraceMs > timing.shutdownDeadlineMs) {
		throw new Error("Failed canvas cleanup application grace cannot exceed its deadline.");
	}
}

async function reapOuter(
	operations: FailedCanvasCleanupOperations,
	deadlineAtMs: number,
): Promise<boolean> {
	if (!operations.canvasExited()) {
		operations.signalCanvas("SIGKILL");
	}
	if (operations.canvasExited()) {
		return true;
	}
	const waitMs = remaining(operations.now, deadlineAtMs);
	return waitMs > 0 && (await operations.waitForCanvasExit(waitMs));
}

async function takeCleanupOwnership(
	identities: readonly CanvasStartupProcessGroupIdentity[],
	options: CompleteFailedCanvasCleanupOptions,
	applicationGraceAtMs: number,
	deadlineAtMs: number,
): Promise<FailedCanvasCleanupResult> {
	const { operations, timing } = options;
	const latest = identities.at(-1)!;
	if (!operations.canvasExited()) {
		operations.signalCanvas("SIGSTOP");
		while (
			!operations.canvasExited() &&
			!operations.canvasStopped() &&
			operations.now() < deadlineAtMs
		) {
			await operations.wait(Math.min(timing.pollMs, remaining(operations.now, deadlineAtMs)));
		}
		if (!operations.canvasExited() && !operations.canvasStopped()) {
			return {
				cleanup: "unproven",
				owner: "unknown",
				group: latest,
				reason: `The launcher could not freeze canvas pid ${options.canvasPid} before taking Codex group ${latest.pgid}.`,
			};
		}
	}
	let states: Array<{
		readonly identity: CanvasStartupProcessGroupIdentity;
		status: CodexProcessGroupInspection;
	}>;
	let operation: "inspection" | "signalling" = "inspection";
	let currentIdentity = identities[0]!;
	try {
		states = [];
		for (const identity of identities) {
			currentIdentity = identity;
			operation = "inspection";
			states.push({ identity, status: operations.inspectGroup(identity) });
		}
		for (const state of states) {
			if (state.status !== "owned") {
				continue;
			}
			currentIdentity = state.identity;
			operation = "signalling";
			operations.signalGroup(state.identity, "SIGTERM");
			operation = "inspection";
		}
		while (
			states.some((state) => state.status === "owned") &&
			operations.now() < applicationGraceAtMs
		) {
			await operations.wait(
				Math.min(timing.pollMs, remaining(operations.now, applicationGraceAtMs)),
			);
			for (const state of states) {
				if (state.status !== "owned") {
					continue;
				}
				currentIdentity = state.identity;
				operation = "inspection";
				state.status = operations.inspectGroup(state.identity);
			}
		}
		for (const state of states) {
			if (state.status !== "owned") {
				continue;
			}
			currentIdentity = state.identity;
			operation = "signalling";
			operations.signalGroup(state.identity, "SIGKILL");
			operation = "inspection";
		}
		for (const state of states) {
			if (state.status !== "owned") {
				continue;
			}
			currentIdentity = state.identity;
			operation = "inspection";
			state.status = operations.inspectGroup(state.identity);
		}
		while (states.some((state) => state.status === "owned") && operations.now() < deadlineAtMs) {
			await operations.wait(Math.min(timing.pollMs, remaining(operations.now, deadlineAtMs)));
			for (const state of states) {
				if (state.status !== "owned") {
					continue;
				}
				currentIdentity = state.identity;
				operation = "inspection";
				state.status = operations.inspectGroup(state.identity);
			}
		}
	} catch (error) {
		return {
			cleanup: "unproven",
			owner: "unknown",
			group: currentIdentity,
			reason: `${stoppedCanvasGroup(options.canvasPid, currentIdentity, `${operation}_error`)} ${error instanceof Error ? error.message : String(error)}.`,
		};
	}
	const unproven = states.filter((state) => state.status !== "quiescent");
	if (unproven.length > 0) {
		const first = unproven[0]!;
		return {
			cleanup: "unproven",
			owner: "unknown",
			group: first.identity,
			reason:
				unproven.length === 1
					? stoppedCanvasGroup(options.canvasPid, first.identity, first.status)
					: stoppedCanvasGroups(options.canvasPid, unproven),
		};
	}
	if (!(await reapOuter(operations, deadlineAtMs))) {
		return {
			cleanup: "unproven",
			owner: "unknown",
			group: latest,
			reason: `The launcher proved every transferred Codex group quiescent but could not prove canvas pid ${options.canvasPid} reaped before the cleanup deadline.`,
		};
	}
	return { cleanup: "proven", owner: "launcher", group: latest };
}

/**
 * Finish one failed public start under one absolute deadline.
 *
 * The canvas owns cleanup until it proves completion or the launcher freezes it.
 * After SIGSTOP, only the launcher signals the transferred exact Codex group.
 */
export async function completeFailedCanvasCleanup(
	options: CompleteFailedCanvasCleanupOptions,
): Promise<FailedCanvasCleanupResult> {
	validateTiming(options.timing);
	const { operations, protocol, timing } = options;
	const startedAtMs = operations.now();
	const deadlineAtMs = startedAtMs + timing.shutdownDeadlineMs;
	const applicationGraceAtMs = startedAtMs + timing.applicationGraceMs;
	const groups: CanvasStartupProcessGroupIdentity[] = [];
	let transferReason = "The canvas cleanup proof timed out.";

	if (!operations.canvasExited()) {
		operations.signalCanvas("SIGTERM");
	}
	while (operations.now() < applicationGraceAtMs) {
		const event = await protocol.next(remaining(operations.now, applicationGraceAtMs));
		if (event === null) {
			break;
		}
		if (event.kind === "invalid") {
			transferReason = `The canvas cleanup protocol failed: ${event.message}`;
			break;
		}
		if (event.kind === "closed") {
			transferReason = "The canvas cleanup protocol closed before terminal proof.";
			break;
		}
		if (event.record.canvasPid !== options.canvasPid) {
			transferReason = `The canvas cleanup protocol named pid ${event.record.canvasPid} instead of ${options.canvasPid}.`;
			break;
		}
		if (event.record.kind === "ownership") {
			const ownedGroup = event.record.codexGroup;
			if (
				!groups.some(
					(group) =>
						group.leaderPid === ownedGroup.leaderPid &&
						group.pgid === ownedGroup.pgid &&
						group.leaderStartTime === ownedGroup.leaderStartTime,
				)
			) {
				groups.push(ownedGroup);
			}
			continue;
		}
		if (event.record.cleanup === "proven") {
			if (!(await reapOuter(operations, deadlineAtMs))) {
				return {
					cleanup: "unproven",
					owner: "unknown",
					group: groups.at(-1) ?? null,
					reason: `The canvas proved application cleanup but pid ${options.canvasPid} did not reap before the cleanup deadline.`,
				};
			}
			return { cleanup: "proven", owner: "application", group: groups.at(-1) ?? null };
		}
		transferReason =
			event.record.message ?? "The canvas reported that application cleanup was not proven.";
		break;
	}

	if (groups.length > 0) {
		return takeCleanupOwnership(groups, options, applicationGraceAtMs, deadlineAtMs);
	}
	return {
		cleanup: "unproven",
		owner: "unknown",
		group: null,
		reason:
			transferReason === "The canvas cleanup proof timed out."
				? "The canvas cleanup proof timed out before transferring an exact Codex group identity."
				: transferReason.includes("cleanup")
					? "The canvas reported failed cleanup before transferring an exact Codex group identity."
					: `${transferReason} No exact Codex group identity was transferred.`,
	};
}
