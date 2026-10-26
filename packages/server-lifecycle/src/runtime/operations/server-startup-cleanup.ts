// Proving that a failed Archboard server start left nothing running.
//
// A start that died may have taken Codex process groups with it, or may not
// have. The server is asked first, because only it knows what it owned; if its
// own account does not arrive, this takes the groups it did report and drives
// them down itself, one bounded step at a time. Nothing here guesses: an
// unproven cleanup is said out loud, with the pids to inspect.

import type {
	ServerStartupProcessGroupIdentity,
	ServerStartupProtocolEvent,
	ServerStartupProtocolRecord,
} from "#runtime/protocol/server-startup-terminal.ts";
import type { CodexProcessGroupOperations } from "@archboard/process/codex-group";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import type {
	ServerStartupProtocolReader,
	FailedServerCleanupProtocol,
	FailedServerCleanupTiming,
} from "#runtime/protocol/server-startup-protocol.ts";
import {
	createServerStartupProtocolReader,
	failedServerCleanupTiming,
	validateTiming,
} from "#runtime/protocol/server-startup-protocol.ts";

/** What an inspection of a Codex process group found. */
type CodexProcessGroupInspection = ReturnType<CodexProcessGroupOperations["inspect"]>;
/** A signal a Codex process group can be sent. */
type CodexProcessGroupSignal = Parameters<CodexProcessGroupOperations["signal"]>[1];

interface FailedServerCleanupOperations {
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
	readonly serverExited: () => boolean;
	readonly serverStopped: () => boolean;
	readonly waitForServerExit: (maxWaitMs: number) => Promise<boolean>;
	readonly signalServer: (signal: NodeJS.Signals) => void;
	readonly inspectGroup: (
		identity: ServerStartupProcessGroupIdentity,
	) => CodexProcessGroupInspection;
	readonly signalGroup: (
		identity: ServerStartupProcessGroupIdentity,
		signal: CodexProcessGroupSignal,
	) => void;
}

type FailedServerCleanupResult =
	| {
			readonly cleanup: "proven";
			readonly owner: "application" | "launcher";
			readonly group: ServerStartupProcessGroupIdentity | null;
	  }
	| {
			readonly cleanup: "unproven";
			readonly owner: "unknown";
			readonly group: ServerStartupProcessGroupIdentity | null;
			readonly reason: string;
	  };

interface CompleteFailedServerCleanupOptions {
	readonly serverPid: number;
	readonly protocol: FailedServerCleanupProtocol;
	readonly operations: FailedServerCleanupOperations;
	readonly timing: FailedServerCleanupTiming;
}

/**
 * The unproven outcome, in one shape.
 * @param group The group the failure is about, or null when none was transferred.
 * @param reason What could not be proven.
 * @returns The unproven result.
 */
function unproven(
	group: ServerStartupProcessGroupIdentity | null,
	reason: string,
): FailedServerCleanupResult {
	return { cleanup: "unproven", owner: "unknown", group, reason };
}

/**
 * How much of a deadline is left.
 * @param now The clock.
 * @param deadlineAtMs The deadline on that clock.
 * @returns Milliseconds remaining, never negative.
 */
function remaining(now: () => number, deadlineAtMs: number): number {
	return Math.max(0, deadlineAtMs - now());
}

/**
 * Words for one Codex group that did not go quiet under a frozen server.
 * @param serverPid The frozen server.
 * @param identity The group.
 * @param state What inspection found, or which operation failed.
 * @returns The reason text.
 */
function stoppedServerGroup(
	serverPid: number,
	identity: ServerStartupProcessGroupIdentity,
	state: CodexProcessGroupInspection | "inspection_error" | "signalling_error",
): string {
	return (
		`Server pid ${serverPid} remains stopped with Codex group leader pid ${identity.leaderPid}, ` +
		`pgid ${identity.pgid}, starttime ${identity.leaderStartTime} in state ${state}.`
	);
}

/**
 * Words for several Codex groups that did not go quiet under a frozen server.
 * @param serverPid The frozen server.
 * @param states The groups and what inspection found for each.
 * @returns The reason text.
 */
function stoppedServerGroups(
	serverPid: number,
	states: readonly {
		readonly identity: ServerStartupProcessGroupIdentity;
		readonly status: CodexProcessGroupInspection;
	}[],
): string {
	return (
		`Server pid ${serverPid} remains stopped with non-quiescent Codex groups: ` +
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

/**
 * Kill the server process itself and wait for it to be reaped.
 * @param operations The process operations.
 * @param deadlineAtMs The absolute cleanup deadline.
 * @returns True when the server exited before the deadline.
 */
async function reapOuter(
	operations: FailedServerCleanupOperations,
	deadlineAtMs: number,
): Promise<boolean> {
	if (!operations.serverExited()) {
		operations.signalServer("SIGKILL");
	}
	if (operations.serverExited()) {
		return true;
	}
	const waitMs = remaining(operations.now, deadlineAtMs);
	return waitMs > 0 && (await operations.waitForServerExit(waitMs));
}

/**
 * Freeze the server so it can no longer signal the Codex groups the launcher
 * is about to take over.
 * @param operations The process operations.
 * @param timing The poll interval.
 * @param deadlineAtMs The absolute cleanup deadline.
 * @returns True once the server is exited or stopped.
 */
async function freezeServer(
	operations: FailedServerCleanupOperations,
	timing: FailedServerCleanupTiming,
	deadlineAtMs: number,
): Promise<boolean> {
	if (operations.serverExited()) {
		return true;
	}
	operations.signalServer("SIGSTOP");
	while (
		!operations.serverExited() &&
		!operations.serverStopped() &&
		operations.now() < deadlineAtMs
	) {
		// oxlint-disable-next-line no-await-in-loop -- polling the frozen state one interval at a time
		await operations.wait(Math.min(timing.pollMs, remaining(operations.now, deadlineAtMs)));
	}
	return operations.serverExited() || operations.serverStopped();
}

interface GroupState {
	readonly identity: ServerStartupProcessGroupIdentity;
	status: CodexProcessGroupInspection;
}

/** Which group and which operation a thrown inspection or signal was about. */
interface GroupOperationError {
	readonly identity: ServerStartupProcessGroupIdentity;
	readonly operation: "inspection" | "signalling";
	readonly cause: unknown;
}

/**
 * Inspect and signal the transferred Codex groups, remembering which group and
 * which operation any failure was about so the reason can name it.
 */
class TransferredGroups {
	readonly states: GroupState[] = [];

	/**
	 * Record the groups and inspect each once.
	 * @param operations The process operations.
	 * @param identities The groups the server transferred, in order.
	 */
	constructor(
		private readonly operations: FailedServerCleanupOperations,
		identities: readonly ServerStartupProcessGroupIdentity[],
	) {
		for (const identity of identities) {
			this.states.push({ identity, status: this.inspect(identity) });
		}
	}

	/**
	 * Inspect one group, naming it in the failure if the inspection throws.
	 * @param identity The group.
	 * @returns What the inspection found.
	 */
	private inspect(identity: ServerStartupProcessGroupIdentity): CodexProcessGroupInspection {
		try {
			return this.operations.inspectGroup(identity);
		} catch (cause) {
			throw new GroupOperationFailure({ identity, operation: "inspection", cause });
		}
	}

	/**
	 * Whether any group is still owned and live.
	 * @returns True while a group remains to be shut down.
	 */
	anyOwned(): boolean {
		return this.states.some((state) => state.status === "owned");
	}

	/** Re-inspect every group still marked owned. */
	reinspectOwned(): void {
		for (const state of this.states) {
			if (state.status === "owned") {
				state.status = this.inspect(state.identity);
			}
		}
	}

	/**
	 * Signal every group still marked owned.
	 * @param signal The signal to deliver.
	 */
	signalOwned(signal: CodexProcessGroupSignal): void {
		for (const state of this.states) {
			if (state.status !== "owned") {
				continue;
			}
			try {
				this.operations.signalGroup(state.identity, signal);
			} catch (cause) {
				throw new GroupOperationFailure({
					identity: state.identity,
					operation: "signalling",
					cause,
				});
			}
		}
	}

	/**
	 * Poll the owned groups until none remains or the bound passes.
	 * @param pollMs The poll interval.
	 * @param untilMs The absolute bound on this clock.
	 */
	async waitWhileOwned(pollMs: number, untilMs: number): Promise<void> {
		while (this.anyOwned() && this.operations.now() < untilMs) {
			// oxlint-disable-next-line no-await-in-loop -- polling group state one interval at a time
			await this.operations.wait(Math.min(pollMs, remaining(this.operations.now, untilMs)));
			this.reinspectOwned();
		}
	}
}

/** A group inspection or signal that threw, carrying which group and which operation. */
class GroupOperationFailure extends Error {
	/**
	 * Wrap the thrown value with the group it was about.
	 * @param detail The group, the operation, and what it threw.
	 */
	constructor(readonly detail: GroupOperationError) {
		super(errorMessage(detail.cause));
		this.name = "GroupOperationFailure";
	}
}

/**
 * Terminate the transferred groups: SIGTERM within the application grace,
 * then SIGKILL, then wait for quiescence until the deadline.
 * @param groups The transferred groups.
 * @param timing The poll interval.
 * @param applicationGraceAtMs When the polite phase ends.
 * @param deadlineAtMs The absolute cleanup deadline.
 */
async function terminateGroups(
	groups: TransferredGroups,
	timing: FailedServerCleanupTiming,
	applicationGraceAtMs: number,
	deadlineAtMs: number,
): Promise<void> {
	groups.signalOwned("SIGTERM");
	await groups.waitWhileOwned(timing.pollMs, applicationGraceAtMs);
	groups.signalOwned("SIGKILL");
	groups.reinspectOwned();
	await groups.waitWhileOwned(timing.pollMs, deadlineAtMs);
}

/**
 * The unproven outcome for groups that did not go quiet.
 * @param serverPid The frozen server.
 * @param notQuiescent The groups still live, in transfer order.
 * @returns The unproven result naming the first of them.
 */
function groupsStillLive(
	serverPid: number,
	notQuiescent: readonly GroupState[],
): FailedServerCleanupResult {
	const first = notQuiescent[0]!;
	return unproven(
		first.identity,
		notQuiescent.length === 1
			? stoppedServerGroup(serverPid, first.identity, first.status)
			: stoppedServerGroups(serverPid, notQuiescent),
	);
}

/**
 * Freeze the server and take over shutting down the Codex groups it transferred.
 * @param identities The groups the server reported owning, in order.
 * @param options The cleanup inputs.
 * @param applicationGraceAtMs When the polite phase ends.
 * @param deadlineAtMs The absolute cleanup deadline.
 * @returns Proven when every group is quiescent and the server reaped.
 */
async function takeCleanupOwnership(
	identities: readonly ServerStartupProcessGroupIdentity[],
	options: CompleteFailedServerCleanupOptions,
	applicationGraceAtMs: number,
	deadlineAtMs: number,
): Promise<FailedServerCleanupResult> {
	const { operations, timing } = options;
	const latest = identities.at(-1)!;
	if (!(await freezeServer(operations, timing, deadlineAtMs))) {
		return unproven(
			latest,
			`The launcher could not freeze server pid ${options.serverPid} before taking Codex group ${latest.pgid}.`,
		);
	}
	let groups: TransferredGroups;
	try {
		groups = new TransferredGroups(operations, identities);
		await terminateGroups(groups, timing, applicationGraceAtMs, deadlineAtMs);
	} catch (error) {
		const failed: GroupOperationError =
			error instanceof GroupOperationFailure
				? error.detail
				: { identity: identities[0]!, operation: "inspection", cause: error };
		return unproven(
			failed.identity,
			`${stoppedServerGroup(options.serverPid, failed.identity, `${failed.operation}_error`)} ${errorMessage(failed.cause)}.`,
		);
	}
	const notQuiescent = groups.states.filter((state) => state.status !== "quiescent");
	if (notQuiescent.length > 0) {
		return groupsStillLive(options.serverPid, notQuiescent);
	}
	if (!(await reapOuter(operations, deadlineAtMs))) {
		return unproven(
			latest,
			`The launcher proved every transferred Codex group quiescent but could not prove server pid ${options.serverPid} reaped before the cleanup deadline.`,
		);
	}
	return { cleanup: "proven", owner: "launcher", group: latest };
}

/**
 * Whether two group identities name the same group.
 * @param a One identity.
 * @param b The other.
 * @returns True when leader pid, pgid and start time all match.
 */
function sameGroup(
	a: ServerStartupProcessGroupIdentity,
	b: ServerStartupProcessGroupIdentity,
): boolean {
	return (
		a.leaderPid === b.leaderPid && a.pgid === b.pgid && a.leaderStartTime === b.leaderStartTime
	);
}

/** What one protocol event means for the wait on the server's own cleanup. */
type ProtocolStep =
	| { readonly kind: "continue" }
	| { readonly kind: "proven" }
	| { readonly kind: "stop"; readonly reason: string };

const CONTINUE: ProtocolStep = { kind: "continue" };

/**
 * The reason to stop reading, when the event is not a record this cleanup can
 * act on: the grace ran out, the protocol broke or closed, or the record named
 * some other server.
 * @param event The event, or null when the grace ran out.
 * @param serverPid The pid the records must name.
 * @returns The stop, or null when the event is a usable record.
 */
function eventStop(
	event: ServerStartupProtocolEvent | null,
	serverPid: number,
): ProtocolStep | null {
	if (event === null) {
		return { kind: "stop", reason: "The server cleanup proof timed out." };
	}
	if (event.kind === "invalid") {
		return { kind: "stop", reason: `The server cleanup protocol failed: ${event.message}` };
	}
	if (event.kind === "closed") {
		return { kind: "stop", reason: "The server cleanup protocol closed before terminal proof." };
	}
	if (event.record.serverPid !== serverPid) {
		return {
			kind: "stop",
			reason: `The server cleanup protocol named pid ${event.record.serverPid} instead of ${serverPid}.`,
		};
	}
	return null;
}

/**
 * Interpret one record the server wrote about its own cleanup.
 * @param record The record.
 * @param groups The groups reported so far; extended in place.
 * @returns Whether to keep waiting, stop with a reason, or accept the proof.
 */
function recordStep(
	record: ServerStartupProtocolRecord,
	groups: ServerStartupProcessGroupIdentity[],
): ProtocolStep {
	if (record.kind === "ownership") {
		const ownedGroup = record.codexGroup;
		if (!groups.some((group) => sameGroup(group, ownedGroup))) {
			groups.push(ownedGroup);
		}
		return CONTINUE;
	}
	if (record.cleanup === "proven") {
		return { kind: "proven" };
	}
	return {
		kind: "stop",
		reason: record.message ?? "The server reported that application cleanup was not proven.",
	};
}

/**
 * Interpret one protocol event, collecting transferred groups on the way.
 * @param event The event, or null when the grace ran out.
 * @param serverPid The pid the records must name.
 * @param groups The groups reported so far; extended in place.
 * @returns Whether to keep waiting, stop with a reason, or accept the proof.
 */
function protocolStep(
	event: ServerStartupProtocolEvent | null,
	serverPid: number,
	groups: ServerStartupProcessGroupIdentity[],
): ProtocolStep {
	const stop = eventStop(event, serverPid);
	if (stop) {
		return stop;
	}
	// eventStop returns a stop for every event that is not a usable record, so
	// anything reaching here has one.
	return event?.kind === "record"
		? recordStep(event.record, groups)
		: { kind: "stop", reason: "The server cleanup protocol closed before terminal proof." };
}

/**
 * Wait for the server to prove its own cleanup within the application grace.
 * @param options The cleanup inputs.
 * @param applicationGraceAtMs When the server's turn ends.
 * @param groups The groups reported so far; extended in place.
 * @returns Proven, or the reason the server's proof did not arrive.
 */
async function awaitApplicationProof(
	options: CompleteFailedServerCleanupOptions,
	applicationGraceAtMs: number,
	groups: ServerStartupProcessGroupIdentity[],
): Promise<Exclude<ProtocolStep, { kind: "continue" }>> {
	const { operations, protocol } = options;
	while (operations.now() < applicationGraceAtMs) {
		// oxlint-disable-next-line no-await-in-loop -- protocol events are consumed in order
		const event = await protocol.next(remaining(operations.now, applicationGraceAtMs));
		const step = protocolStep(event, options.serverPid, groups);
		if (step.kind !== "continue") {
			return step;
		}
	}
	return { kind: "stop", reason: "The server cleanup proof timed out." };
}

/**
 * The reason to report when the server neither proved cleanup nor transferred
 * a group.
 * @param transferReason Why the wait on the server's proof stopped.
 * @returns The reason text.
 */
function noGroupTransferred(transferReason: string): string {
	if (transferReason === "The server cleanup proof timed out.") {
		return "The server cleanup proof timed out before transferring an exact Codex group identity.";
	}
	if (transferReason.includes("cleanup")) {
		return "The server reported failed cleanup before transferring an exact Codex group identity.";
	}
	return `${transferReason} No exact Codex group identity was transferred.`;
}

/**
 * The result once the server has proved its own cleanup: proven, unless the
 * process itself is still there, which is a cleanup nobody has finished.
 * @param options The cleanup inputs.
 * @param groups The groups the server reported.
 * @param deadlineAtMs When the whole cleanup must be done.
 * @returns Proven, or the reason the pid outlived its own proof.
 */
async function afterApplicationProof(
	options: CompleteFailedServerCleanupOptions,
	groups: readonly ServerStartupProcessGroupIdentity[],
	deadlineAtMs: number,
): Promise<FailedServerCleanupResult> {
	if (!(await reapOuter(options.operations, deadlineAtMs))) {
		return unproven(
			groups.at(-1) ?? null,
			`The server proved application cleanup but pid ${options.serverPid} did not reap before the cleanup deadline.`,
		);
	}
	return { cleanup: "proven", owner: "application", group: groups.at(-1) ?? null };
}

/**
 * Finish one failed public start under one absolute deadline.
 *
 * The server owns cleanup until it proves completion or the launcher freezes it.
 * After SIGSTOP, only the launcher signals the transferred exact Codex group.
 * @param options The server pid, its protocol reader, the process operations and the timing.
 * @returns Whether cleanup was proven, by whom, and which group it concerned.
 */
async function completeFailedServerCleanup(
	options: CompleteFailedServerCleanupOptions,
): Promise<FailedServerCleanupResult> {
	validateTiming(options.timing);
	const { operations, timing } = options;
	const startedAtMs = operations.now();
	const deadlineAtMs = startedAtMs + timing.shutdownDeadlineMs;
	const applicationGraceAtMs = startedAtMs + timing.applicationGraceMs;
	const groups: ServerStartupProcessGroupIdentity[] = [];

	if (!operations.serverExited()) {
		operations.signalServer("SIGTERM");
	}
	const outcome = await awaitApplicationProof(options, applicationGraceAtMs, groups);
	if (outcome.kind === "proven") {
		return afterApplicationProof(options, groups, deadlineAtMs);
	}
	if (groups.length > 0) {
		return takeCleanupOwnership(groups, options, applicationGraceAtMs, deadlineAtMs);
	}
	return unproven(null, noGroupTransferred(outcome.reason));
}

export {
	type FailedServerCleanupTiming,
	failedServerCleanupTiming,
	type FailedServerCleanupProtocol,
	type ServerStartupProtocolReader,
	createServerStartupProtocolReader,
	type FailedServerCleanupOperations,
	type FailedServerCleanupResult,
	type CompleteFailedServerCleanupOptions,
	completeFailedServerCleanup,
};
