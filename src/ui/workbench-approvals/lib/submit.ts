// Sending one decision. It goes out on the transport's captured-target
// command, so a workbench that navigated between reading the request and
// answering it is refused rather than retargeted. This module never writes a
// protocol response or mutates host state; the gateway and its broker own both.

import type { DeliveryOutcome } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalDraftResult,
	WorkbenchApprovalSubmission,
} from "@/ui/workbench-approvals/contracts";
import { dynamicApprovalDraft, ordinaryApprovalDraft } from "@/ui/workbench-approvals/lib/response";
import { transportErrorFacts } from "@/ui/workbench-approvals/lib/transport-errors";
import { refusalMessage } from "@/ui/workbench-approvals/lib/vocabulary";
import type {
	ApprovalCommandDraft,
	WorkbenchCommandResult,
} from "@/ui/workbench-approvals/transport-port";

const SENT_MESSAGES = {
	delivered: "The host delivered your decision.",
	not_delivered: "The host could not deliver your decision, so nothing was executed.",
	outcome_unknown:
		"The host lost the answer, so the outcome is unknown. Archboard never retries an unknown mutation.",
} as const satisfies Record<DeliveryOutcome, string>;

const NO_TARGET =
	"This browser no longer holds the workbench target this decision was offered against.";
const NOT_OFFERED = "That decision is not offered for this request.";

/**
 * A refusal.
 * @param code The transport or gateway code.
 * @param outcome What the transport could prove.
 * @param message The words, or null for the code's own.
 * @returns The result.
 */
function refused(
	code: string,
	outcome: DeliveryOutcome,
	message: string | null,
): WorkbenchApprovalDecisionResult {
	return Object.freeze({
		status: "refused",
		code,
		outcome,
		message: message ?? refusalMessage(code),
	});
}

/**
 * The draft one submission sends.
 * @param input The submission.
 * @returns The draft, or the errors that stop it.
 */
function draftFor(input: WorkbenchApprovalSubmission): WorkbenchApprovalDraftResult {
	if (input.card.kind === "dynamic") {
		return dynamicApprovalDraft({ approval: input.card.request, offerId: input.offerId });
	}
	const offer = input.card.offers.find((candidate) => candidate.id === input.offerId);
	return ordinaryApprovalDraft({
		approval: input.card.request,
		fields: input.card.fields,
		offerId: input.offerId,
		submitsForm: offer?.submitsForm ?? false,
		form: input.form,
	});
}

/**
 * Dispatch one draft. A dynamic decision goes under the exact lease it was
 * offered under; an ordinary decision acquires fresh authority for the
 * captured intent.
 * @param input The submission, with a captured target.
 * @param draft The draft.
 * @returns The transport's result.
 */
function dispatch(
	input: WorkbenchApprovalSubmission,
	draft: ApprovalCommandDraft,
): Promise<WorkbenchCommandResult> {
	if (input.card.kind !== "dynamic") {
		return input.transport.executeCommand(draft, input.target ?? undefined);
	}
	const authority = input.target?.authority ?? null;
	if (authority === null) {
		return Promise.reject(new Error(NO_TARGET, { cause: "lease_required" }));
	}
	return input.transport.command(draft, authority);
}

/**
 * The result of a dispatched draft.
 * @param result The transport's result.
 * @returns Sent with its outcome, or the gateway's refusal.
 */
function settled(result: WorkbenchCommandResult): WorkbenchApprovalDecisionResult {
	if (result.code !== null) {
		return refused(result.code, result.outcome, result.message);
	}
	return Object.freeze({
		status: "sent",
		outcome: result.outcome,
		message: SENT_MESSAGES[result.outcome],
	});
}

/**
 * The result of a thrown dispatch.
 * @param error The thrown value.
 * @returns The refusal; an unknown failure is an unknown outcome.
 */
function thrown(error: unknown): WorkbenchApprovalDecisionResult {
	const facts = transportErrorFacts(error);
	if (facts !== null) {
		return refused(facts.code, facts.outcome, refusalMessage(facts.code));
	}
	if (error instanceof Error && error.cause === "lease_required") {
		return refused("lease_required", "not_delivered", NO_TARGET);
	}
	return refused("gateway_error", "outcome_unknown", null);
}

/**
 * Send one decision.
 * @param input The submission.
 * @returns How it settled.
 */
async function submitApprovalDecision(
	input: WorkbenchApprovalSubmission,
): Promise<WorkbenchApprovalDecisionResult> {
	if (!input.card.offers.some((candidate) => candidate.id === input.offerId)) {
		return refused("not_offered", "not_delivered", NOT_OFFERED);
	}
	const built = draftFor(input);
	if (!built.ok) {
		return Object.freeze({ status: "invalid", errors: built.errors });
	}
	if (input.target === null) {
		return refused("link_required", "not_delivered", NO_TARGET);
	}
	try {
		return settled(await dispatch(input, built.draft));
	} catch (error) {
		return thrown(error);
	}
}

export { submitApprovalDecision };
