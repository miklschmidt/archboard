import type { DeliveryOutcome } from "../../../shared/codex-browser-model/index.js";
import {
	BrowserWorkbenchTransportError,
	type BrowserWorkbenchCommandResult,
} from "../../workbench-transport/index.js";
import type {
	WorkbenchComposerCommandResult,
	WorkbenchComposerController,
	WorkbenchComposerControllerOptions,
	WorkbenchComposerPlan,
	WorkbenchComposerRefusal,
	WorkbenchComposerState,
	WorkbenchComposerStatus,
	WorkbenchComposerSubmissionResult,
	WorkbenchComposerThreadId,
	WorkbenchComposerTurnId,
} from "../contract.js";
import { composerDraftDisposition } from "./draft.js";
import { composerRefusal, planComposerInterrupt, planComposerSubmit } from "./intent.js";
import { readComposerLink, readComposerTurn } from "./link.js";
import {
	LATE_RESULT_REASON,
	OUTCOME_MESSAGES,
	OUTCOME_RECOVERIES,
	PENDING_MESSAGES,
	REFUSAL_MESSAGES,
	transportRefusalMessage,
} from "./vocabulary.js";

const NO_TURN_REASON =
	"Codex reported delivery, but published no single authoritative in-progress turn.";

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
	if (error instanceof BrowserWorkbenchTransportError)
		return settlement(error.outcome, transportRefusalMessage(error.code));
	return settlement(
		"outcome_unknown",
		error instanceof Error ? error.message : "The command outcome is unknown.",
	);
}

/**
 * The turn a delivered command may claim. A steer names the turn it steered,
 * which the host already re-proved as `expectedTurnId`. A start has no id of
 * its own, so the id comes from the authoritative snapshot the host answered
 * with; when that snapshot shows no single in-progress turn, the composer says
 * the outcome is unknown rather than inventing one.
 */
function deliveredTurn(plan: DispatchPlan, result: BrowserWorkbenchCommandResult): Settlement {
	if (plan.action !== "start")
		return settlement("delivered", OUTCOME_MESSAGES.delivered, plan.draft.turnId);
	const turn = readComposerTurn(result.snapshot);
	if (turn.kind !== "active") return settlement("outcome_unknown", NO_TURN_REASON);
	return settlement("delivered", OUTCOME_MESSAGES.delivered, turn.turnId);
}

/**
 * One state owner for every workhorse turn command the composer can send.
 *
 * Every dispatch captures the transport's command target at activation and
 * hands it back to `command()`, so a pane that navigated between composing and
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
			target = transport.captureCommandTarget();
		} catch (error) {
			return refusalOf(error);
		}
		publish({
			pending: plan.action,
			status: status("pending", PENDING_MESSAGES[plan.action], null),
		});
		let settled: Settlement;
		try {
			const result = await transport.command(plan.draft, target);
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
		if (lateFor(threadId)) settled = settlement("outcome_unknown", LATE_RESULT_REASON);
		const disposition = composerDraftDisposition(settled.outcome);
		publish({
			pending: null,
			settled: state.settled + 1,
			status: outcomeStatus(settled.outcome, settled.message),
			retained:
				disposition === "retained" && text !== null
					? Object.freeze({ text, threadId, reason: settled.message })
					: null,
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
