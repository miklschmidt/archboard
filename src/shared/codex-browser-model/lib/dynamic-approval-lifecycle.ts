import type { DYNAMIC_APPROVAL_STATES } from "@/shared/codex-browser-model/lib/dynamic-approval-effects";
import type { z } from "zod";

type DynamicApprovalStateName = (typeof DYNAMIC_APPROVAL_STATES)[number];
interface ApprovalRelation {
	readonly decision: string;
	readonly cause: string;
	readonly delivery: string;
	readonly toolResult: string;
	readonly binding: "required" | "none";
	readonly resumable: false;
}
interface ApprovalRelationValue {
	readonly state: DynamicApprovalStateName;
	readonly decision: { readonly outcome: string; readonly cause: string } | null;
	readonly delivery: string | null;
	readonly toolResult: string | null;
	readonly binding: object | null;
	readonly resumable: boolean;
}
interface ApprovalIssueContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

const APPROVED_STALE_FAILURES = [
	"refused:expired",
	"refused:invalid_call",
	"refused:stale_child",
	"refused:prior_epoch",
	"refused:unknown_provenance",
	"refused:not_loaded",
	"refused:not_controllable",
	"refused:system_error",
	"refused:busy",
	"refused:cycle",
] as const;
const APPROVAL_RELATIONS: Record<DynamicApprovalStateName, readonly ApprovalRelation[]> = {
	pending: [
		{
			decision: "none",
			cause: "none",
			delivery: "none",
			toolResult: "none",
			binding: "required",
			resumable: false,
		},
	],
	approved: [
		{
			decision: "approved",
			cause: "person_approved",
			delivery: "none",
			toolResult: "none",
			binding: "none",
			resumable: false,
		},
	],
	declined: [
		{
			decision: "declined",
			cause: "person_declined",
			delivery: "none",
			toolResult: "refused:approval_declined",
			binding: "none",
			resumable: false,
		},
	],
	expired: [
		{
			decision: "expired",
			cause: "deadline_reached",
			delivery: "none",
			toolResult: "refused:expired",
			binding: "none",
			resumable: false,
		},
	],
	cancelled: [
		{
			decision: "cancelled",
			cause: "call_cancelled",
			delivery: "none",
			toolResult: "approval_required",
			binding: "none",
			resumable: false,
		},
		{
			decision: "cancelled",
			cause: "caller_turn_interrupted",
			delivery: "none",
			toolResult: "approval_required",
			binding: "none",
			resumable: false,
		},
		{
			decision: "cancelled",
			cause: "host_shutdown",
			delivery: "none",
			toolResult: "approval_required",
			binding: "none",
			resumable: false,
		},
	],
	disconnected: [
		{
			decision: "disconnected",
			cause: "browser_disconnected",
			delivery: "none",
			toolResult: "approval_required",
			binding: "none",
			resumable: false,
		},
		{
			decision: "disconnected",
			cause: "child_disconnected",
			delivery: "not_delivered",
			toolResult: "transport_not_delivered",
			binding: "none",
			resumable: false,
		},
	],
	stale: APPROVED_STALE_FAILURES.map((toolResult) => ({
		decision: "approved",
		cause: "person_approved",
		delivery: "none",
		toolResult,
		binding: "none",
		resumable: false,
	})),
	delivered: [
		{
			decision: "approved",
			cause: "person_approved",
			delivery: "delivered",
			toolResult: "none",
			binding: "none",
			resumable: false,
		},
	],
	not_delivered: [
		{
			decision: "approved",
			cause: "person_approved",
			delivery: "not_delivered",
			toolResult: "transport_not_delivered",
			binding: "none",
			resumable: false,
		},
	],
	outcome_unknown: [
		{
			decision: "approved",
			cause: "person_approved",
			delivery: "outcome_unknown",
			toolResult: "none",
			binding: "none",
			resumable: false,
		},
	],
};

/** The relation facts, in the order they are compared. */
const RELATION_FIELDS = [
	"decision",
	"cause",
	"delivery",
	"toolResult",
	"binding",
	"resumable",
] as const satisfies readonly (keyof ApprovalRelation)[];

/**
 * Reads the decision outcome and cause an approval carries, `none` for an
 * approval that has no decision yet.
 * @param decision - The approval's decision, or null.
 * @returns The outcome and cause as relation facts.
 */
function decisionFacts(decision: ApprovalRelationValue["decision"]): {
	readonly decision: string;
	readonly cause: string;
} {
	return decision === null
		? { decision: "none", cause: "none" }
		: { decision: decision.outcome, cause: decision.cause };
}

/**
 * Projects an approval onto the relation facts its state arm is described by.
 * @param approval - The approval record.
 * @returns The same fields an `ApprovalRelation` names, with absent values as `none`.
 */
function relationOfApproval(
	approval: ApprovalRelationValue,
): Readonly<Record<keyof ApprovalRelation, string | boolean>> {
	return {
		...decisionFacts(approval.decision),
		delivery: approval.delivery ?? "none",
		toolResult: approval.toolResult ?? "none",
		binding: approval.binding === null ? "none" : "required",
		resumable: approval.resumable,
	};
}

/**
 * Tells whether an approval's fields match one arm of its state.
 * @param approval - The approval record.
 * @param relation - One allowed arm of the approval's state.
 * @returns True when every relation fact agrees.
 */
function matchesApprovalRelation(
	approval: ApprovalRelationValue,
	relation: ApprovalRelation,
): boolean {
	const actual = relationOfApproval(approval);
	return RELATION_FIELDS.every((field) => actual[field] === relation[field]);
}

/**
 * Refuses an approval whose decision, delivery, tool result, binding and
 * resumable flag do not form one of the arms its state allows.
 * @param approval - The approval record.
 * @param refinementContext - Where the issue is recorded.
 */
export function validateDynamicApprovalState(
	approval: ApprovalRelationValue,
	refinementContext: ApprovalIssueContext,
): void {
	if (
		!APPROVAL_RELATIONS[approval.state].some((relation) =>
			matchesApprovalRelation(approval, relation),
		)
	) {
		refinementContext.addIssue({
			code: "custom",
			path: ["state"],
			message:
				"decision, delivery, toolResult, binding, and resumable fields are not a valid state arm",
		});
	}
}
