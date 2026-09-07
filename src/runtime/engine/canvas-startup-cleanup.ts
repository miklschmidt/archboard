// Proving that a failed canvas start left nothing running.
//
// A start that died may have taken Codex process groups with it, or may not
// have. The canvas is asked first, because only it knows what it owned; if its
// own account does not arrive, this takes the groups it did report and drives
// them down itself, one bounded step at a time. Nothing here guesses: an
// unproven cleanup is said out loud, with the pids to inspect.

import type {
	CanvasStartupProcessGroupIdentity,
	CanvasStartupProtocolEvent,
	CanvasStartupProtocolRecord,
} from "@/shared/canvas-startup-terminal";
import type {
	CodexProcessGroupInspection,
	CodexProcessGroupSignal,
} from "@/runtime/codex-process/process-group";
import { errorMessage } from "@/runtime/engine/lib/thrown-error";
import type {
	CanvasStartupProtocolReader,
	FailedCanvasCleanupProtocol,
	FailedCanvasCleanupTiming,
} from "@/runtime/engine/lib/canvas-startup-protocol";
import {
	createCanvasStartupProtocolReader,
	failedCanvasCleanupTiming,
	validateTiming,
} from "@/runtime/engine/lib/canvas-startup-protocol";

interface FailedCanvasCleanupOperations {
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

type FailedCanvasCleanupResult =
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

interface CompleteFailedCanvasCleanupOptions {
	readonly canvasPid: number;
	readonly protocol: FailedCanvasCleanupProtocol;
	readonly operations: FailedCanvasCleanupOperations;
	readonly timing: FailedCanvasCleanupTiming;
}

/**
 * The unproven outcome, in one shape.
 * @param group The group the failure is about, or null when none was transferred.
 * @param reason What could not be proven.
 * @returns The unproven result.
 */
function unproven(
	group: CanvasStartupProcessGroupIdentity | null,
	reason: string,
): FailedCanvasCleanupResult {
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
 * Words for one Codex group that did not go quiet under a frozen canvas.
 * @param canvasPid The frozen canvas.
 * @param identity The group.
 * @param state What inspection found, or which operation failed.
 * @returns The reason text.
 */
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

/**
 * Words for several Codex groups that did not go quiet under a frozen canvas.
 * @param canvasPid The frozen canvas.
 * @param states The groups and what inspection found for each.
 * @returns The reason text.
 */
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

/**
 * Kill the canvas process itself and wait for it to be reaped.
 * @param operations The process operations.
 * @param deadlineAtMs The absolute cleanup deadline.
 * @returns True when the canvas exited before the deadline.
 */
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

/**
 * Freeze the canvas so it can no longer signal the Codex groups the launcher
 * is about to take over.
 * @param operations The process operations.
 * @param timing The poll interval.
 * @param deadlineAtMs The absolute cleanup deadline.
 * @returns True once the canvas is exited or stopped.
 */
async function freezeCanvas(
	operations: FailedCanvasCleanupOperations,
	timing: FailedCanvasCleanupTiming,
	deadlineAtMs: number,
): Promise<boolean> {
	if (operations.canvasExited()) {
		return true;
	}
	operations.signalCanvas("SIGSTOP");
	while (
		!operations.canvasExited() &&
		!operations.canvasStopped() &&
		operations.now() < deadlineAtMs
	) {
		// oxlint-disable-next-line no-await-in-loop -- polling the frozen state one interval at a time
		await operations.wait(Math.min(timing.pollMs, remaining(operations.now, deadlineAtMs)));
	}
	return operations.canvasExited() || operations.canvasStopped();
}

interface GroupState {
	readonly identity: CanvasStartupProcessGroupIdentity;
	status: CodexProcessGroupInspection;
}

/** Which group and which operation a thrown inspection or signal was about. */
interface GroupOperationError {
	readonly identity: CanvasStartupProcessGroupIdentity;
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
	 * @param identities The groups the canvas transferred, in order.
	 */
	constructor(
		private readonly operations: FailedCanvasCleanupOperations,
		identities: readonly CanvasStartupProcessGroupIdentity[],
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
	private inspect(identity: CanvasStartupProcessGroupIdentity): CodexProcessGroupInspection {
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
	timing: FailedCanvasCleanupTiming,
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
 * @param canvasPid The frozen canvas.
 * @param notQuiescent The groups still live, in transfer order.
 * @returns The unproven result naming the first of them.
 */
function groupsStillLive(
	canvasPid: number,
	notQuiescent: readonly GroupState[],
): FailedCanvasCleanupResult {
	const first = notQuiescent[0]!;
	return unproven(
		first.identity,
		notQuiescent.length === 1
			? stoppedCanvasGroup(canvasPid, first.identity, first.status)
			: stoppedCanvasGroups(canvasPid, notQuiescent),
	);
}

/**
 * Freeze the canvas and take over shutting down the Codex groups it transferred.
 * @param identities The groups the canvas reported owning, in order.
 * @param options The cleanup inputs.
 * @param applicationGraceAtMs When the polite phase ends.
 * @param deadlineAtMs The absolute cleanup deadline.
 * @returns Proven when every group is quiescent and the canvas reaped.
 */
async function takeCleanupOwnership(
	identities: readonly CanvasStartupProcessGroupIdentity[],
	options: CompleteFailedCanvasCleanupOptions,
	applicationGraceAtMs: number,
	deadlineAtMs: number,
): Promise<FailedCanvasCleanupResult> {
	const { operations, timing } = options;
	const latest = identities.at(-1)!;
	if (!(await freezeCanvas(operations, timing, deadlineAtMs))) {
		return unproven(
			latest,
			`The launcher could not freeze canvas pid ${options.canvasPid} before taking Codex group ${latest.pgid}.`,
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
			`${stoppedCanvasGroup(options.canvasPid, failed.identity, `${failed.operation}_error`)} ${errorMessage(failed.cause)}.`,
		);
	}
	const notQuiescent = groups.states.filter((state) => state.status !== "quiescent");
	if (notQuiescent.length > 0) {
		return groupsStillLive(options.canvasPid, notQuiescent);
	}
	if (!(await reapOuter(operations, deadlineAtMs))) {
		return unproven(
			latest,
			`The launcher proved every transferred Codex group quiescent but could not prove canvas pid ${options.canvasPid} reaped before the cleanup deadline.`,
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
	a: CanvasStartupProcessGroupIdentity,
	b: CanvasStartupProcessGroupIdentity,
): boolean {
	return (
		a.leaderPid === b.leaderPid && a.pgid === b.pgid && a.leaderStartTime === b.leaderStartTime
	);
}

/** What one protocol event means for the wait on the canvas's own cleanup. */
type ProtocolStep =
	| { readonly kind: "continue" }
	| { readonly kind: "proven" }
	| { readonly kind: "stop"; readonly reason: string };

const CONTINUE: ProtocolStep = { kind: "continue" };

/**
 * The reason to stop reading, when the event is not a record this cleanup can
 * act on: the grace ran out, the protocol broke or closed, or the record named
 * some other canvas.
 * @param event The event, or null when the grace ran out.
 * @param canvasPid The pid the records must name.
 * @returns The stop, or null when the event is a usable record.
 */
function eventStop(
	event: CanvasStartupProtocolEvent | null,
	canvasPid: number,
): ProtocolStep | null {
	if (event === null) {
		return { kind: "stop", reason: "The canvas cleanup proof timed out." };
	}
	if (event.kind === "invalid") {
		return { kind: "stop", reason: `The canvas cleanup protocol failed: ${event.message}` };
	}
	if (event.kind === "closed") {
		return { kind: "stop", reason: "The canvas cleanup protocol closed before terminal proof." };
	}
	if (event.record.canvasPid !== canvasPid) {
		return {
			kind: "stop",
			reason: `The canvas cleanup protocol named pid ${event.record.canvasPid} instead of ${canvasPid}.`,
		};
	}
	return null;
}

/**
 * Interpret one record the canvas wrote about its own cleanup.
 * @param record The record.
 * @param groups The groups reported so far; extended in place.
 * @returns Whether to keep waiting, stop with a reason, or accept the proof.
 */
function recordStep(
	record: CanvasStartupProtocolRecord,
	groups: CanvasStartupProcessGroupIdentity[],
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
		reason: record.message ?? "The canvas reported that application cleanup was not proven.",
	};
}

/**
 * Interpret one protocol event, collecting transferred groups on the way.
 * @param event The event, or null when the grace ran out.
 * @param canvasPid The pid the records must name.
 * @param groups The groups reported so far; extended in place.
 * @returns Whether to keep waiting, stop with a reason, or accept the proof.
 */
function protocolStep(
	event: CanvasStartupProtocolEvent | null,
	canvasPid: number,
	groups: CanvasStartupProcessGroupIdentity[],
): ProtocolStep {
	const stop = eventStop(event, canvasPid);
	if (stop) {
		return stop;
	}
	// eventStop returns a stop for every event that is not a usable record, so
	// anything reaching here has one.
	return event?.kind === "record"
		? recordStep(event.record, groups)
		: { kind: "stop", reason: "The canvas cleanup protocol closed before terminal proof." };
}

/**
 * Wait for the canvas to prove its own cleanup within the application grace.
 * @param options The cleanup inputs.
 * @param applicationGraceAtMs When the canvas's turn ends.
 * @param groups The groups reported so far; extended in place.
 * @returns Proven, or the reason the canvas's proof did not arrive.
 */
async function awaitApplicationProof(
	options: CompleteFailedCanvasCleanupOptions,
	applicationGraceAtMs: number,
	groups: CanvasStartupProcessGroupIdentity[],
): Promise<Exclude<ProtocolStep, { kind: "continue" }>> {
	const { operations, protocol } = options;
	while (operations.now() < applicationGraceAtMs) {
		// oxlint-disable-next-line no-await-in-loop -- protocol events are consumed in order
		const event = await protocol.next(remaining(operations.now, applicationGraceAtMs));
		const step = protocolStep(event, options.canvasPid, groups);
		if (step.kind !== "continue") {
			return step;
		}
	}
	return { kind: "stop", reason: "The canvas cleanup proof timed out." };
}

/**
 * The reason to report when the canvas neither proved cleanup nor transferred
 * a group.
 * @param transferReason Why the wait on the canvas's proof stopped.
 * @returns The reason text.
 */
function noGroupTransferred(transferReason: string): string {
	if (transferReason === "The canvas cleanup proof timed out.") {
		return "The canvas cleanup proof timed out before transferring an exact Codex group identity.";
	}
	if (transferReason.includes("cleanup")) {
		return "The canvas reported failed cleanup before transferring an exact Codex group identity.";
	}
	return `${transferReason} No exact Codex group identity was transferred.`;
}

/**
 * The result once the canvas has proved its own cleanup: proven, unless the
 * process itself is still there, which is a cleanup nobody has finished.
 * @param options The cleanup inputs.
 * @param groups The groups the canvas reported.
 * @param deadlineAtMs When the whole cleanup must be done.
 * @returns Proven, or the reason the pid outlived its own proof.
 */
async function afterApplicationProof(
	options: CompleteFailedCanvasCleanupOptions,
	groups: readonly CanvasStartupProcessGroupIdentity[],
	deadlineAtMs: number,
): Promise<FailedCanvasCleanupResult> {
	if (!(await reapOuter(options.operations, deadlineAtMs))) {
		return unproven(
			groups.at(-1) ?? null,
			`The canvas proved application cleanup but pid ${options.canvasPid} did not reap before the cleanup deadline.`,
		);
	}
	return { cleanup: "proven", owner: "application", group: groups.at(-1) ?? null };
}

/**
 * Finish one failed public start under one absolute deadline.
 *
 * The canvas owns cleanup until it proves completion or the launcher freezes it.
 * After SIGSTOP, only the launcher signals the transferred exact Codex group.
 * @param options The canvas pid, its protocol reader, the process operations and the timing.
 * @returns Whether cleanup was proven, by whom, and which group it concerned.
 */
async function completeFailedCanvasCleanup(
	options: CompleteFailedCanvasCleanupOptions,
): Promise<FailedCanvasCleanupResult> {
	validateTiming(options.timing);
	const { operations, timing } = options;
	const startedAtMs = operations.now();
	const deadlineAtMs = startedAtMs + timing.shutdownDeadlineMs;
	const applicationGraceAtMs = startedAtMs + timing.applicationGraceMs;
	const groups: CanvasStartupProcessGroupIdentity[] = [];

	if (!operations.canvasExited()) {
		operations.signalCanvas("SIGTERM");
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
	type FailedCanvasCleanupTiming,
	failedCanvasCleanupTiming,
	type FailedCanvasCleanupProtocol,
	type CanvasStartupProtocolReader,
	createCanvasStartupProtocolReader,
	type FailedCanvasCleanupOperations,
	type FailedCanvasCleanupResult,
	type CompleteFailedCanvasCleanupOptions,
	completeFailedCanvasCleanup,
};
