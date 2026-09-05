import type { DYNAMIC_APPROVAL_STATES } from "./dynamic-approval-effects.js";
import type { z } from "zod";

type DynamicApprovalStateName = (typeof DYNAMIC_APPROVAL_STATES)[number];
type ApprovalRelation = {
	readonly decision: string;
	readonly cause: string;
	readonly delivery: string;
	readonly toolResult: string;
	readonly binding: "required" | "none";
	readonly resumable: false;
};
type ApprovalRelationValue = {
	readonly state: DynamicApprovalStateName;
	readonly decision: { readonly outcome: string; readonly cause: string } | null;
	readonly delivery: string | null;
	readonly toolResult: string | null;
	readonly binding: object | null;
	readonly resumable: boolean;
};

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

function matchesApprovalRelation(
	approval: ApprovalRelationValue,
	relation: ApprovalRelation,
): boolean {
	return (
		(approval.decision?.outcome ?? "none") === relation.decision &&
		(approval.decision?.cause ?? "none") === relation.cause &&
		(approval.delivery ?? "none") === relation.delivery &&
		(approval.toolResult ?? "none") === relation.toolResult &&
		(approval.binding === null ? "none" : "required") === relation.binding &&
		approval.resumable === relation.resumable
	);
}

export function validateDynamicApprovalState(
	approval: ApprovalRelationValue,
	refinementContext: z.RefinementCtx,
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
