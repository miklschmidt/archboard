// Prepared human actions: capture the displayed link, acquire fresh authority
// once, revalidate the intent, and dispatch once. Everything is serialised
// behind one tail so a second action cannot slip between claim and dispatch.

import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import {
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchCommandIntent,
	type BrowserWorkbenchCommandResult,
	type BrowserWorkbenchCommandTarget,
} from "@/ui/workbench-transport/contract";
import {
	accountReady,
	commandSupported,
	leaseUsable,
} from "@/ui/workbench-transport/lib/capabilities";
import { command } from "@/ui/workbench-transport/lib/command";
import {
	capabilityContext,
	captureTarget,
	isCurrent,
	type TransportCore,
} from "@/ui/workbench-transport/lib/core";
import { claimLease } from "@/ui/workbench-transport/lib/lease";
import { transportFailure, type SocketRun } from "@/ui/workbench-transport/lib/socket-run";
import { sameCapturedLink, sameLeaseTarget } from "@/ui/workbench-transport/lib/targeting";

/**
 * Capture the displayed link, with exact authority when a lease is live.
 * @param core The core.
 * @returns The frozen intent.
 */
function captureCommandIntent(core: TransportCore): BrowserWorkbenchCommandIntent {
	const run = readyRun(core);
	const intent: BrowserWorkbenchCommandIntent = Object.freeze({
		capturedThreadLink: run.snapshot.threadLink,
		authority: leaseUsable(core.currentLease, core.now) ? captureTarget(core, run.run) : null,
	});
	core.capturedIntents.set(intent, { run: run.run, revision: run.run.intentRevision });
	return intent;
}

/** A run with a snapshot, once the account is readable. */
interface ReadyRun {
	readonly run: SocketRun;
	readonly snapshot: BrowserSnapshot;
}

/**
 * The run an action may be captured on, or a refusal.
 * @param core The core.
 * @returns The run and its snapshot.
 */
function readyRun(core: TransportCore): ReadyRun {
	const run = core.activeRun;
	const snapshot = run?.snapshot ?? null;
	if (run === null || snapshot === null || !accountReady(capabilityContext(core))) {
		throw transportFailure("not_ready", "The workbench is not ready to capture an action.");
	}
	return { run, snapshot };
}

/**
 * The run a captured intent still describes, or null when the workbench moved.
 * @param core The core.
 * @param intent The intent.
 * @returns The run, or null.
 */
function intentRun(core: TransportCore, intent: BrowserWorkbenchCommandIntent): SocketRun | null {
	const captured = core.capturedIntents.get(intent);
	if (captured === undefined || !isCurrent(core, captured.run)) {
		return null;
	}
	const { run, revision } = captured;
	if (run.intentRevision !== revision || run.snapshot === null) {
		return null;
	}
	return sameCapturedLink(intent.capturedThreadLink, run.snapshot.threadLink) ? run : null;
}

/**
 * The run a captured intent still describes, or a refusal.
 * @param core The core.
 * @param intent The intent.
 * @param commandName The command it will carry.
 * @returns The run.
 */
function validateIntent(
	core: TransportCore,
	intent: BrowserWorkbenchCommandIntent,
	commandName: BrowserCommandDraft["command"],
): SocketRun {
	const run = intentRun(core, intent);
	if (run === null) {
		throw transportFailure(
			"link_changed",
			"The workbench changed since this action was captured. Review the current conversation and act again.",
		);
	}
	if (!commandSupported(capabilityContext(core), commandName, true)) {
		throw transportFailure("not_ready", "The workbench is not ready for this action.");
	}
	return run;
}

/**
 * Acquire fresh authority for a prepared action; failure leaves it unsent.
 * @param core The core.
 * @returns The lease.
 */
async function acquireAuthority(core: TransportCore): Promise<BrowserCommandLease> {
	try {
		return await claimLease(core);
	} catch (error) {
		throw transportFailure(
			error instanceof BrowserWorkbenchTransportError ? error.code : "gateway_error",
			"The action was not sent because command authority could not be acquired.",
			undefined,
			{ outcome: "not_delivered", cause: error },
		);
	}
}

/**
 * Whether an intent's exact authority names the owner a lease was acquired for.
 * @param authority The intent's authority, or null when it had none.
 * @param acquired The lease just acquired.
 * @returns True when they agree, or when there was no exact authority.
 */
function sameOwner(
	authority: BrowserWorkbenchCommandTarget | null,
	acquired: BrowserCommandLease,
): boolean {
	return (
		authority === null ||
		(authority.childId === acquired.childId &&
			authority.epoch === acquired.epoch &&
			authority.paneId === acquired.paneId)
	);
}

/**
 * The target a prepared action dispatches under, once its authority is proven.
 * @param core The core.
 * @param intent The intent.
 * @param acquired The lease just acquired.
 * @param run The run.
 * @returns The target.
 */
function preparedTarget(
	core: TransportCore,
	intent: BrowserWorkbenchCommandIntent,
	acquired: BrowserCommandLease,
	run: SocketRun,
): BrowserWorkbenchCommandTarget {
	if (!sameOwner(intent.authority, acquired)) {
		throw transportFailure(
			"link_changed",
			"The command owner changed while acquiring authority. Review the current conversation and act again.",
		);
	}
	const target = captureTarget(core, run);
	if (!sameLeaseTarget(acquired, target)) {
		throw transportFailure(
			"lease_transferred",
			"Command authority changed before the action was sent.",
		);
	}
	return target;
}

/**
 * Whether a run has a command or lease request on the wire.
 * @param run The run.
 * @returns True while one is pending.
 */
function authorityBusy(run: SocketRun): boolean {
	return [...run.pending.values()].some(
		(pending) => pending.kind === "command" || pending.kind === "lease",
	);
}

/**
 * Run one prepared action: revalidate, acquire, revalidate, dispatch.
 * @param core The core.
 * @param requested The draft as captured at activation.
 * @param intent The intent.
 * @returns The result.
 */
async function runPrepared(
	core: TransportCore,
	requested: BrowserCommandDraft,
	intent: BrowserWorkbenchCommandIntent,
): Promise<BrowserWorkbenchCommandResult> {
	const run = validateIntent(core, intent, requested.command);
	if (authorityBusy(run)) {
		throw transportFailure(
			"not_ready",
			"Another browser command is still pending. Wait for it to finish.",
		);
	}
	core.preparingCommand = true;
	try {
		const acquired = await acquireAuthority(core);
		const current = validateIntent(core, intent, requested.command);
		const target = preparedTarget(core, intent, acquired, current);
		return await command(core, requested, target);
	} finally {
		core.preparingCommand = false;
	}
}

/**
 * A human action: acquire fresh authority once, revalidate, dispatch once.
 * @param core The core.
 * @param draft The draft.
 * @param requestedIntent The intent captured when the action was offered.
 * @returns The result.
 */
async function executeCommand(
	core: TransportCore,
	draft: BrowserCommandDraft,
	requestedIntent?: BrowserWorkbenchCommandIntent,
): Promise<BrowserWorkbenchCommandResult> {
	if (draft.command === "queueAdd" && requestedIntent === undefined) {
		throw transportFailure(
			"link_required",
			"A queued submission must name the conversation it was composed against.",
		);
	}
	const intent = requestedIntent ?? captureCommandIntent(core);
	// Clone at activation: edits to a form or reordered array during the claim
	// cannot change the operation the person requested.
	const requested = structuredClone(draft);
	validateIntent(core, intent, requested.command);
	const result = core.commandTail.then(() => runPrepared(core, requested, intent));
	core.commandTail = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

export { captureCommandIntent, executeCommand };
