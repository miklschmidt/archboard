// Mapping the committed approvals panel's choice (`@/ui/workbench/contracts`)
// onto the one offer the model allows and the reviewed answers it reads, so
// dispatch identity is decided here and nowhere else: a choice that names a
// decision the host did not offer resolves to no offer at all.

import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalFormState,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";
import { QUESTION_PREFIX } from "@/ui/workbench-approvals/lib/fields";
import { applyApprovalFormEvent, initialApprovalForm } from "@/ui/workbench-approvals/lib/form";
import {
	DECISION_PREFIX,
	OFFER_APPROVE,
	OFFER_DECLINE,
	OFFER_SUBMIT,
} from "@/ui/workbench-approvals/lib/offers";
import type { ApprovalChoice } from "@/ui/workbench/contracts";

/** The offer a choice resolves to, with the answers it reads. */
interface ResolvedChoice {
	readonly offerId: string;
	readonly form: WorkbenchApprovalFormState;
}

/**
 * Whether two host-offered decisions are the same decision.
 * @param left One decision.
 * @param right The other.
 * @returns True when they spell the same decision.
 */
function sameDecision(left: unknown, right: unknown): boolean {
	if (typeof left === "string" || typeof right === "string") {
		return left === right;
	}
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The offer id of a host-offered decision.
 * @param decisions The host's decisions.
 * @param decision The chosen one.
 * @returns The offer id, or null when the host did not offer it.
 */
function decisionOffer(decisions: readonly unknown[], decision: unknown): string | null {
	const index = decisions.findIndex((candidate) => sameDecision(candidate, decision));
	return index < 0 ? null : `${DECISION_PREFIX}${index}`;
}

/**
 * The form holding one answer to one question.
 * @param card The card.
 * @param questionId The question.
 * @param answer The answer.
 * @returns The form.
 */
function answerForm(
	card: WorkbenchOrdinaryApprovalCard,
	questionId: string,
	answer: string,
): WorkbenchApprovalFormState {
	const name = `${QUESTION_PREFIX}${questionId}`;
	const field = card.fields.find((candidate) => candidate.name === name);
	const offered = field?.options?.some((option) => option.label === answer) ?? false;
	return applyApprovalFormEvent(
		initialApprovalForm(card.fields),
		offered ? { kind: "selection", name, value: [answer] } : { kind: "value", name, value: answer },
	);
}

/**
 * The offer an ordinary "approve" resolves to.
 * @param card The card.
 * @returns The offer id, or null.
 */
function ordinaryApprove(card: WorkbenchOrdinaryApprovalCard): string | null {
	const { request } = card;
	switch (request.approvalKind) {
		case "command_execution":
		case "file_change":
			return decisionOffer(request.availableDecisions, "accept");
		case "apply_patch":
		case "exec_command":
			return OFFER_APPROVE;
		default:
			return OFFER_SUBMIT;
	}
}

/**
 * The offer an ordinary "decline" resolves to.
 * @param card The card.
 * @returns The offer id, or null.
 */
function ordinaryDecline(card: WorkbenchOrdinaryApprovalCard): string | null {
	const { request } = card;
	if (request.approvalKind === "command_execution" || request.approvalKind === "file_change") {
		return decisionOffer(request.availableDecisions, "decline");
	}
	return OFFER_DECLINE;
}

/**
 * The offer and answers an ordinary choice resolves to.
 * @param card The card.
 * @param choice The panel's choice.
 * @returns The resolution, or null when the host offers no such decision.
 */
function resolveOrdinaryChoice(
	card: WorkbenchOrdinaryApprovalCard,
	choice: ApprovalChoice,
): ResolvedChoice | null {
	const form = initialApprovalForm(card.fields);
	const decisions = "availableDecisions" in card.request ? card.request.availableDecisions : [];
	switch (choice.kind) {
		case "command_decision":
		case "file_change_decision":
			return withOffer(decisionOffer(decisions, choice.decision), form);
		case "answer":
			return { offerId: OFFER_SUBMIT, form: answerForm(card, choice.questionId, choice.answer) };
		case "approve":
			return withOffer(ordinaryApprove(card), form);
		default:
			return withOffer(ordinaryDecline(card), form);
	}
}

/**
 * A resolution, when an offer was found.
 * @param offerId The offer id, or null.
 * @param form The form.
 * @returns The resolution, or null.
 */
function withOffer(
	offerId: string | null,
	form: WorkbenchApprovalFormState,
): ResolvedChoice | null {
	return offerId === null ? null : { offerId, form };
}

/**
 * The offer and answers a panel choice resolves to on one card.
 * @param card The card.
 * @param choice The panel's choice.
 * @returns The resolution, or null when the host offers no such decision.
 */
function resolveApprovalChoice(
	card: WorkbenchApprovalCard,
	choice: ApprovalChoice,
): ResolvedChoice | null {
	if (card.kind === "ordinary") {
		return resolveOrdinaryChoice(card, choice);
	}
	if (choice.kind === "approve" || choice.kind === "decline") {
		return {
			offerId: choice.kind === "approve" ? OFFER_APPROVE : OFFER_DECLINE,
			form: initialApprovalForm([]),
		};
	}
	return null;
}

export { resolveApprovalChoice, type ResolvedChoice };
