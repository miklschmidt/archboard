// The six queue operations, and no others. Five are gateway commands; `list`
// is a snapshot re-read. Each command goes out against the target captured
// when the control was offered, so a link or focus change refuses the command
// instead of retargeting it at whatever the pane moved to.

import type {
	WorkbenchQueueCommands,
	WorkbenchQueueControl,
	WorkbenchQueueSettlement,
	WorkbenchQueueSubmissionId,
	WorkbenchQueueTargetCapture,
} from "@/ui/workbench-queue/contracts";
import { errorMessage, transportErrorFacts } from "@/ui/workbench-queue/lib/transport-errors";
import type {
	QueueCommandDraft,
	WorkbenchCommandIntent,
	WorkbenchCommandResult,
	WorkbenchQueueTransportPort,
} from "@/ui/workbench-queue/transport-port";

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

/**
 * One settlement, frozen.
 * @param fields The settlement fields.
 * @returns The frozen settlement.
 */
function frozen(fields: WorkbenchQueueSettlement): WorkbenchQueueSettlement {
	return Object.freeze(fields);
}

/**
 * Read a command result as a settlement. Success is read only from an
 * authoritative delivered result.
 * @param control The control that sent the command.
 * @param submissionId The submission it named, or null.
 * @param result The transport's answer.
 * @returns The settlement.
 */
function settle(
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	result: WorkbenchCommandResult,
): WorkbenchQueueSettlement {
	if (result.outcome === "delivered") {
		return frozen({
			control,
			state: "reconciled",
			code: null,
			message: result.message ?? DELIVERED_MESSAGES[control],
			submissionId,
		});
	}
	if (result.outcome === "outcome_unknown") {
		return frozen({
			control,
			state: "outcome_unknown",
			code: result.code,
			message: result.message ?? UNKNOWN_MESSAGES[control],
			submissionId,
		});
	}
	return frozen({
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
 * @param control The control that sent the command.
 * @param submissionId The submission it named, or null.
 * @param error The thrown value.
 * @returns The settlement.
 */
function settleFailure(
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	error: unknown,
): WorkbenchQueueSettlement {
	const facts = transportErrorFacts(error);
	if (facts !== null) {
		return frozen({
			control,
			state: facts.outcome === "outcome_unknown" ? "outcome_unknown" : "refused",
			code: facts.code,
			message: facts.message,
			submissionId,
		});
	}
	return frozen({
		control,
		state: "refused",
		code: null,
		message: errorMessage(error, "The queue command could not be sent."),
		submissionId,
	});
}

/**
 * Emit one queue command against its captured target.
 * @param transport The transport port.
 * @param control The control sending it.
 * @param submissionId The submission it names, or null.
 * @param draft The wire draft.
 * @param target The target captured when the control was offered.
 * @returns The settlement.
 */
async function send(
	transport: WorkbenchQueueTransportPort,
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	draft: QueueCommandDraft,
	target: WorkbenchCommandIntent,
): Promise<WorkbenchQueueSettlement> {
	try {
		return settle(control, submissionId, await transport.executeCommand(draft, target));
	} catch (error) {
		return settleFailure(control, submissionId, error);
	}
}

/**
 * Refresh the authoritative snapshot. It is the recovery for every state where
 * the queue on screen is not proven: stale, reconnecting, restarted,
 * unavailable, and a lost outcome.
 * @param transport The transport port.
 * @returns The settlement.
 */
async function list(transport: WorkbenchQueueTransportPort): Promise<WorkbenchQueueSettlement> {
	try {
		await transport.refresh();
		return frozen({
			control: "list",
			state: "reconciled",
			code: null,
			message: DELIVERED_MESSAGES.list,
			submissionId: null,
		});
	} catch (error) {
		return settleFailure("list", null, error);
	}
}

/**
 * The six queue operations over one transport.
 * @param transport The transport port.
 * @returns The commands.
 */
function createWorkbenchQueueCommands(
	transport: WorkbenchQueueTransportPort,
): WorkbenchQueueCommands {
	return Object.freeze({
		/**
		 * Re-read the authoritative list.
		 * @returns The settlement.
		 */
		list: () => list(transport),
		/**
		 * Queue one submission behind the current turn.
		 * @param prompt The prompt.
		 * @param target The captured target.
		 * @returns The settlement.
		 */
		add: (prompt, target) => send(transport, "add", null, { command: "queueAdd", prompt }, target),
		/**
		 * Replace one queued prompt.
		 * @param submissionId The submission.
		 * @param prompt The new prompt.
		 * @param target The captured target.
		 * @returns The settlement.
		 */
		edit: (submissionId, prompt, target) =>
			send(
				transport,
				"edit",
				submissionId,
				{ command: "queueUpdate", submissionId, prompt },
				target,
			),
		/**
		 * Delete one queued submission.
		 * @param submissionId The submission.
		 * @param target The captured target.
		 * @returns The settlement.
		 */
		cancel: (submissionId, target) =>
			send(transport, "cancel", submissionId, { command: "queueDelete", submissionId }, target),
		/**
		 * Submit the complete order.
		 * @param orderedSubmissionIds Every submission, in the requested order.
		 * @param target The captured target.
		 * @param submissionId The submission the person moved, or null.
		 * @returns The settlement.
		 */
		reorder: (orderedSubmissionIds, target, submissionId = null) =>
			send(
				transport,
				"reorder",
				submissionId,
				{ command: "queueReorder", orderedSubmissionIds: [...orderedSubmissionIds] },
				target,
			),
		/**
		 * Start one queued submission now.
		 * @param submissionId The submission.
		 * @param target The captured target.
		 * @returns The settlement.
		 */
		start: (submissionId, target) =>
			send(transport, "start", submissionId, { command: "queueStart", submissionId }, target),
	} satisfies WorkbenchQueueCommands);
}

/**
 * Capture the command target for the queue being rendered. It fails when the
 * pane holds no usable snapshot, which is a disabled-control reason rather
 * than an error the person has to read as a failure.
 * @param transport The transport port.
 * @returns The captured target, or the reason none could be captured.
 */
function captureWorkbenchQueueTarget(
	transport: WorkbenchQueueTransportPort,
): WorkbenchQueueTargetCapture {
	try {
		return Object.freeze({ captured: true, target: transport.captureCommandIntent() });
	} catch (error) {
		return Object.freeze({
			captured: false,
			reason:
				transportErrorFacts(error)?.message ??
				"The workbench has no command target for this queue.",
		});
	}
}

export { captureWorkbenchQueueTarget, createWorkbenchQueueCommands };
