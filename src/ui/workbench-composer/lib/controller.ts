import type { DeliveryOutcome } from "../../../shared/codex-browser-model/index.js";
import {
	BrowserWorkbenchTransportError,
	type BrowserWorkbenchCommandResult,
} from "../../workbench-transport/index.js";
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
	WorkbenchComposerSubmissionResult,
	WorkbenchComposerThreadId,
	WorkbenchComposerTurnId,
} from "../contract.js";
import { composerDraftDisposition } from "./draft.js";
import { composerRefusal, planComposerInterrupt, planComposerSubmit } from "./intent.js";
import { readComposerLink } from "./link.js";
import {
	LATE_RESULT_REASON,
	OUTCOME_MESSAGES,
	OUTCOME_RECOVERIES,
	PENDING_MESSAGES,
	REFUSAL_MESSAGES,
	transportRefusalMessage,
} from "./vocabulary.js";

const NO_TURN_REASON = "Codex reported delivery without identifying the accepted turn.";

const IDLE_STATUS: WorkbenchComposerStatus = Object.freeze({
	role: "status",
	label: "Codex composer status",
	state: "idle",
	message: "The composer is ready.",
	recovery: null,
});

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

function outcomeStatus(outcome: DeliveryOutcome, message: string): WorkbenchComposerStatus {
	return status(outcome, message, OUTCOME_RECOVERIES[outcome]);
}

type DispatchPlan = Extract<WorkbenchComposerPlan, { readonly kind: "dispatch" }>;

/** A settled command's own view of what happened, before it becomes a result. */
interface Settlement {
	readonly outcome: DeliveryOutcome;
	readonly message: string;
	readonly turnId: WorkbenchComposerTurnId | null;
}

function settlement(
	outcome: DeliveryOutcome,
	message: string,
	turnId: WorkbenchComposerTurnId | null = null,
): Settlement {
	return Object.freeze({ outcome, message, turnId });
}

function refusalOf(error: unknown): Settlement {
	// The host's own message, when it sent one, beats the composer's vocabulary:
	// only the host knows which of its state guards refused.
	if (error instanceof BrowserWorkbenchTransportError)
		return settlement(error.outcome, transportRefusalMessage(error.code));
	return settlement(
		"outcome_unknown",
		error instanceof Error ? error.message : "The command outcome is unknown.",
	);
}

/**
 * Failing to capture a target is always `not_delivered`, whatever the error
 * says: the capture happens before the command exists, so nothing reached the
 * host and the person's text is safe to send again.
 */
function captureRefusal(error: unknown): Settlement {
	if (error instanceof BrowserWorkbenchTransportError)
		return settlement("not_delivered", transportRefusalMessage(error.code));
	return settlement(
		"not_delivered",
		error instanceof Error ? error.message : "The workbench command target is unavailable.",
	);
}

/**
 * The turn a delivered command may claim. A steer names the turn it steered,
 * which Codex accepted under its `expectedTurnId` precondition. A start has no id of
 * its own, so its id comes from the accepted command response. The turn may
 * already be completed by the time the accompanying snapshot is published.
 */
function deliveredTurn(plan: DispatchPlan, result: BrowserWorkbenchCommandResult): Settlement {
	if (plan.action !== "start")
		return settlement("delivered", OUTCOME_MESSAGES.delivered, plan.draft.turnId);
	if (result.turnId === undefined) return settlement("outcome_unknown", NO_TURN_REASON);
	return settlement("delivered", OUTCOME_MESSAGES.delivered, result.turnId);
}

/**
 * One state owner for every workhorse turn command the composer can send.
 *
 * Every dispatch captures the transport's command target at activation and
 * hands it back to `executeCommand()`, so a pane that navigated between composing and
 * sending is refused by the transport rather than silently retargeted. The
 * controller holds no message list and publishes no assistant record: the only
 * turn a person ever sees came from the host snapshot through
 * `workbench-runtime`.
 */
export function createWorkbenchComposerController(
	options: WorkbenchComposerControllerOptions,
): WorkbenchComposerController {
	const transport = options.transport;
	const listeners = new Set<() => void>();
	let state: WorkbenchComposerState = Object.freeze({
		pending: null,
		status: IDLE_STATUS,
		retained: null,
		settled: 0,
	});

	const publish = (next: Partial<WorkbenchComposerState>): void => {
		state = Object.freeze({ ...state, ...next });
		for (const listener of listeners) listener();
	};

	const refuse = (refusal: WorkbenchComposerRefusal): void => {
		publish({ status: status("refused", refusal.message, refusal.recovery) });
	};

	/**
	 * A retained copy stands until the person dismisses it, or until it is
	 * replaced by a newer one. A later command settling does not clear it: the
	 * copy exists precisely because nobody knows whether its message landed, and
	 * a following command answers a different question. The one exception is a
	 * delivered send of the same text — that question is now answered, so the
	 * copy goes. Refusals leave it alone for the same reason.
	 */
	const retainedAfter = (
		disposition: WorkbenchComposerDraftDisposition,
		text: string | null,
		threadId: WorkbenchComposerThreadId,
		reason: string,
	): WorkbenchComposerRetainedDraft | null => {
		if (disposition === "retained" && text !== null)
			return Object.freeze({ text, threadId, reason });
		const standing = state.retained;
		if (standing === null) return null;
		if (disposition === "cleared" && text !== null && standing.text === text) return null;
		return standing;
	};

	/**
	 * A result that arrives after the pane has left the link it was sent against
	 * is never applied to the composer the person is now looking at: it becomes a
	 * retained record naming its own thread, and its outcome is reported as
	 * unknown because this browser can no longer read that link's turns.
	 */
	const lateFor = (threadId: WorkbenchComposerThreadId): boolean => {
		const link = readComposerLink(transport.state());
		return link.kind !== "executable" || link.threadId !== threadId;
	};

	const dispatch = async (
		plan: DispatchPlan,
		threadId: WorkbenchComposerThreadId,
		text: string | null,
	): Promise<Settlement> => {
		let target;
		try {
			target = transport.captureCommandIntent();
		} catch (error) {
			const refused = captureRefusal(error);
			publish({
				settled: state.settled + 1,
				status: outcomeStatus(refused.outcome, refused.message),
			});
			return refused;
		}
		publish({
			pending: plan.action,
			status: status("pending", PENDING_MESSAGES[plan.action], null),
		});
		let settled: Settlement;
		try {
			const result = await transport.executeCommand(plan.draft, target);
			if (result.code !== null)
				settled = settlement(
					result.outcome,
					result.message ?? transportRefusalMessage(result.code),
				);
			else if (result.outcome === "delivered") settled = deliveredTurn(plan, result);
			else settled = settlement(result.outcome, OUTCOME_MESSAGES[result.outcome]);
		} catch (error) {
			settled = refusalOf(error);
		}
		// A relink while the command was in flight makes a delivered or unknown
		// answer unreadable here, because this browser can no longer see that
		// link's turns. It does not make a *definitive* refusal unknown: the host
		// said nothing was delivered, and the person's text is still safe to send
		// again, so relabelling it would move safe text into the inert region.
		if (settled.outcome !== "not_delivered" && lateFor(threadId))
			settled = settlement("outcome_unknown", LATE_RESULT_REASON);
		const disposition = composerDraftDisposition(settled.outcome);
		publish({
			pending: null,
			settled: state.settled + 1,
			status: outcomeStatus(settled.outcome, settled.message),
			retained: retainedAfter(disposition, text, threadId, settled.message),
		});
		return settled;
	};

	/**
	 * A second activation while a command is in flight — a double Enter, a click
	 * on a control whose disabled state has not painted yet — is refused here and
	 * sends nothing. `not_delivered` is the honest answer: the runtime restores
	 * the text, because this activation reached no host.
	 */
	const refusePending = (): WorkbenchComposerCommandResult => {
		const plan = composerRefusal("command_pending");
		if (plan.kind === "refuse") refuse(plan.refusal);
		return Object.freeze({
			outcome: "not_delivered",
			reason: REFUSAL_MESSAGES.command_pending,
		});
	};

	const submit = async (submission: {
		readonly text: string;
	}): Promise<WorkbenchComposerSubmissionResult> => {
		if (state.pending !== null)
			return Object.freeze({ outcome: "not_delivered", reason: refusePending().reason });
		const plan = planComposerSubmit(transport.state(), submission.text);
		if (plan.kind === "refuse") {
			refuse(plan.refusal);
			return Object.freeze({ outcome: "not_delivered", reason: plan.refusal.message });
		}
		const settled = await dispatch(plan, plan.draft.threadId, submission.text);
		if (settled.outcome === "delivered" && settled.turnId !== null)
			return Object.freeze({ outcome: "delivered", turnId: settled.turnId });
		if (settled.outcome === "not_delivered")
			return Object.freeze({ outcome: "not_delivered", reason: settled.message });
		return Object.freeze({ outcome: "outcome_unknown", reason: settled.message });
	};

	const interrupt = async (
		turnId: WorkbenchComposerTurnId,
	): Promise<WorkbenchComposerCommandResult> => {
		if (state.pending !== null) return refusePending();
		const plan = planComposerInterrupt(transport.state(), turnId);
		if (plan.kind === "refuse") {
			refuse(plan.refusal);
			return Object.freeze({ outcome: "not_delivered", reason: plan.refusal.message });
		}
		const settled = await dispatch(plan, plan.draft.threadId, null);
		return Object.freeze({ outcome: settled.outcome, reason: settled.message });
	};

	return Object.freeze({
		submit,
		interrupt,
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dismissRetainedDraft: () => {
			if (state.retained !== null) publish({ retained: null });
		},
	});
}
