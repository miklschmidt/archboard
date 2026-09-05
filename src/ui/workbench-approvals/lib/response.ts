// Building the exact wire response for one decision. An ordinary response
// echoes the host-offered decision or the reviewed answers; a dynamic
// response echoes the captured link, the full identity and the immutable
// effect hash exactly as the host published them. Nothing here can retarget
// an effect or widen it.

import type { BrowserApproval, BrowserDynamicApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalDraftResult,
	WorkbenchApprovalField,
	WorkbenchApprovalFormState,
} from "@/ui/workbench-approvals/contracts";
import {
	DECLINE_REASON,
	ELICITATION_PREFIX,
	PERMISSION_NETWORK,
	PERMISSION_SCOPE,
	PERMISSION_STRICT_REVIEW,
	QUESTION_PREFIX,
} from "@/ui/workbench-approvals/lib/fields";
import { formFlag, formSelection, formValue } from "@/ui/workbench-approvals/lib/form";
import { validateApprovalForm } from "@/ui/workbench-approvals/lib/form-validation";
import {
	DECISION_PREFIX,
	OFFER_ABORT,
	OFFER_APPROVE,
	OFFER_CANCEL,
	OFFER_DECLINE,
} from "@/ui/workbench-approvals/lib/offers";
import type {
	ApprovalRespondDraft,
	ApprovalResponse,
	DynamicApprovalRespondDraft,
} from "@/ui/workbench-approvals/transport-port";

type UserInput = Extract<BrowserApproval, { readonly approvalKind: "user_input" }>;
type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;
type Permissions = Extract<BrowserApproval, { readonly approvalKind: "permissions" }>;
type Enumerated = Extract<
	BrowserApproval,
	{ readonly approvalKind: "command_execution" | "file_change" }
>;
type Legacy = Extract<BrowserApproval, { readonly approvalKind: "apply_patch" | "exec_command" }>;
type ElicitationContent = Extract<
	ApprovalResponse,
	{ readonly approvalKind: "elicitation" }
>["content"];
type PermissionsResponse = Extract<ApprovalResponse, { readonly approvalKind: "permissions" }>;
type LegacyDecision = Extract<
	ApprovalResponse,
	{ readonly approvalKind: "exec_command" }
>["decision"];
type Answers = Record<string, { readonly answers: string[] }>;
type ContentValue = string | number | boolean | string[];

const DEFAULT_DECLINE_REASON = "Declined at the Archboard workbench.";
const UNKNOWN_OFFER = "That decision is not offered for this request.";

/** What one dynamic draft is built from. */
interface DynamicDraftInput {
	readonly approval: BrowserDynamicApproval;
	readonly offerId: string;
}

/** What one ordinary draft is built from. */
interface OrdinaryDraftInput {
	readonly approval: BrowserApproval;
	readonly fields: readonly WorkbenchApprovalField[];
	readonly offerId: string;
	readonly submitsForm: boolean;
	readonly form: WorkbenchApprovalFormState;
}

/**
 * The index a decision offer names.
 * @param offerId The offer id.
 * @returns The index, or null for any other offer.
 */
function decisionIndex(offerId: string): number | null {
	if (!offerId.startsWith(DECISION_PREFIX)) {
		return null;
	}
	const index = Number(offerId.slice(DECISION_PREFIX.length));
	return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * A refused draft.
 * @param message Why.
 * @returns The result.
 */
function invalid(message: string): WorkbenchApprovalDraftResult {
	return { ok: false, errors: Object.freeze([{ name: "offer", message }]) };
}

/**
 * The answers one question collected: its selection, and its free text when given.
 * @param question The question.
 * @param form The form.
 * @returns The answers.
 */
function questionAnswer(
	question: UserInput["questions"][number],
	form: WorkbenchApprovalFormState,
): string[] {
	const name = `${QUESTION_PREFIX}${question.id}`;
	const other = formValue(form, name).trim();
	const selected = question.options === null ? [] : [...formSelection(form, name)];
	return other.length === 0 ? selected : [...selected, other];
}

/**
 * The answers of every question.
 * @param approval The request.
 * @param form The form.
 * @returns The answers by question id.
 */
function questionAnswers(approval: UserInput, form: WorkbenchApprovalFormState): Answers {
	const answers: Answers = {};
	for (const question of approval.questions) {
		answers[question.id] = { answers: questionAnswer(question, form) };
	}
	return answers;
}

/**
 * One elicitation field's content value, when it holds one.
 * @param item The field.
 * @param form The form.
 * @returns The typed value, or undefined when nothing was answered.
 */
function fieldContent(
	item: WorkbenchApprovalField,
	form: WorkbenchApprovalFormState,
): ContentValue | undefined {
	if (item.control === "boolean") {
		return formFlag(form, item.name);
	}
	if (item.control === "multi_enum") {
		const selected = [...formSelection(form, item.name)];
		return selected.length > 0 ? selected : undefined;
	}
	return textContent(item, formValue(form, item.name));
}

/**
 * A text-carrying field's typed content value.
 * @param item The field.
 * @param raw The answer.
 * @returns A number for numeric controls, the text otherwise, or undefined when empty.
 */
function textContent(item: WorkbenchApprovalField, raw: string): ContentValue | undefined {
	if (raw.length === 0) {
		return undefined;
	}
	return item.control === "number" || item.control === "integer" ? Number(raw) : raw;
}

/**
 * The content of an accepted form-mode elicitation.
 * @param approval The request.
 * @param fields The reviewed fields.
 * @param form The form.
 * @returns The content, or null for URL mode or an unpublished form.
 */
function elicitationContent(
	approval: Elicitation,
	fields: readonly WorkbenchApprovalField[],
	form: WorkbenchApprovalFormState,
): ElicitationContent {
	if (approval.mode === "url" || approval.fields === null) {
		return null;
	}
	const content: Record<string, ContentValue> = {};
	for (const item of fields) {
		const value = fieldContent(item, form);
		if (item.name.startsWith(ELICITATION_PREFIX) && value !== undefined) {
			content[item.name.slice(ELICITATION_PREFIX.length)] = value;
		}
	}
	return content;
}

/**
 * The reviewed permissions grant. Only a request that names network access
 * offers this decision at all.
 * @param form The form.
 * @returns The response.
 */
function permissionsGrant(form: WorkbenchApprovalFormState): PermissionsResponse {
	const scope = formValue(form, PERMISSION_SCOPE) === "session" ? "session" : "turn";
	const strict = formFlag(form, PERMISSION_STRICT_REVIEW);
	return {
		approvalKind: "permissions",
		permissions: { network: { enabled: formFlag(form, PERMISSION_NETWORK) } },
		scope,
		...(strict ? { strictAutoReview: true } : {}),
	};
}

/**
 * The permissions response for one offer.
 * @param offerId The offer.
 * @param form The form.
 * @returns The response; a decline grants nothing for the turn.
 */
function permissionsResponse(offerId: string, form: WorkbenchApprovalFormState): ApprovalResponse {
	if (offerId === OFFER_DECLINE) {
		return { approvalKind: "permissions", permissions: {}, scope: "turn" };
	}
	return permissionsGrant(form);
}

/**
 * A legacy review decision, with the person's decline reason.
 * @param offerId The offer.
 * @param form The form.
 * @returns The decision, or null for an unoffered decision.
 */
function legacyDecision(offerId: string, form: WorkbenchApprovalFormState): LegacyDecision | null {
	if (offerId === OFFER_APPROVE) {
		return "approved";
	}
	if (offerId === OFFER_ABORT) {
		return "abort";
	}
	if (offerId !== OFFER_DECLINE) {
		return null;
	}
	const reason = formValue(form, DECLINE_REASON).trim();
	return { denied: { rejection: reason.length === 0 ? DEFAULT_DECLINE_REASON : reason } };
}

/**
 * The response of a legacy family.
 * @param approval The request.
 * @param offerId The offer.
 * @param form The form.
 * @returns The response, or null.
 */
function legacyResponse(
	approval: Legacy,
	offerId: string,
	form: WorkbenchApprovalFormState,
): ApprovalResponse | null {
	const decision = legacyDecision(offerId, form);
	if (decision === null) {
		return null;
	}
	return approval.approvalKind === "apply_patch"
		? { approvalKind: "apply_patch", decision }
		: { approvalKind: "exec_command", decision };
}

/**
 * The response of a family whose decisions the host enumerates: exactly the
 * host-offered decision the offer named.
 * @param approval The request.
 * @param offerId The offer.
 * @returns The response, or null for an unoffered decision.
 */
function enumeratedResponse(approval: Enumerated, offerId: string): ApprovalResponse | null {
	const index = decisionIndex(offerId);
	if (index === null) {
		return null;
	}
	if (approval.approvalKind === "command_execution") {
		const decision = approval.availableDecisions[index];
		return decision === undefined ? null : { approvalKind: "command_execution", decision };
	}
	const decision = approval.availableDecisions[index];
	return decision === undefined ? null : { approvalKind: "file_change", decision };
}

/**
 * The response of an elicitation.
 * @param approval The request.
 * @param fields The reviewed fields.
 * @param offerId The offer.
 * @param form The form.
 * @returns The response.
 */
function elicitationResponse(
	approval: Elicitation,
	fields: readonly WorkbenchApprovalField[],
	offerId: string,
	form: WorkbenchApprovalFormState,
): ApprovalResponse {
	if (offerId === OFFER_DECLINE) {
		return { approvalKind: "elicitation", action: "decline", content: null, _meta: null };
	}
	if (offerId === OFFER_CANCEL) {
		return { approvalKind: "elicitation", action: "cancel", content: null, _meta: null };
	}
	return {
		approvalKind: "elicitation",
		action: "accept",
		content: elicitationContent(approval, fields, form),
		_meta: null,
	};
}

/**
 * The response of a user-input request.
 * @param approval The request.
 * @param offerId The offer.
 * @param form The form.
 * @returns The response; a decline answers nothing.
 */
function userInputResponse(
	approval: UserInput,
	offerId: string,
	form: WorkbenchApprovalFormState,
): ApprovalResponse {
	if (offerId === OFFER_DECLINE) {
		return { approvalKind: "user_input", answers: {} };
	}
	return { approvalKind: "user_input", answers: questionAnswers(approval, form) };
}

/**
 * The response of one ordinary request for one offer.
 * @param input The draft input.
 * @returns The response, or null for an unoffered decision.
 */
function ordinaryResponse(input: OrdinaryDraftInput): ApprovalResponse | null {
	const { approval, fields, offerId, form } = input;
	switch (approval.approvalKind) {
		case "command_execution":
		case "file_change":
			return enumeratedResponse(approval, offerId);
		case "user_input":
			return userInputResponse(approval, offerId, form);
		case "elicitation":
			return elicitationResponse(approval, fields, offerId, form);
		case "permissions":
			return permissionsResponse(offerId, form);
		default:
			return legacyResponse(approval, offerId, form);
	}
}

/**
 * The permissions family's response, typed to its request.
 * @param approval The request.
 * @returns Whether the request is a permissions request.
 */
function isPermissions(approval: BrowserApproval): approval is Permissions {
	return approval.approvalKind === "permissions";
}

/**
 * The wire draft for one ordinary decision.
 * @param input The draft input.
 * @returns The draft, or the errors that stop it.
 */
function ordinaryApprovalDraft(input: OrdinaryDraftInput): WorkbenchApprovalDraftResult {
	if (input.submitsForm) {
		const errors = validateApprovalForm(input.fields, input.form);
		if (errors.length > 0) {
			return { ok: false, errors };
		}
	}
	const response = ordinaryResponse(input);
	if (response === null) {
		return invalid(UNKNOWN_OFFER);
	}
	const draft: ApprovalRespondDraft = {
		command: "approvalRespond",
		requestId: input.approval.requestId,
		approvalId: input.approval.approvalId,
		response,
	};
	return { ok: true, draft };
}

/**
 * The wire draft for one dynamic decision. A dynamic approval offers a
 * decision only while it is pending, and the closed model gives every pending
 * approval its binding, so an absent binding and an unoffered decision are
 * the same one refusal.
 * @param input The request and the offer.
 * @returns The draft, or the refusal.
 */
function dynamicApprovalDraft(input: DynamicDraftInput): WorkbenchApprovalDraftResult {
	const binding = input.approval.binding;
	const offered = input.offerId === OFFER_APPROVE || input.offerId === OFFER_DECLINE;
	if (binding === null || !offered) {
		return invalid(UNKNOWN_OFFER);
	}
	const draft: DynamicApprovalRespondDraft = {
		command: "dynamicApprovalRespond",
		capturedLink: binding.capturedLink,
		identity: input.approval.identity,
		effectHash: input.approval.effectHash,
		decision: input.offerId === OFFER_APPROVE ? "approve" : "decline",
	};
	return { ok: true, draft };
}

export {
	DEFAULT_DECLINE_REASON,
	dynamicApprovalDraft,
	isPermissions,
	ordinaryApprovalDraft,
	type DynamicDraftInput,
	type OrdinaryDraftInput,
};
