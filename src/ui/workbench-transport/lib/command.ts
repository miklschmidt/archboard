// The command path: refuse what the state does not support, bind the command
// to the target it was composed against, refuse a subject that moved, then
// send it once and read its result.

import type { BrowserCommand, BrowserCommandLease } from "@/shared/codex-browser-model";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
} from "@/ui/workbench-transport/contract";
import {
	commandSupported,
	disabledCommandCode,
	leaseUsable,
} from "@/ui/workbench-transport/lib/capabilities";
import {
	capabilityContext,
	captureLease,
	captureTarget,
	requireRun,
	type TransportCore,
} from "@/ui/workbench-transport/lib/core";
import { stopIncompatible } from "@/ui/workbench-transport/lib/lease";
import { reconcileAfterUnsequencedResult, request } from "@/ui/workbench-transport/lib/session";
import {
	messageOf,
	transportFailure,
	type SocketRun,
} from "@/ui/workbench-transport/lib/socket-run";
import {
	QUEUE_COMMANDS,
	approvalMatchesTarget,
	commandAnchoredToLink,
	dynamicApprovalMatchesTarget,
	queueCommandRefusal,
	sameCommandTarget,
} from "@/ui/workbench-transport/lib/targeting";
import { parseBrowserCommandResult } from "@/ui/workbench-transport/lib/wire-results";
import { BrowserWorkbenchWireError } from "@/ui/workbench-transport/lib/wire-identity";

/**
 * The wire command: the draft plus the authority it runs under.
 * @param draft The draft.
 * @param target The authority and captured link.
 * @returns The command.
 */
function fullCommand(
	draft: BrowserCommandDraft,
	target: BrowserWorkbenchCommandTarget,
): BrowserCommand {
	return {
		...draft,
		kind: "browser_command",
		commandId: target.commandId,
		paneId: target.paneId,
		childId: target.childId,
		epoch: target.epoch,
	};
}

/**
 * Refuse a command the current state does not support, surfacing lease
 * expiry first when that is the reason.
 * @param core The core.
 * @param run The run.
 * @param draft The draft.
 */
function refuseUnsupported(core: TransportCore, run: SocketRun, draft: BrowserCommandDraft): void {
	const context = capabilityContext(core);
	if (commandSupported(context, draft.command)) {
		return;
	}
	if (core.currentLease !== null && !leaseUsable(core.currentLease, core.now)) {
		captureLease(core, run);
	}
	throw transportFailure(
		disabledCommandCode(context, draft.command),
		"The requested browser command is not enabled in the current workbench state.",
	);
}

/**
 * Enforce the target a caller captured when it offered the action, and
 * require one for the one command nothing else anchors.
 * @param draft The draft.
 * @param requested The caller's target, if any.
 * @param target The target now.
 */
function enforceRequestedTarget(
	draft: BrowserCommandDraft,
	requested: BrowserWorkbenchCommandTarget | undefined,
	target: BrowserWorkbenchCommandTarget,
): void {
	if (requested !== undefined && !sameCommandTarget(requested, target)) {
		throw transportFailure(
			"link_changed",
			"The workbench target changed since this command was captured.",
			{ commandId: requested.commandId },
		);
	}
	if (draft.command === "queueAdd" && requested === undefined) {
		throw transportFailure(
			"link_required",
			"A queued submission must name the workbench target it was composed against.",
			{ commandId: target.commandId },
		);
	}
	if (!commandAnchoredToLink(draft, target.capturedThreadLink)) {
		throw transportFailure(
			"link_changed",
			"The command target no longer matches the captured workbench link.",
			{ commandId: target.commandId },
		);
	}
}

/**
 * Refuse an approval answer whose approval is no longer pending for the target.
 * @param core The core.
 * @param run The run.
 * @param draft The draft.
 * @param target The target.
 * @param wire The wire command.
 */
function enforceApprovalSubject(
	core: TransportCore,
	run: SocketRun,
	draft: BrowserCommandDraft,
	target: BrowserWorkbenchCommandTarget,
	wire: BrowserCommand,
): void {
	if (
		draft.command === "dynamicApprovalRespond" &&
		!dynamicApprovalMatchesTarget(run.snapshot, draft, target, wire, core.now)
	) {
		throw transportFailure(
			"dynamic_approval_not_pending",
			"The dynamic approval is no longer pending for the captured browser target.",
			{ commandId: target.commandId },
		);
	}
	if (
		draft.command === "approvalRespond" &&
		!approvalMatchesTarget(run.snapshot, draft, target, core.now)
	) {
		throw transportFailure(
			"approval_not_pending",
			"The approval is no longer pending for the captured browser target.",
			{ commandId: target.commandId },
		);
	}
}

/**
 * Refuse a queue command whose queue or submission is no longer the captured one.
 * @param run The run.
 * @param draft The draft.
 * @param target The target.
 */
function enforceQueueSubject(
	run: SocketRun,
	draft: BrowserCommandDraft,
	target: BrowserWorkbenchCommandTarget,
): void {
	if (!QUEUE_COMMANDS.has(draft.command)) {
		return;
	}
	const refusal = queueCommandRefusal(run.snapshot, draft);
	if (refusal !== null) {
		throw transportFailure(refusal.code, refusal.message, { commandId: target.commandId });
	}
}

/**
 * Send a command and read its result, stopping on an unreadable or misattributed answer.
 * @param core The core.
 * @param run The run.
 * @param wire The wire command.
 * @param commandId The authority it runs under.
 * @returns The result.
 */
async function dispatch(
	core: TransportCore,
	run: SocketRun,
	wire: BrowserCommand,
	commandId: BrowserCommandLease["commandId"],
): Promise<BrowserWorkbenchCommandResult> {
	const value = await request(core, run, {
		action: "command",
		kind: "command",
		extra: { command: wire },
		commandId,
	});
	let result: BrowserWorkbenchCommandResult;
	try {
		result = parseBrowserCommandResult(value);
	} catch (error) {
		stopIncompatible(
			core,
			run,
			messageOf(error, "The command result is incompatible."),
			commandId,
			error,
		);
	}
	if (result.commandId !== commandId) {
		const error = new BrowserWorkbenchWireError(
			"The Codex workbench command result identity does not match its request.",
		);
		stopIncompatible(core, run, error.message, commandId, error);
	}
	await reconcileAfterUnsequencedResult(core, run);
	return result;
}

/**
 * Send one command against the target it was composed for.
 * @param core The core.
 * @param draft The draft.
 * @param requestedTarget The target captured when the action was offered.
 * @returns The result.
 */
async function command(
	core: TransportCore,
	draft: BrowserCommandDraft,
	requestedTarget?: BrowserWorkbenchCommandTarget,
): Promise<BrowserWorkbenchCommandResult> {
	const run = requireRun(core);
	refuseUnsupported(core, run, draft);
	const target = captureTarget(core, run);
	enforceRequestedTarget(draft, requestedTarget, target);
	const wire = fullCommand(draft, target);
	enforceApprovalSubject(core, run, draft, target, wire);
	enforceQueueSubject(run, draft, target);
	return dispatch(core, run, wire, target.commandId);
}

export { command };
