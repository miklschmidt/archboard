import { z } from "zod";

import { CODEX_APPROVAL_EXPIRY_MS } from "@/shared/timing/timing";
import {
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_STATES,
} from "@/shared/codex-browser-model/lib/dynamic-approval-effects";
import { validateDynamicApprovalState } from "@/shared/codex-browser-model/lib/dynamic-approval-lifecycle";
import type {
	createDynamicApprovalEffectSchemas,
	DynamicApprovalEffectSchemas,
} from "@/shared/codex-browser-model/lib/dynamic-approval-effects";
import {
	assertCurrentTarget,
	boundedText,
	NonNegativeIntegerSchema,
} from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

const EffectHashSchema = z
	.string()
	.regex(/^sha256:[0-9a-f]{64}$/u, "effect hash must be sha256 plus 64 lowercase hex characters");
const PaneIdSchema = boundedText(128);

/**
 * Records one custom validation issue at a path.
 * @param context - The refinement context of the schema being checked.
 * @param path - Where in the value the issue sits.
 * @param message - What is wrong.
 */
function addIssue(context: z.RefinementCtx, path: string[], message: string): void {
	context.addIssue({ code: "custom", path, message });
}

type EffectSchemas = ReturnType<typeof createDynamicApprovalEffectSchemas>;
type DynamicApprovalIdentityValue = z.infer<
	DynamicApprovalEffectSchemas["DynamicApprovalIdentitySchema"]
>;

/** Every field of a dynamic approval identity; two identities are the same when all agree. */
const IDENTITY_FIELDS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
	"operationId",
] as const satisfies readonly (keyof DynamicApprovalIdentityValue)[];

/**
 * Tells whether two approval identities name the same logical call.
 * @param left - One identity.
 * @param right - The other.
 * @returns True when every field agrees.
 */
function sameIdentity(
	left: DynamicApprovalIdentityValue,
	right: DynamicApprovalIdentityValue,
): boolean {
	return IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

/**
 * Tells whether two captured links name the same thread in the same child epoch.
 * @param left - One link.
 * @param right - The other.
 * @returns True when thread, child and epoch all agree.
 */
function sameLink(
	left: { readonly threadId: string; readonly childId: string; readonly epoch: string },
	right: { readonly threadId: string; readonly childId: string; readonly epoch: string },
): boolean {
	return (
		left.threadId === right.threadId && left.childId === right.childId && left.epoch === right.epoch
	);
}

/**
 * Builds the browser-facing dynamic approval schemas: the approval record the
 * pane shows, the response command it sends back, and the pending-aware
 * response parser that refuses a response for any approval but the one it
 * was minted for.
 * @param identity - The session's identity schemas.
 * @param context - The validator that knows the current child and epoch.
 * @param effectSchemas - The effect and identity schemas the approval embeds.
 * @returns The schemas, under their canonical and coordination-era names.
 */
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
			const window = approval.expiresAtMs - approval.createdAtMs;
			if (window <= 0 || window > CODEX_APPROVAL_EXPIRY_MS) {
				addIssue(
					refinementContext,
					["expiresAtMs"],
					`approval expiry must be after creation and at most ${CODEX_APPROVAL_EXPIRY_MS}ms after it`,
				);
			}
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
			validateResponseBinding(response, refinementContext);
		});

	/**
	 * Builds the response schema for one pending approval, so a response is
	 * accepted only when its lease, pane, link, identity and effect hash all
	 * match the approval the pane was shown.
	 * @param pending - The approval record, parsed again so a caller cannot hand in a forgery.
	 * @returns The response schema narrowed to that approval.
	 * @throws {Error} When the approval is not pending or has no binding.
	 */
	const createDynamicApprovalResponseSchema = (pending: unknown) => {
		const pendingApproval = BrowserDynamicApprovalSchema.parse(pending);
		if (pendingApproval.state !== "pending" || pendingApproval.binding === null) {
			throw new Error("dynamic approval response requires a pending approval with a binding");
		}
		const { binding } = pendingApproval;
		return BrowserDynamicApprovalResponseSchema.superRefine((response, refinementContext) => {
			if (response.commandId !== binding.commandId) {
				addIssue(
					refinementContext,
					["commandId"],
					"response command lease does not match pending approval",
				);
			}
			if (response.paneId !== binding.paneId) {
				addIssue(refinementContext, ["paneId"], "response pane does not match pending approval");
			}
			if (!sameLink(response.capturedLink, binding.capturedLink)) {
				addIssue(
					refinementContext,
					["capturedLink"],
					"response link does not match pending approval",
				);
			}
			if (!sameIdentity(response.identity, pendingApproval.identity)) {
				addIssue(
					refinementContext,
					["identity"],
					"response identity does not match pending approval",
				);
			}
			if (response.effectHash !== pendingApproval.effectHash) {
				addIssue(
					refinementContext,
					["effectHash"],
					"response effectHash does not match pending approval",
				);
			}
		});
	};
	/**
	 * Parses a response against the pending approval it answers.
	 * @param pending - The approval record.
	 * @param response - The untrusted response command.
	 * @returns The validated response.
	 */
	const parseDynamicApprovalResponse = (pending: unknown, response: unknown) =>
		createDynamicApprovalResponseSchema(pending).parse(response);

	/**
	 * Checks that a response's identity and captured link are bound to the
	 * child epoch it names and that the link does not retarget the caller.
	 * @param response - The parsed response command.
	 * @param refinementContext - Where issues are recorded.
	 */
	function validateResponseBinding(
		response: z.infer<typeof BrowserDynamicApprovalResponseSchema>,
		refinementContext: z.RefinementCtx,
	): void {
		if (
			response.identity.child !== response.childId ||
			response.identity.epoch !== response.epoch
		) {
			addIssue(
				refinementContext,
				["identity"],
				"response identity does not match current child epoch",
			);
		}
		if (
			response.capturedLink.childId !== response.childId ||
			response.capturedLink.epoch !== response.epoch
		) {
			addIssue(
				refinementContext,
				["capturedLink"],
				"captured link is not bound to current child epoch",
			);
		}
		if (response.capturedLink.threadId !== response.identity.threadId) {
			addIssue(
				refinementContext,
				["capturedLink", "threadId"],
				"captured link cannot retarget the caller",
			);
		}
	}

	/**
	 * A terminal decision arm for one outcome and the single cause that produces it.
	 * @param outcome - The decision outcome.
	 * @param cause - The cause that outcome always carries.
	 * @returns The strict decision schema.
	 */
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

	/**
	 * Checks that the effect the pane is shown belongs to the logical call in
	 * the identity: same tool, same operation, and a target that echoes the
	 * arguments rather than pointing somewhere else.
	 * @param approvalIdentity - The logical call the approval is for.
	 * @param approvalEffect - The effect as projected for the browser.
	 * @param refinementContext - Where issues are recorded.
	 */
	function validateIdentityAndBrowserEffect(
		approvalIdentity: DynamicApprovalIdentityValue,
		approvalEffect: BrowserDynamicApprovalEffectValue,
		refinementContext: z.RefinementCtx,
	): void {
		if (approvalIdentity.tool !== approvalEffect.tool) {
			addIssue(
				refinementContext,
				["effect", "tool"],
				"effect tool does not match logical call tool",
			);
		}
		if (approvalIdentity.operationId !== approvalEffect.mutationOperationId) {
			addIssue(
				refinementContext,
				["effect", "mutationOperationId"],
				"mutation OperationId is not the call OperationId",
			);
		}
		if (approvalEffect.tool === "create_thread") {
			return;
		}
		if (approvalEffect.target !== approvalEffect.arguments.threadId) {
			addIssue(refinementContext, ["effect", "target"], "target must echo effect arguments");
		}
		if (approvalEffect.tool === "fork_thread") {
			validateForkBoundary(approvalIdentity, approvalEffect, refinementContext);
		}
	}

	/**
	 * Checks a fork's effective boundary against its relation to the caller: a
	 * self fork targets the caller at the caller's turn, any other fork targets
	 * another thread at the turn its arguments named.
	 * @param approvalIdentity - The logical call the approval is for.
	 * @param approvalEffect - A fork effect.
	 * @param refinementContext - Where issues are recorded.
	 */
	function validateForkBoundary(
		approvalIdentity: DynamicApprovalIdentityValue,
		approvalEffect: Extract<BrowserDynamicApprovalEffectValue, { readonly tool: "fork_thread" }>,
		refinementContext: z.RefinementCtx,
	): void {
		if (approvalEffect.effectiveBoundary.relation === "self") {
			if (approvalEffect.arguments.threadId !== approvalIdentity.threadId) {
				addIssue(
					refinementContext,
					["effect", "arguments", "threadId"],
					"self fork must target its caller",
				);
			}
			if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalIdentity.turnId) {
				addIssue(
					refinementContext,
					["effect", "effectiveBoundary"],
					"self fork boundary must be caller turn",
				);
			}
			return;
		}
		if (approvalEffect.arguments.threadId === approvalIdentity.threadId) {
			addIssue(
				refinementContext,
				["effect", "effectiveBoundary"],
				"other fork cannot target its caller",
			);
		}
		if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalEffect.arguments.beforeTurnId) {
			addIssue(
				refinementContext,
				["effect", "effectiveBoundary"],
				"fork boundary must echo beforeTurnId",
			);
		}
	}

	/**
	 * Checks that a terminal decision echoes the approval it settles, so a
	 * decision can never be replayed onto another approval.
	 * @param approvalIdentity - The logical call the approval is for.
	 * @param approvalEffectHash - The approval's effect hash.
	 * @param decisionValue - The decision, or null while the approval is open.
	 * @param refinementContext - Where issues are recorded.
	 */
	function validateDecisionEcho(
		approvalIdentity: DynamicApprovalIdentityValue,
		approvalEffectHash: string,
		decisionValue: DynamicApprovalDecisionValue | null,
		refinementContext: z.RefinementCtx,
	): void {
		if (decisionValue === null) {
			return;
		}
		if (!sameIdentity(decisionValue.identity, approvalIdentity)) {
			addIssue(
				refinementContext,
				["decision", "identity"],
				"terminal decision must echo the full identity",
			);
		}
		if (decisionValue.effectHash !== approvalEffectHash) {
			addIssue(
				refinementContext,
				["decision", "effectHash"],
				"terminal decision must echo effectHash",
			);
		}
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
