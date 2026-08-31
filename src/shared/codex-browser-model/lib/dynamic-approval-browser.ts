import { z } from "zod";

import { CODEX_APPROVAL_EXPIRY_MS } from "../../timing/timing.js";
import { DYNAMIC_APPROVAL_DECISIONS, DYNAMIC_APPROVAL_STATES } from "./dynamic-approval-effects.js";
import { validateDynamicApprovalState } from "./dynamic-approval-lifecycle.js";
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

function sameLink(
	left: { readonly threadId: string; readonly childId: string; readonly epoch: string },
	right: { readonly threadId: string; readonly childId: string; readonly epoch: string },
): boolean {
	return (
		left.threadId === right.threadId && left.childId === right.childId && left.epoch === right.epoch
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
			validateDynamicApprovalState(approval, refinementContext);
		});
	// This schema is the structural ingress arm for BrowserCommandSchema. Approval
	// handlers must use the pending-aware schema below before acting on it.
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

	const createDynamicApprovalResponseSchema = (pending: unknown) => {
		const pendingApproval = BrowserDynamicApprovalSchema.parse(pending);
		if (pendingApproval.state !== "pending" || pendingApproval.binding === null)
			throw new Error("dynamic approval response requires a pending approval with a binding");
		const { binding } = pendingApproval;
		return BrowserDynamicApprovalResponseSchema.superRefine((response, refinementContext) => {
			if (response.commandId !== binding.commandId)
				addIssue(
					refinementContext,
					["commandId"],
					"response command lease does not match pending approval",
				);
			if (response.paneId !== binding.paneId)
				addIssue(refinementContext, ["paneId"], "response pane does not match pending approval");
			if (!sameLink(response.capturedLink, binding.capturedLink))
				addIssue(
					refinementContext,
					["capturedLink"],
					"response link does not match pending approval",
				);
			if (!sameIdentity(response.identity, pendingApproval.identity))
				addIssue(
					refinementContext,
					["identity"],
					"response identity does not match pending approval",
				);
			if (response.effectHash !== pendingApproval.effectHash)
				addIssue(
					refinementContext,
					["effectHash"],
					"response effectHash does not match pending approval",
				);
		});
	};
	const parseDynamicApprovalResponse = (pending: unknown, response: unknown) =>
		createDynamicApprovalResponseSchema(pending).parse(response);

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

	return {
		DynamicApprovalStateSchema,
		DynamicApprovalDecisionSchema,
		DynamicApprovalToolResultSchema,
		DynamicApprovalBindingSchema,
		DynamicApprovalLinkSchema,
		BrowserDynamicApprovalSchema,
		BrowserDynamicApprovalResponseSchema,
		createDynamicApprovalResponseSchema,
		parseDynamicApprovalResponse,
		createPendingDynamicApprovalResponseSchema: createDynamicApprovalResponseSchema,
		parsePendingDynamicApprovalResponse: parseDynamicApprovalResponse,
		DynamicApprovalResponseSchema: BrowserDynamicApprovalResponseSchema,
		BrowserDynamicApprovalResponseCommandSchema: BrowserDynamicApprovalResponseSchema,
		DynamicCoordinationApprovalStateSchema: DynamicApprovalStateSchema,
		DynamicCoordinationApprovalResponseSchema: BrowserDynamicApprovalResponseSchema,
		createDynamicCoordinationApprovalResponseSchema: createDynamicApprovalResponseSchema,
		parseDynamicCoordinationApprovalResponse: parseDynamicApprovalResponse,
		BrowserDynamicCoordinationApprovalSchema: BrowserDynamicApprovalSchema,
	};
}
