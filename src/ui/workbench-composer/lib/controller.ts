// One state owner for every workhorse turn command the composer can send.
// Every dispatch captures the transport's command intent at activation and
// hands it back to `executeCommand()`, so a pane that navigated between
// composing and sending is refused by the transport rather than silently
// retargeted. The controller holds no message list: the only turn a person
// ever sees came from the host snapshot through the runtime.

import type { DeliveryOutcome } from "@/shared/codex-browser-model";
import {
	BrowserWorkbenchTransportError,
	type BrowserWorkbenchCommandResult,
} from "@/ui/workbench-transport";
import type {
	WorkbenchComposerCommandResult,
	WorkbenchComposerController,
	WorkbenchComposerControllerOptions,
	WorkbenchComposerDraftDisposition,
	WorkbenchComposerPlan,
	WorkbenchComposerRefusal,
	WorkbenchComposerRetainedDraft,
	WorkbenchComposerState,
	WorkbenchComposerStatus,
	WorkbenchComposerSubmission,
	WorkbenchComposerSubmissionResult,
	WorkbenchComposerThreadId,
	WorkbenchComposerTurnId,
} from "@/ui/workbench-composer/lib/contract";
import { composerDraftDisposition } from "@/ui/workbench-composer/lib/draft";
import {
	composerRefusal,
	planComposerInterrupt,
	planComposerSubmit,
} from "@/ui/workbench-composer/lib/intent";
import { readComposerLink } from "@/ui/workbench-composer/lib/link";
import {
	LATE_RESULT_REASON,
	OUTCOME_MESSAGES,
	OUTCOME_RECOVERIES,
	PENDING_MESSAGES,
	QUEUED_MESSAGE,
	REFUSAL_MESSAGES,
	REFUSAL_RECOVERIES,
	transportRefusalMessage,
} from "@/ui/workbench-composer/lib/vocabulary";

const NO_TURN_REASON = "Codex reported delivery without identifying the accepted turn.";

type DispatchPlan = Extract<WorkbenchComposerPlan, { readonly kind: "dispatch" }>;

/** A settled command's own view of what happened, before it becomes a result. */
interface Settlement {
	readonly outcome: DeliveryOutcome;
	readonly message: string;
	readonly turnId: WorkbenchComposerTurnId | null;
	readonly queued: boolean;
}

/**
 * A status.
 * @param state The status state.
 * @param message The words.
 * @param recovery The next action, or null.
 * @returns The frozen status.
 */
function status(
	state: WorkbenchComposerStatus["state"],
	message: string,
	recovery: string | null,
): WorkbenchComposerStatus {
	return Object.freeze({
		role: "status",
		label: "Codex composer status",
		state,
		message,
		recovery,
	});
}

const IDLE_STATUS = status("idle", "The composer is ready.", null);

/**
 * A settlement.
 * @param outcome The delivery outcome.
 * @param message The words.
 * @param turnId The accepted turn, or null.
 * @param queued Whether the message was parked rather than sent.
 * @returns The frozen settlement.
 */
function settlement(
	outcome: DeliveryOutcome,
	message: string,
	turnId: WorkbenchComposerTurnId | null = null,
	queued = false,
): Settlement {
	return Object.freeze({ outcome, message, turnId, queued });
}

/**
 * The settlement a thrown error means. The host's own message, when it sent
 * one, beats the composer's vocabulary: only the host knows which guard refused.
 * @param error The rejection.
 * @returns The settlement.
 */
function refusalOf(error: unknown): Settlement {
	if (error instanceof BrowserWorkbenchTransportError) {
		return settlement(error.outcome, transportRefusalMessage(error.code));
	}
	return settlement(
		"outcome_unknown",
		error instanceof Error ? error.message : "The command outcome is unknown.",
	);
}

/**
 * Failing to capture an intent is always `not_delivered`, whatever the error
 * says: the capture happens before the command exists, so nothing reached the
 * host and the person's text is safe to send again.
 * @param error The rejection.
 * @returns The settlement.
 */
function captureRefusal(error: unknown): Settlement {
	if (error instanceof BrowserWorkbenchTransportError) {
		return settlement("not_delivered", transportRefusalMessage(error.code));
	}
	return settlement(
		"not_delivered",
		error instanceof Error ? error.message : "The workbench command target is unavailable.",
	);
}

/**
 * The turn a delivered command may claim. A steer names the turn it steered;
 * a start has no id of its own, so its id comes from the accepted response; a
 * queued message has no turn at all.
 * @param plan The dispatched plan.
 * @param result The host's result.
 * @returns The settlement.
 */
function deliveredSettlement(
	plan: DispatchPlan,
	result: BrowserWorkbenchCommandResult,
): Settlement {
	if (plan.action === "queue") {
		return settlement("delivered", QUEUED_MESSAGE, null, true);
	}
	if (plan.action !== "start") {
		return settlement("delivered", OUTCOME_MESSAGES.delivered, plan.draft.turnId);
	}
	if (result.turnId === undefined) {
		return settlement("outcome_unknown", NO_TURN_REASON);
	}
	return settlement("delivered", OUTCOME_MESSAGES.delivered, result.turnId);
}

/**
 * The settlement of a host result.
 * @param plan The dispatched plan.
 * @param result The host's result.
 * @returns The settlement.
 */
function resultSettlement(plan: DispatchPlan, result: BrowserWorkbenchCommandResult): Settlement {
	if (result.code !== null) {
		return settlement(result.outcome, result.message ?? transportRefusalMessage(result.code));
	}
	if (result.outcome === "delivered") {
		return deliveredSettlement(plan, result);
	}
	return settlement(result.outcome, OUTCOME_MESSAGES[result.outcome]);
}

/**
 * The submission result a settlement becomes.
 * @param settled The settlement.
 * @returns The result the runtime reads.
 */
function submissionResult(settled: Settlement): WorkbenchComposerSubmissionResult {
	if (settled.outcome === "delivered" && settled.queued) {
		return Object.freeze({ outcome: "queued" });
	}
	if (settled.outcome === "delivered" && settled.turnId !== null) {
		return Object.freeze({ outcome: "delivered", turnId: settled.turnId });
	}
	if (settled.outcome === "not_delivered") {
		return Object.freeze({ outcome: "not_delivered", reason: settled.message });
	}
	return Object.freeze({ outcome: "outcome_unknown", reason: settled.message });
}

/**
 * The refusal for a workbench that cannot take input.
 * @returns The refusal.
 */
function unavailableRefusal(): WorkbenchComposerRefusal {
	return Object.freeze({
		code: "unavailable",
		message: REFUSAL_MESSAGES.unavailable,
		recovery: REFUSAL_RECOVERIES.unavailable,
	});
}

/**
 * Create the composer's one state owner.
 * @param options The transport it sends through.
 * @returns The controller.
 */
function createWorkbenchComposerController(
	options: WorkbenchComposerControllerOptions,
): WorkbenchComposerController {
	const { transport } = options;
	const listeners = new Set<() => void>();
	let state: WorkbenchComposerState = Object.freeze({
		pending: null,
		status: IDLE_STATUS,
		retained: null,
		settled: 0,
	});

	/**
	 * Publish a partial state.
	 * @param next The fields that changed.
	 */
	function publish(next: Partial<WorkbenchComposerState>): void {
		state = Object.freeze({ ...state, ...next });
		for (const listener of listeners) {
			listener();
		}
	}

	/**
	 * Publish a refusal the composer made itself.
	 * @param refusal The refusal.
	 */
	function refuse(refusal: WorkbenchComposerRefusal): void {
		publish({ status: status("refused", refusal.message, refusal.recovery) });
	}

	/**
	 * A retained copy stands until the person dismisses it, or until it is
	 * replaced by a newer one. A later command settling does not clear it: the
	 * copy exists precisely because nobody knows whether its message landed. The
	 * one exception is a delivered send of the same text.
	 * @param disposition The draft disposition.
	 * @param text The text sent, or null for an interrupt.
	 * @param threadId The thread it was sent to.
	 * @param reason Why the copy is kept.
	 * @returns The retained draft, or null.
	 */
	function retainedAfter(
		disposition: WorkbenchComposerDraftDisposition,
		text: string | null,
		threadId: WorkbenchComposerThreadId,
		reason: string,
	): WorkbenchComposerRetainedDraft | null {
		if (disposition === "retained" && text !== null) {
			return Object.freeze({ text, threadId, reason });
		}
		const standing = state.retained;
		if (standing === null || (disposition === "cleared" && standing.text === text)) {
			return null;
		}
		return standing;
	}

	/**
	 * Whether a result arrived after the pane left the link it was sent against.
	 * @param threadId The thread the command named.
	 * @returns True when the result cannot be applied here.
	 */
	function lateFor(threadId: WorkbenchComposerThreadId): boolean {
		const link = readComposerLink(transport.state());
		return link.kind !== "executable" || link.threadId !== threadId;
	}

	/**
	 * Send one plan and read what the host said.
	 * @param plan The plan.
	 * @returns The settlement.
	 */
	async function sendPlan(plan: DispatchPlan): Promise<Settlement> {
		let intent;
		try {
			intent = transport.captureCommandIntent();
		} catch (error) {
			return captureRefusal(error);
		}
		publish({
			pending: plan.action,
			status: status("pending", PENDING_MESSAGES[plan.action], null),
		});
		try {
			return resultSettlement(plan, await transport.executeCommand(plan.draft, intent));
		} catch (error) {
			return refusalOf(error);
		}
	}

	/**
	 * Dispatch a plan and publish its settlement.
	 * @param plan The plan.
	 * @param threadId The thread it targets.
	 * @param text The text sent, or null for an interrupt.
	 * @returns The settlement.
	 */
	async function dispatch(
		plan: DispatchPlan,
		threadId: WorkbenchComposerThreadId,
		text: string | null,
	): Promise<Settlement> {
		let settled = await sendPlan(plan);
		// A relink while the command was in flight makes a delivered or unknown
		// answer unreadable here. It does not make a definitive refusal unknown:
		// the host said nothing was delivered, and the text is safe to send again.
		if (settled.outcome !== "not_delivered" && lateFor(threadId)) {
			settled = settlement("outcome_unknown", LATE_RESULT_REASON);
		}
		const recovery = OUTCOME_RECOVERIES[settled.outcome];
		publish({
			pending: null,
			settled: state.settled + 1,
			status: status(settled.outcome, settled.message, recovery),
			retained: retainedAfter(
				composerDraftDisposition(settled.outcome),
				text,
				threadId,
				settled.message,
			),
		});
		return settled;
	}

	/**
	 * A second activation while a command is in flight is refused here and
	 * sends nothing. `not_delivered` is the honest answer: this activation
	 * reached no host.
	 * @returns The refusal result.
	 */
	function refusePending(): WorkbenchComposerCommandResult {
		const plan = composerRefusal("command_pending");
		if (plan.kind === "refuse") {
			refuse(plan.refusal);
		}
		return Object.freeze({ outcome: "not_delivered", reason: REFUSAL_MESSAGES.command_pending });
	}

	/**
	 * Publish a refusal and answer the submission with it.
	 * @param refusal The refusal.
	 * @returns The not-delivered result.
	 */
	function refuseSubmission(refusal: WorkbenchComposerRefusal): WorkbenchComposerSubmissionResult {
		refuse(refusal);
		return Object.freeze({ outcome: "not_delivered", reason: refusal.message });
	}

	/**
	 * The thread a plan targets: the link's thread for a queued message.
	 * @param plan The plan.
	 * @returns The thread, or null when the link is not executable.
	 */
	function planThread(plan: DispatchPlan): WorkbenchComposerThreadId | null {
		if (plan.action !== "queue") {
			return plan.draft.threadId;
		}
		const link = readComposerLink(transport.state());
		return link.kind === "executable" ? link.threadId : null;
	}

	/**
	 * Submit a message with the chosen delivery.
	 * @param submission The text and delivery.
	 * @returns The submission result.
	 */
	async function submit(
		submission: WorkbenchComposerSubmission,
	): Promise<WorkbenchComposerSubmissionResult> {
		if (state.pending !== null) {
			return Object.freeze({ outcome: "not_delivered", reason: refusePending().reason });
		}
		const plan = planComposerSubmit(transport.state(), submission.text, submission.delivery);
		if (plan.kind === "refuse") {
			return refuseSubmission(plan.refusal);
		}
		const threadId = planThread(plan);
		if (threadId === null) {
			return refuseSubmission(unavailableRefusal());
		}
		return submissionResult(await dispatch(plan, threadId, submission.text));
	}

	/**
	 * Interrupt the turn the control was offered for.
	 * @param turnId The captured turn.
	 * @returns The command result.
	 */
	async function interrupt(
		turnId: WorkbenchComposerTurnId,
	): Promise<WorkbenchComposerCommandResult> {
		if (state.pending !== null) {
			return refusePending();
		}
		const plan = planComposerInterrupt(transport.state(), turnId);
		if (plan.kind === "refuse") {
			refuse(plan.refusal);
			return Object.freeze({ outcome: "not_delivered", reason: plan.refusal.message });
		}
		const threadId = planThread(plan);
		if (threadId === null) {
			return refusePending();
		}
		const settled = await dispatch(plan, threadId, null);
		return Object.freeze({ outcome: settled.outcome, reason: settled.message });
	}

	/**
	 * Hear every publication.
	 * @param listener The listener.
	 * @returns A function that stops listening.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	/** Drop the retained copy. */
	function dismissRetainedDraft(): void {
		if (state.retained !== null) {
			publish({ retained: null });
		}
	}

	/**
	 * The state.
	 * @returns The frozen state.
	 */
	function getState(): WorkbenchComposerState {
		return state;
	}

	return Object.freeze({
		submit,
		interrupt,
		getState,
		subscribe,
		dismissRetainedDraft,
	});
}

export { createWorkbenchComposerController };
