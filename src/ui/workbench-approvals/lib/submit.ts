import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import type { DeliveryOutcome } from "../../../shared/codex-browser-model/index.js";
import type {
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalDraftResult,
	WorkbenchApprovalSubmission,
} from "../contract.js";
import { dynamicApprovalDraft, ordinaryApprovalDraft } from "./response.js";
import { refusalMessage } from "./vocabulary.js";

const SENT_MESSAGES = {
	delivered: "The host delivered your decision.",
	not_delivered: "The host could not deliver your decision, so nothing was executed.",
	outcome_unknown:
		"The host lost the answer, so the outcome is unknown. Archboard never retries an unknown mutation.",
} as const satisfies Record<DeliveryOutcome, string>;

const NO_TARGET =
	"This browser no longer holds the workbench target this decision was offered against.";

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

function draftFor(input: WorkbenchApprovalSubmission): WorkbenchApprovalDraftResult {
	if (input.card.kind === "dynamic")
		return dynamicApprovalDraft({ approval: input.card.request, offerId: input.offerId });
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
 * The decision goes out on the transport's captured-target command, so a
 * workbench that navigated between reading the request and answering it is
 * refused rather than retargeted. This module never writes a protocol response
 * or mutates host state; the gateway and its broker still own both.
 */
export async function submitApprovalDecision(
	input: WorkbenchApprovalSubmission,
): Promise<WorkbenchApprovalDecisionResult> {
	if (!input.card.offers.some((candidate) => candidate.id === input.offerId))
		return refused(
			"not_offered",
			"not_delivered",
			"That decision is not offered for this request.",
		);
	const built = draftFor(input);
	if (!built.ok) return Object.freeze({ status: "invalid", errors: built.errors });
	if (input.target === null) return refused("link_required", "not_delivered", NO_TARGET);
	try {
		const result = await input.transport.command(built.draft, input.target);
		if (result.code !== null) return refused(result.code, result.outcome, result.message);
		return Object.freeze({
			status: "sent",
			outcome: result.outcome,
			message: SENT_MESSAGES[result.outcome],
		});
	} catch (error) {
		if (error instanceof BrowserWorkbenchTransportError)
			return refused(error.code, error.outcome, refusalMessage(error.code));
		return refused("gateway_error", "outcome_unknown", null);
	}
}
