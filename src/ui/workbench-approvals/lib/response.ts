import type {
	BrowserApproval,
	BrowserDynamicApproval,
} from "../../../shared/codex-browser-model/index.js";
import type { BrowserCommandDraft } from "../../workbench-transport/index.js";
import type {
	WorkbenchApprovalDraftResult,
	WorkbenchApprovalField,
	WorkbenchApprovalFormState,
} from "../contract.js";
import { PERMISSION_NETWORK, PERMISSION_SCOPE, PERMISSION_STRICT_REVIEW } from "./fields.js";
import { DECLINE_REASON, ELICITATION_PREFIX, QUESTION_PREFIX } from "./fields.js";
import { formFlag, formSelection, formValue, validateApprovalForm } from "./form.js";
import {
	DECISION_PREFIX,
	OFFER_ABORT,
	OFFER_APPROVE,
	OFFER_CANCEL,
	OFFER_DECLINE,
} from "./offers.js";

type ApprovalRespondDraft = Extract<BrowserCommandDraft, { readonly command: "approvalRespond" }>;
type ApprovalResponse = ApprovalRespondDraft["response"];
type DynamicRespondDraft = Extract<
	BrowserCommandDraft,
	{ readonly command: "dynamicApprovalRespond" }
>;
type UserInput = Extract<BrowserApproval, { readonly approvalKind: "user_input" }>;
type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;
type Permissions = Extract<BrowserApproval, { readonly approvalKind: "permissions" }>;
type ElicitationContent = Extract<ApprovalResponse, { readonly approvalKind: "elicitation" }>;
type PermissionsResponse = Extract<ApprovalResponse, { readonly approvalKind: "permissions" }>;
type LegacyDecision = Extract<
	ApprovalResponse,
	{ readonly approvalKind: "exec_command" }
>["decision"];

export const DEFAULT_DECLINE_REASON = "Declined at the Archboard workbench.";
const UNKNOWN_OFFER = "That decision is not offered for this request.";

function decisionIndex(offerId: string): number | null {
	if (!offerId.startsWith(DECISION_PREFIX)) return null;
	const index = Number(offerId.slice(DECISION_PREFIX.length));
	return Number.isInteger(index) && index >= 0 ? index : null;
}

function invalid(message: string): WorkbenchApprovalDraftResult {
	return { ok: false, errors: Object.freeze([{ name: "offer", message }]) };
}

function questionAnswers(
	approval: UserInput,
	form: WorkbenchApprovalFormState,
): Record<string, { readonly answers: string[] }> {
	const answers: Record<string, { readonly answers: string[] }> = {};
	for (const question of approval.questions) {
		const name = `${QUESTION_PREFIX}${question.id}`;
		const other = formValue(form, name).trim();
		const selected = question.options === null ? [] : [...formSelection(form, name)];
		const collected =
			question.options === null
				? other.length === 0
					? []
					: [other]
				: other.length === 0
					? selected
					: [...selected, other];
		answers[question.id] = { answers: collected };
	}
	return answers;
}

function elicitationContent(
	approval: Elicitation,
	fields: readonly WorkbenchApprovalField[],
	form: WorkbenchApprovalFormState,
): ElicitationContent["content"] {
	if (approval.mode === "url" || approval.fields === null) return null;
	const content: Record<string, string | number | boolean | string[]> = {};
	for (const item of fields) {
		if (!item.name.startsWith(ELICITATION_PREFIX)) continue;
		const key = item.name.slice(ELICITATION_PREFIX.length);
		if (item.control === "boolean") {
			content[key] = formFlag(form, item.name);
			continue;
		}
		if (item.control === "multi_enum") {
			const selected = [...formSelection(form, item.name)];
			if (selected.length > 0) content[key] = selected;
			continue;
		}
		const raw = formValue(form, item.name);
		if (raw.length === 0) continue;
		content[key] = item.control === "number" || item.control === "integer" ? Number(raw) : raw;
	}
	return content;
}

function permissionsGrant(
	approval: Permissions,
	form: WorkbenchApprovalFormState,
): PermissionsResponse {
	const scope = formValue(form, PERMISSION_SCOPE) === "session" ? "session" : "turn";
	const strict = formFlag(form, PERMISSION_STRICT_REVIEW);
	const network =
		approval.requestedScope.network === null
			? {}
			: { network: { enabled: formFlag(form, PERMISSION_NETWORK) } };
	return {
		approvalKind: "permissions",
		permissions: network,
		scope,
		...(strict ? { strictAutoReview: true } : {}),
	};
}

function legacyDecision(offerId: string, form: WorkbenchApprovalFormState): LegacyDecision | null {
	if (offerId === OFFER_APPROVE) return "approved";
	if (offerId === OFFER_ABORT) return "abort";
	if (offerId !== OFFER_DECLINE) return null;
	const reason = formValue(form, DECLINE_REASON).trim();
	return { denied: { rejection: reason.length === 0 ? DEFAULT_DECLINE_REASON : reason } };
}

function ordinaryResponse(
	approval: BrowserApproval,
	fields: readonly WorkbenchApprovalField[],
	offerId: string,
	form: WorkbenchApprovalFormState,
): ApprovalResponse | null {
	switch (approval.approvalKind) {
		case "command_execution": {
			const index = decisionIndex(offerId);
			const decision = index === null ? undefined : approval.availableDecisions[index];
			return decision === undefined ? null : { approvalKind: "command_execution", decision };
		}
		case "file_change": {
			const index = decisionIndex(offerId);
			const decision = index === null ? undefined : approval.availableDecisions[index];
			return decision === undefined ? null : { approvalKind: "file_change", decision };
		}
		case "user_input":
			if (offerId === OFFER_DECLINE) return { approvalKind: "user_input", answers: {} };
			return { approvalKind: "user_input", answers: questionAnswers(approval, form) };
		case "elicitation": {
			if (offerId === OFFER_DECLINE)
				return { approvalKind: "elicitation", action: "decline", content: null, _meta: null };
			if (offerId === OFFER_CANCEL)
				return { approvalKind: "elicitation", action: "cancel", content: null, _meta: null };
			return {
				approvalKind: "elicitation",
				action: "accept",
				content: elicitationContent(approval, fields, form),
				_meta: null,
			};
		}
		case "permissions":
			if (offerId === OFFER_DECLINE)
				return { approvalKind: "permissions", permissions: {}, scope: "turn" };
			return permissionsGrant(approval, form);
		case "apply_patch": {
			const decision = legacyDecision(offerId, form);
			return decision === null ? null : { approvalKind: "apply_patch", decision };
		}
		case "exec_command": {
			const decision = legacyDecision(offerId, form);
			return decision === null ? null : { approvalKind: "exec_command", decision };
		}
	}
}

export function ordinaryApprovalDraft(input: {
	readonly approval: BrowserApproval;
	readonly fields: readonly WorkbenchApprovalField[];
	readonly offerId: string;
	readonly submitsForm: boolean;
	readonly form: WorkbenchApprovalFormState;
}): WorkbenchApprovalDraftResult {
	if (input.submitsForm) {
		const errors = validateApprovalForm(input.fields, input.form);
		if (errors.length > 0) return { ok: false, errors };
	}
	const response = ordinaryResponse(input.approval, input.fields, input.offerId, input.form);
	if (response === null) return invalid(UNKNOWN_OFFER);
	const draft: ApprovalRespondDraft = {
		command: "approvalRespond",
		requestId: input.approval.requestId,
		approvalId: input.approval.approvalId,
		response,
	};
	return { ok: true, draft };
}

/**
 * The dynamic response echoes the captured link, the full identity, and the
 * immutable effect hash exactly as the host published them. Nothing here can
 * retarget the effect or widen it.
 */
export function dynamicApprovalDraft(input: {
	readonly approval: BrowserDynamicApproval;
	readonly offerId: string;
}): WorkbenchApprovalDraftResult {
	const binding = input.approval.binding;
	if (binding === null)
		return invalid("This dynamic approval has no browser binding to answer with.");
	if (input.offerId !== OFFER_APPROVE && input.offerId !== OFFER_DECLINE)
		return invalid(UNKNOWN_OFFER);
	const draft: DynamicRespondDraft = {
		command: "dynamicApprovalRespond",
		capturedLink: binding.capturedLink,
		identity: input.approval.identity,
		effectHash: input.approval.effectHash,
		decision: input.offerId === OFFER_APPROVE ? "approve" : "decline",
	};
	return { ok: true, draft };
}
