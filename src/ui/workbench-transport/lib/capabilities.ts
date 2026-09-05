// What the workbench may ask for: the capability matrix over readiness, link,
// lease and pending approvals. `supportsCommand` and the dispatch guard read
// the same predicates, so the two cannot disagree about what is answerable.

import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	BrowserCommandName,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchTransportErrorCode,
} from "@/ui/workbench-transport/contract";
import {
	ACCOUNT_COMMANDS,
	EXACT_AUTHORITY_COMMANDS,
	QUEUE_COMMANDS,
	THREAD_LINK_COMMANDS,
	hasUsableApproval,
	hasUsableDynamicApproval,
} from "@/ui/workbench-transport/lib/targeting";

const ACCOUNT_READINESS: ReadonlySet<BrowserSnapshot["readiness"]["state"]> = new Set([
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);

/** The facts the matrix is judged on, read at the moment of asking. */
interface CapabilityContext {
	/** The reduced snapshot of the current run, or null without one. */
	readonly snapshot: BrowserSnapshot | null;
	/** True while the current run's socket is open. */
	readonly connected: boolean;
	/** True while the published state is a readiness state, not stale or reconnecting. */
	readonly readinessPublished: boolean;
	readonly lease: BrowserCommandLease | null;
	readonly now: () => number;
}

/**
 * Whether the account can be read: a published readiness state that names an
 * account-capable child.
 * @param context The facts.
 * @returns True when account calls may go out.
 */
function accountReady(context: CapabilityContext): boolean {
	return (
		context.connected &&
		context.readinessPublished &&
		context.snapshot !== null &&
		ACCOUNT_READINESS.has(context.snapshot.readiness.state)
	);
}

/**
 * Whether a lease is active and unexpired.
 * @param lease The lease, or null.
 * @param now The clock.
 * @returns True when usable.
 */
function leaseUsable(lease: BrowserCommandLease | null, now: () => number): boolean {
	return lease?.state === "active" && lease.expiresAtMs > now();
}

/**
 * Whether the snapshot is thread-capable.
 * @param snapshot The snapshot, or null.
 * @returns True when thread commands may go out.
 */
function threadCapable(snapshot: BrowserSnapshot | null): boolean {
	return snapshot?.readiness.state === "thread_capable";
}

/**
 * Whether the snapshot is thread-capable with an executable link.
 * @param snapshot The snapshot, or null.
 * @returns True when thread commands may target the link.
 */
function linkExecutable(snapshot: BrowserSnapshot | null): boolean {
	return threadCapable(snapshot) && snapshot?.threadLink.state === "executable";
}

type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;

/**
 * Whether a command against the executable link is supported.
 * @param context The facts, with a thread-capable executable link.
 * @param snapshot The snapshot.
 * @param link The snapshot's executable link.
 * @param command The command.
 * @param prepare True when the caller will acquire fresh authority first.
 * @returns True when supported.
 */
function linkCommandSupported(
	context: CapabilityContext,
	snapshot: BrowserSnapshot,
	link: ExecutableLink,
	command: BrowserCommandName,
	prepare: boolean,
): boolean {
	if (command === "approvalRespond") {
		return hasUsableApproval(snapshot, prepare ? link : context.lease, context.now);
	}
	return !QUEUE_COMMANDS.has(command) || snapshot.queue.status !== "unavailable";
}

/**
 * Whether a thread-scoped command is supported once the workbench is thread-capable.
 * @param context The facts.
 * @param command The command.
 * @param prepare True when the caller will acquire fresh authority first.
 * @returns True when supported.
 */
function threadCommandSupported(
	context: CapabilityContext,
	command: BrowserCommandName,
	prepare: boolean,
): boolean {
	const { snapshot } = context;
	if (THREAD_LINK_COMMANDS.has(command)) {
		return true;
	}
	if (command === "dynamicApprovalRespond") {
		return hasUsableDynamicApproval(snapshot, context.lease, context.now);
	}
	const executable = executableSnapshot(snapshot);
	return (
		executable !== null &&
		linkCommandSupported(context, executable.snapshot, executable.link, command, prepare)
	);
}

/** A snapshot whose link is executable, with that link narrowed. */
interface ExecutableSnapshot {
	readonly snapshot: BrowserSnapshot;
	readonly link: ExecutableLink;
}

/**
 * The snapshot with its executable link, or null when the link is not executable.
 * @param snapshot The snapshot, or null.
 * @returns The pair, or null.
 */
function executableSnapshot(snapshot: BrowserSnapshot | null): ExecutableSnapshot | null {
	const link = snapshot?.threadLink;
	if (snapshot === null || link?.state !== "executable") {
		return null;
	}
	return { snapshot, link };
}

/**
 * Whether the authority a command needs is present: a usable lease, or the
 * promise of a fresh one for a command that may be prepared.
 * @param context The facts.
 * @param command The command.
 * @param prepare True when the caller will acquire fresh authority first.
 * @returns True when authority is or will be available.
 */
function authorityAvailable(
	context: CapabilityContext,
	command: BrowserCommandName,
	prepare: boolean,
): boolean {
	if (!prepare) {
		return leaseUsable(context.lease, context.now);
	}
	return !EXACT_AUTHORITY_COMMANDS.has(command);
}

/**
 * Whether a command may be sent now.
 * @param context The facts.
 * @param command The command.
 * @param prepare True when the caller will acquire fresh authority first; exact-authority commands are never prepared.
 * @returns True when supported.
 */
function commandSupported(
	context: CapabilityContext,
	command: BrowserCommandName,
	prepare = false,
): boolean {
	if (!accountReady(context) || !authorityAvailable(context, command, prepare)) {
		return false;
	}
	if (ACCOUNT_COMMANDS.has(command)) {
		return true;
	}
	return threadCapable(context.snapshot) && threadCommandSupported(context, command, prepare);
}

/**
 * Whether the workbench is usable at all for a disabled-command explanation.
 * @param context The facts.
 * @returns True when the account, lease and link are all live.
 */
function workbenchUsable(context: CapabilityContext): boolean {
	return (
		accountReady(context) &&
		leaseUsable(context.lease, context.now) &&
		linkExecutable(context.snapshot)
	);
}

/**
 * Why a disabled command is disabled, when the workbench is otherwise usable:
 * an approval or queue row that is no longer the one on screen reads very
 * differently from a workbench that is not ready at all.
 * @param context The facts.
 * @param command The command.
 * @returns The refusal code.
 */
function disabledCommandCode(
	context: CapabilityContext,
	command: BrowserCommandName,
): BrowserWorkbenchTransportErrorCode {
	if (!workbenchUsable(context)) {
		return "not_ready";
	}
	return subjectRefusalCode(command, context.snapshot?.queue.status === "unavailable");
}

/**
 * The refusal for a command whose subject, not the workbench, is the problem.
 * @param command The command.
 * @param queueUnavailable Whether the queue is unavailable.
 * @returns The refusal code.
 */
function subjectRefusalCode(
	command: BrowserCommandName,
	queueUnavailable: boolean,
): BrowserWorkbenchTransportErrorCode {
	if (command === "approvalRespond") {
		return "approval_not_pending";
	}
	if (command === "dynamicApprovalRespond") {
		return "dynamic_approval_not_pending";
	}
	return QUEUE_COMMANDS.has(command) && queueUnavailable ? "link_changed" : "not_ready";
}

/**
 * Whether a live lease can be renewed or released. Deliberately not gated on
 * the published readiness the way account and command are: renewing and
 * releasing are lease-lifecycle calls to the gateway, and a stale-snapshot
 * recovery is exactly when a person must be able to keep or hand back the
 * lease. The capability owner asserts it.
 * @param context The facts.
 * @returns True while the socket is open and the lease usable.
 */
function leaseLiveOnWire(context: CapabilityContext): boolean {
	return context.connected && leaseUsable(context.lease, context.now);
}

/**
 * The command predicate over one set of facts: a command is supported when
 * fresh authority can be prepared for it, unless it needs the exact lease it
 * already holds.
 * @param context The facts.
 * @returns The predicate.
 */
function supportsCommandIn(context: CapabilityContext): (command: BrowserCommandName) => boolean {
	return (command) =>
		context.snapshot !== null &&
		commandSupported(context, command, !EXACT_AUTHORITY_COMMANDS.has(command));
}

/**
 * The capability matrix.
 * @param context The facts.
 * @returns The frozen capabilities.
 */
function buildCapabilities(context: CapabilityContext): BrowserWorkbenchCapabilities {
	const { connected, snapshot } = context;
	const account = accountReady(context);
	const leaseLive = leaseLiveOnWire(context);
	const canCommand = connected && context.readinessPublished && linkExecutable(snapshot);
	return Object.freeze({
		connected,
		readiness: snapshot?.readiness.state ?? null,
		canReadAccount: account,
		canClaimLease: account,
		canRenewLease: leaseLive,
		canReleaseLease: leaseLive,
		canCommand,
		canThreadCommands: canCommand,
		canRealtime: canCommand && leaseLive,
		supportsCommand: supportsCommandIn(context),
	});
}

export {
	accountReady,
	buildCapabilities,
	commandSupported,
	disabledCommandCode,
	leaseUsable,
	type CapabilityContext,
};
