import { z } from "zod";

import { CODEX_APPROVAL_EXPIRY_MS } from "../../timing/timing.js";
import { DYNAMIC_APPROVAL_DECISIONS, DYNAMIC_APPROVAL_STATES } from "./dynamic-approval-effects.js";
import type {
	createDynamicApprovalEffectSchemas,
	DynamicApprovalEffectSchemas,
} from "./dynamic-approval-effects.js";
import { assertCurrentTarget, boundedText, NonNegativeIntegerSchema } from "./scalars.js";
import type { IdentityContext, IdentitySchemas } from "./scalars.js";

const EffectHashSchema = z
	.string()
	.regex(/^sha256:[0-9a-f]{64}$/u, "effect hash must be sha256 plus 64 lowercase hex characters");
const PaneIdSchema = boundedText(128);

function addIssue(context: z.RefinementCtx, path: string[], message: string): void {
	context.addIssue({ code: "custom", path, message });
}

type EffectSchemas = ReturnType<typeof createDynamicApprovalEffectSchemas>;
type DynamicApprovalIdentityValue = z.infer<
	DynamicApprovalEffectSchemas["DynamicApprovalIdentitySchema"]
>;

function sameIdentity(
	left: DynamicApprovalIdentityValue,
	right: DynamicApprovalIdentityValue,
): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId &&
		left.turnId === right.turnId &&
		left.callId === right.callId &&
		left.namespace === right.namespace &&
		left.tool === right.tool &&
		left.manifestHash === right.manifestHash &&
		left.operationId === right.operationId
	);
}

export function createDynamicApprovalBrowserSchemas(
	identity: IdentitySchemas,
	context: IdentityContext,
	effectSchemas: EffectSchemas,
) {
	const { BrowserDynamicApprovalEffectSchema, DynamicApprovalIdentitySchema } = effectSchemas;
	const { BrowserCommandIdSchema, ChildEpochSchema, ChildIdSchema, ThreadIdSchema } = identity;

	type BrowserDynamicApprovalEffectValue = z.infer<typeof BrowserDynamicApprovalEffectSchema>;

	const DynamicApprovalStateSchema = z.enum(DYNAMIC_APPROVAL_STATES);
	const DynamicApprovalDecisionSchema = z.discriminatedUnion("outcome", [
		decision("approved", "person_approved"),
		decision("declined", "person_declined"),
		decision("expired", "deadline_reached"),
		z
			.object({
				outcome: z.literal("cancelled"),
				identity: DynamicApprovalIdentitySchema,
				effectHash: EffectHashSchema,
				decidedAtMs: NonNegativeIntegerSchema,
				cause: z.enum(["call_cancelled", "caller_turn_interrupted", "host_shutdown"]),
			})
			.strict(),
		z
			.object({
				outcome: z.literal("disconnected"),
				identity: DynamicApprovalIdentitySchema,
				effectHash: EffectHashSchema,
				decidedAtMs: NonNegativeIntegerSchema,
				cause: z.enum(["browser_disconnected", "child_disconnected"]),
			})
			.strict(),
	]);
	const DynamicApprovalToolResultSchema = z.enum([
		"approval_required",
		"refused:approval_declined",
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
		"transport_not_delivered",
	]);
	type DynamicApprovalDecisionValue = z.infer<typeof DynamicApprovalDecisionSchema>;
	const DynamicApprovalLinkSchema = z
		.object({ threadId: ThreadIdSchema, childId: ChildIdSchema, epoch: ChildEpochSchema })
		.strict();
	const DynamicApprovalBindingSchema = z
		.object({
			commandId: BrowserCommandIdSchema,
			paneId: PaneIdSchema,
			capturedLink: DynamicApprovalLinkSchema,
		})
		.strict()
		.superRefine((binding, refinementContext) => {
			try {
				assertCurrentTarget(context.validator, binding.capturedLink);
			} catch (error) {
				addIssue(
					refinementContext,
					["capturedLink", "epoch"],
					error instanceof Error ? error.message : "captured link is not current",
				);
			}
		});

	const BrowserDynamicApprovalSchema = z
		.object({
			kind: z.literal("dynamic_approval"),
			state: DynamicApprovalStateSchema,
			identity: DynamicApprovalIdentitySchema,
			effect: BrowserDynamicApprovalEffectSchema,
			effectHash: EffectHashSchema,
			createdAtMs: NonNegativeIntegerSchema,
			expiresAtMs: NonNegativeIntegerSchema,
			decision: DynamicApprovalDecisionSchema.nullable(),
			delivery: z.enum(["delivered", "not_delivered", "outcome_unknown"]).nullable(),
			toolResult: DynamicApprovalToolResultSchema.nullable(),
			binding: DynamicApprovalBindingSchema.nullable(),
			resumable: z.literal(false),
		})
		.strict()
		.superRefine((approval, refinementContext) => {
			validateIdentityAndBrowserEffect(approval.identity, approval.effect, refinementContext);
			if (approval.expiresAtMs - approval.createdAtMs !== CODEX_APPROVAL_EXPIRY_MS)
				addIssue(
					refinementContext,
					["expiresAtMs"],
					`approval expiry must be exactly ${CODEX_APPROVAL_EXPIRY_MS}ms after creation`,
				);
			validateDecisionEcho(
				approval.identity,
				approval.effectHash,
				approval.decision,
				refinementContext,
			);
			validateApprovalState(approval, refinementContext);
		});
	type BrowserDynamicApprovalValue = z.infer<typeof BrowserDynamicApprovalSchema>;

	const BrowserDynamicApprovalResponseSchema = z
		.object({
			kind: z.literal("browser_command"),
			command: z.literal("dynamicApprovalRespond"),
			// commandId is the lease identity from the browser command lease.
			commandId: BrowserCommandIdSchema,
			paneId: PaneIdSchema,
			childId: ChildIdSchema,
			epoch: ChildEpochSchema,
			capturedLink: DynamicApprovalLinkSchema,
			identity: DynamicApprovalIdentitySchema,
			effectHash: EffectHashSchema,
			decision: z.enum(DYNAMIC_APPROVAL_DECISIONS),
		})
		.strict()
		.superRefine((response, refinementContext) => {
			try {
				assertCurrentTarget(context.validator, response);
			} catch (error) {
				addIssue(
					refinementContext,
					["epoch"],
					error instanceof Error ? error.message : "response target is not current",
				);
			}
			if (
				response.identity.child !== response.childId ||
				response.identity.epoch !== response.epoch
			)
				addIssue(
					refinementContext,
					["identity"],
					"response identity does not match current child epoch",
				);
			if (
				response.capturedLink.childId !== response.childId ||
				response.capturedLink.epoch !== response.epoch
			)
				addIssue(
					refinementContext,
					["capturedLink"],
					"captured link is not bound to current child epoch",
				);
			if (response.capturedLink.threadId !== response.identity.threadId)
				addIssue(
					refinementContext,
					["capturedLink", "threadId"],
					"captured link cannot retarget the caller",
				);
		});

	function decision(
		outcome: "approved" | "declined" | "expired",
		cause: "person_approved" | "person_declined" | "deadline_reached",
	) {
		return z
			.object({
				outcome: z.literal(outcome),
				identity: DynamicApprovalIdentitySchema,
				effectHash: EffectHashSchema,
				decidedAtMs: NonNegativeIntegerSchema,
				cause: z.literal(cause),
			})
			.strict();
	}

	function validateIdentityAndBrowserEffect(
		approvalIdentity: DynamicApprovalIdentityValue,
		approvalEffect: BrowserDynamicApprovalEffectValue,
		refinementContext: z.RefinementCtx,
	): void {
		if (approvalIdentity.tool !== approvalEffect.tool)
			addIssue(
				refinementContext,
				["effect", "tool"],
				"effect tool does not match logical call tool",
			);
		if (approvalIdentity.operationId !== approvalEffect.mutationOperationId)
			addIssue(
				refinementContext,
				["effect", "mutationOperationId"],
				"mutation OperationId is not the call OperationId",
			);
		if (approvalEffect.tool === "create_thread") return;
		if (approvalEffect.target !== approvalEffect.arguments.threadId)
			addIssue(refinementContext, ["effect", "target"], "target must echo effect arguments");
		if (approvalEffect.tool === "fork_thread") {
			if (approvalEffect.effectiveBoundary.relation === "self") {
				if (approvalEffect.arguments.threadId !== approvalIdentity.threadId)
					addIssue(
						refinementContext,
						["effect", "arguments", "threadId"],
						"self fork must target its caller",
					);
				if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalIdentity.turnId)
					addIssue(
						refinementContext,
						["effect", "effectiveBoundary"],
						"self fork boundary must be caller turn",
					);
			} else {
				if (approvalEffect.arguments.threadId === approvalIdentity.threadId)
					addIssue(
						refinementContext,
						["effect", "effectiveBoundary"],
						"other fork cannot target its caller",
					);
				if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalEffect.arguments.beforeTurnId)
					addIssue(
						refinementContext,
						["effect", "effectiveBoundary"],
						"fork boundary must echo beforeTurnId",
					);
			}
		}
	}

	function validateDecisionEcho(
		approvalIdentity: DynamicApprovalIdentityValue,
		approvalEffectHash: string,
		decisionValue: DynamicApprovalDecisionValue | null,
		refinementContext: z.RefinementCtx,
	): void {
		if (decisionValue === null) return;
		if (!sameIdentity(decisionValue.identity, approvalIdentity))
			addIssue(
				refinementContext,
				["decision", "identity"],
				"terminal decision must echo the full identity",
			);
		if (decisionValue.effectHash !== approvalEffectHash)
			addIssue(
				refinementContext,
				["decision", "effectHash"],
				"terminal decision must echo effectHash",
			);
	}

	function validateApprovalState(
		approval: BrowserDynamicApprovalValue,
		refinementContext: z.RefinementCtx,
	): void {
		const outcome = approval.decision?.outcome;
		if (approval.state === "pending") {
			if (approval.binding === null)
				addIssue(refinementContext, ["binding"], "pending approval needs a browser binding");
			if (approval.decision !== null || approval.delivery !== null || approval.toolResult !== null)
				addIssue(refinementContext, ["state"], "pending approval cannot carry terminal state");
			if (
				approval.binding !== null &&
				approval.binding.capturedLink.threadId !== approval.identity.threadId
			)
				addIssue(
					refinementContext,
					["binding", "capturedLink"],
					"pending binding cannot retarget the caller",
				);
			return;
		}
		if (approval.binding !== null)
			addIssue(refinementContext, ["binding"], "terminal approval cannot retain browser authority");
		if (
			approval.state === "approved" &&
			(outcome !== "approved" || approval.delivery !== null || approval.toolResult !== null)
		)
			addIssue(
				refinementContext,
				["state"],
				"approved state must await delivery without a tool result",
			);
		if (
			approval.state === "declined" &&
			(outcome !== "declined" || approval.toolResult !== "refused:approval_declined")
		)
			addIssue(refinementContext, ["state"], "declined state has the wrong terminal result");
		if (
			approval.state === "expired" &&
			(outcome !== "expired" || approval.toolResult !== "refused:expired")
		)
			addIssue(refinementContext, ["state"], "expired state has the wrong terminal result");
		if (
			approval.state === "cancelled" &&
			(outcome !== "cancelled" || approval.toolResult !== "approval_required")
		)
			addIssue(refinementContext, ["state"], "cancelled state must be terminal approval_required");
		if (approval.state === "disconnected" && outcome !== "disconnected")
			addIssue(refinementContext, ["state"], "disconnected state needs a disconnected decision");
		if (
			approval.state === "disconnected" &&
			approval.decision?.cause === "browser_disconnected" &&
			(approval.delivery !== null || approval.toolResult !== "approval_required")
		)
			addIssue(
				refinementContext,
				["state"],
				"browser disconnect must settle as terminal approval_required",
			);
		if (
			approval.state === "disconnected" &&
			approval.decision?.cause === "child_disconnected" &&
			(approval.delivery !== "not_delivered" || approval.toolResult !== "transport_not_delivered")
		)
			addIssue(refinementContext, ["state"], "child disconnect must settle as not_delivered");
		if (
			approval.state === "stale" &&
			(outcome !== "approved" ||
				approval.toolResult === null ||
				!approval.toolResult.startsWith("refused:"))
		)
			addIssue(refinementContext, ["state"], "stale state must refuse the approved effect");
		if (
			approval.state === "delivered" &&
			(outcome !== "approved" || approval.delivery !== "delivered" || approval.toolResult !== null)
		)
			addIssue(refinementContext, ["state"], "delivered state must carry only delivered approval");
		if (
			approval.state === "not_delivered" &&
			(outcome !== "approved" ||
				approval.delivery !== "not_delivered" ||
				approval.toolResult !== "transport_not_delivered")
		)
			addIssue(
				refinementContext,
				["state"],
				"not_delivered state must carry approved delivery failure",
			);
		if (
			approval.state === "outcome_unknown" &&
			(outcome !== "approved" || approval.delivery !== "outcome_unknown")
		)
			addIssue(
				refinementContext,
				["state"],
				"outcome_unknown state must carry uncertain approved delivery",
			);
	}

	return {
		DynamicApprovalStateSchema,
		DynamicApprovalDecisionSchema,
		DynamicApprovalToolResultSchema,
		DynamicApprovalBindingSchema,
		DynamicApprovalLinkSchema,
		BrowserDynamicApprovalSchema,
		BrowserDynamicApprovalResponseSchema,
		DynamicApprovalResponseSchema: BrowserDynamicApprovalResponseSchema,
		BrowserDynamicApprovalResponseCommandSchema: BrowserDynamicApprovalResponseSchema,
		DynamicCoordinationApprovalStateSchema: DynamicApprovalStateSchema,
		DynamicCoordinationApprovalResponseSchema: BrowserDynamicApprovalResponseSchema,
		BrowserDynamicCoordinationApprovalSchema: BrowserDynamicApprovalSchema,
	};
}
