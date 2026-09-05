import {
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchCommandResult,
	type BrowserWorkbenchCommandIntent,
} from "../../workbench-transport/index.js";

import type {
	WorkbenchQueueActions,
	WorkbenchQueueControl,
	WorkbenchQueueSettlement,
	WorkbenchQueueSubmissionId,
	WorkbenchQueueTransport,
} from "./contract.js";

const DELIVERED_MESSAGES = {
	add: "The host queued the submission and republished the queue.",
	list: "The host re-read and republished the authoritative queue for this thread link.",
	edit: "The host updated the queued submission and republished the queue.",
	cancel: "The host deleted the queued submission and republished the queue.",
	reorder: "The host applied the submitted order and republished the queue.",
	start: "The host started the queued submission and republished the queue.",
} as const satisfies Record<WorkbenchQueueControl, string>;

const UNKNOWN_MESSAGES = {
	add: "The add command's outcome was lost; the submission may or may not be queued.",
	list: "The snapshot read did not complete; the queue on screen is not proven current.",
	edit: "The edit command's outcome was lost; the queued prompt may or may not have changed.",
	cancel: "The cancel command's outcome was lost; the submission may or may not be gone.",
	reorder: "The reorder command's outcome was lost; the queue order is not proven.",
	start: "The start command's outcome was lost; the submission may or may not be running.",
} as const satisfies Record<WorkbenchQueueControl, string>;

function settle(
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	result: BrowserWorkbenchCommandResult,
): WorkbenchQueueSettlement {
	if (result.outcome === "delivered")
		return Object.freeze({
			control,
			state: "reconciled",
			code: null,
			message: result.message ?? DELIVERED_MESSAGES[control],
			submissionId,
		});
	if (result.outcome === "outcome_unknown")
		return Object.freeze({
			control,
			state: "outcome_unknown",
			code: result.code,
			message: result.message ?? UNKNOWN_MESSAGES[control],
			submissionId,
		});
	return Object.freeze({
		control,
		state: "refused",
		code: result.code,
		message: result.message ?? "The host refused the queue command.",
		submissionId,
	});
}

/**
 * A thrown command is never read as success. A transport error carries the
 * outcome the transport could prove: `outcome_unknown` keeps the person in
 * uncertainty rather than showing a refusal that may not have happened.
 */
function settleFailure(
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	error: unknown,
): WorkbenchQueueSettlement {
	if (error instanceof BrowserWorkbenchTransportError)
		return Object.freeze({
			control,
			state: error.outcome === "outcome_unknown" ? "outcome_unknown" : "refused",
			code: error.code,
			message: error.message,
			submissionId,
		});
	return Object.freeze({
		control,
		state: "refused",
		code: null,
		message: error instanceof Error ? error.message : "The queue command could not be sent.",
		submissionId,
	});
}

/**
 * Emit one queue command against the target captured when the control was
 * offered. Passing the captured target is what makes a link or focus change
 * refuse the command instead of retargeting it at whatever the pane moved to.
 */
async function send(
	transport: WorkbenchQueueTransport,
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	draft: BrowserCommandDraft,
	target: BrowserWorkbenchCommandIntent,
): Promise<WorkbenchQueueSettlement> {
	try {
		return settle(control, submissionId, await transport.executeCommand(draft, target));
	} catch (error) {
		return settleFailure(control, submissionId, error);
	}
}

/**
 * The six queue operations, and no others.
 *
 * Five are gateway commands. `list` is a snapshot re-read: the closed browser
 * contract publishes no `queueList` command because a snapshot request already
 * re-reads the authoritative queue for the link it is served for. Refreshing
 * asks for that snapshot rather than inventing a command the host would refuse,
 * and it is the recovery for every state where the queue on screen is not proven
 * — stale, reconnecting, restarted, unavailable, and a lost outcome.
 */
export function createWorkbenchQueueActions(
	transport: WorkbenchQueueTransport,
): WorkbenchQueueActions {
	const actions: WorkbenchQueueActions = {
		list: async (): Promise<WorkbenchQueueSettlement> => {
			try {
				await transport.refresh();
				return Object.freeze({
					control: "list",
					state: "reconciled",
					code: null,
					message: DELIVERED_MESSAGES.list,
					submissionId: null,
				});
			} catch (error) {
				return settleFailure("list", null, error);
			}
		},
		add: (prompt, target) => send(transport, "add", null, { command: "queueAdd", prompt }, target),
		edit: (submissionId, prompt, target) =>
			send(
				transport,
				"edit",
				submissionId,
				{ command: "queueUpdate", submissionId, prompt },
				target,
			),
		cancel: (submissionId, target) =>
			send(transport, "cancel", submissionId, { command: "queueDelete", submissionId }, target),
		reorder: (orderedSubmissionIds, target, submissionId = null) =>
			send(
				transport,
				"reorder",
				submissionId,
				{ command: "queueReorder", orderedSubmissionIds: [...orderedSubmissionIds] },
				target,
			),
		start: (submissionId, target) =>
			send(transport, "start", submissionId, { command: "queueStart", submissionId }, target),
	};
	return Object.freeze(actions);
}

export type WorkbenchQueueTargetCapture =
	| Readonly<{ captured: true; target: BrowserWorkbenchCommandIntent }>
	| Readonly<{ captured: false; reason: string }>;

/**
 * Capture the command target for the queue being rendered. It fails when the
 * pane holds no usable snapshot, which is a disabled-control reason
 * rather than an error the person has to read as a failure.
 */
export function captureWorkbenchQueueTarget(
	transport: WorkbenchQueueTransport,
): WorkbenchQueueTargetCapture {
	try {
		return Object.freeze({ captured: true, target: transport.captureCommandIntent() });
	} catch (error) {
		return Object.freeze({
			captured: false,
			reason:
				error instanceof BrowserWorkbenchTransportError
					? error.message
					: "The workbench has no command target for this queue.",
		});
	}
}
