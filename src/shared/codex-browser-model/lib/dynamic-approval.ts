import { z } from "zod";

import { CODEX_APPROVAL_EXPIRY_MS } from "@/shared/timing/timing";
import { createDynamicApprovalBrowserSchemas } from "@/shared/codex-browser-model/lib/dynamic-approval-browser";
import { effectHashFor } from "@/shared/codex-browser-model/lib/dynamic-approval-hash";
import {
	createDynamicApprovalEffectSchemas,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_STATES,
	DYNAMIC_APPROVAL_TOOLS,
} from "@/shared/codex-browser-model/lib/dynamic-approval-effects";
import type { DynamicApprovalEffectSchemas } from "@/shared/codex-browser-model/lib/dynamic-approval-effects";
import { NonNegativeIntegerSchema } from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

const EffectHashSchema = z
	.string()
	.regex(/^sha256:[0-9a-f]{64}$/u, "effect hash must be sha256 plus 64 lowercase hex characters");

type DynamicApprovalCanonicalIdentity = {
	readonly child: string;
	readonly epoch: string;
	readonly threadId: string;
	readonly turnId: string;
	readonly callId: string;
	readonly namespace: string;
	readonly tool: string;
	readonly manifestHash: string;
	readonly operationId: string;
};

type DynamicApprovalCanonicalEffect =
	| {
			readonly tool: "create_thread";
			readonly arguments: { readonly prompt: string };
			readonly callerAuthority: string;
			readonly targetAuthority: null;
			readonly contextAuthority: string;
			readonly effectiveBoundary: null;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: string;
			readonly visualSummary: string;
	  }
	| {
			readonly tool: "fork_thread";
			readonly arguments: {
				readonly threadId: string;
				readonly beforeTurnId: string | null;
				readonly prompt: string | null;
			};
			readonly callerAuthority: string;
			readonly targetAuthority: string;
			readonly contextAuthority: string;
			readonly effectiveBoundary:
				| { readonly relation: "self"; readonly beforeTurnId: string }
				| { readonly relation: "other"; readonly beforeTurnId: string | null };
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: string | null;
			readonly visualSummary: string;
	  }
	| {
			readonly tool: "send_message_to_thread";
			readonly arguments: { readonly threadId: string; readonly prompt: string };
			readonly callerAuthority: string;
			readonly targetAuthority: string;
			readonly contextAuthority: string;
			readonly effectiveBoundary: null;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: null;
			readonly visualSummary: string;
	  };

type DynamicApprovalCanonicalInput = {
	readonly identity: DynamicApprovalCanonicalIdentity;
	readonly effect: DynamicApprovalCanonicalEffect;
};

/**
 * Hashes the canonical JSON of an approval, the value both host and browser
 * must agree on before a decision may be applied.
 * @param value - The canonical compact JSON.
 * @returns The `sha256:`-prefixed digest.
 */
function dynamicApprovalHashForCanonicalJson(value: string): string {
	return effectHashFor(value);
}

type EffectSchemas = ReturnType<typeof createDynamicApprovalEffectSchemas>;
type DynamicApprovalIdentityValue = z.infer<
	DynamicApprovalEffectSchemas["DynamicApprovalIdentitySchema"]
>;
type DynamicApprovalEffectValue = z.infer<
	DynamicApprovalEffectSchemas["DynamicApprovalEffectSchema"]
>;

/**
 * Rebuilds a tool's arguments with only its known fields in a fixed order, so
 * the canonical JSON is the same however the input object was assembled.
 * @param argumentsValue - The arguments of any of the three tools.
 * @returns An equivalent object with the fields in canonical order.
 */
function canonicalArguments(
	argumentsValue: DynamicApprovalCanonicalEffect["arguments"],
): DynamicApprovalCanonicalEffect["arguments"] {
	if ("beforeTurnId" in argumentsValue) {
		return {
			threadId: argumentsValue.threadId,
			beforeTurnId: argumentsValue.beforeTurnId,
			prompt: argumentsValue.prompt,
		};
	}
	if ("threadId" in argumentsValue) {
		return { threadId: argumentsValue.threadId, prompt: argumentsValue.prompt };
	}
	return { prompt: argumentsValue.prompt };
}

/**
 * Rebuilds a fork boundary with its fields in canonical order.
 * @param boundary - The effective boundary, null for tools without one.
 * @returns An equivalent boundary, or null.
 */
function canonicalBoundary(
	boundary: DynamicApprovalCanonicalEffect["effectiveBoundary"],
): DynamicApprovalCanonicalEffect["effectiveBoundary"] {
	if (boundary === null) {
		return null;
	}
	if (boundary.relation === "self") {
		return { relation: "self", beforeTurnId: boundary.beforeTurnId };
	}
	return { relation: "other", beforeTurnId: boundary.beforeTurnId };
}

/**
 * Checks that the canonical effect belongs to the logical call in the
 * identity: same tool, same operation, and for a fork a boundary that agrees
 * with its relation to the caller.
 * @param approvalIdentity - The logical call the approval is for.
 * @param approvalEffect - The canonical effect.
 * @param refinementContext - Where issues are recorded.
 */
function validateIdentityAndEffect(
	approvalIdentity: DynamicApprovalIdentityValue,
	approvalEffect: DynamicApprovalEffectValue,
	refinementContext: z.RefinementCtx,
): void {
	if (approvalIdentity.tool !== approvalEffect.tool) {
		refinementContext.addIssue({
			code: "custom",
			path: ["effect", "tool"],
			message: "effect tool does not match logical call tool",
		});
	}
	if (approvalIdentity.operationId !== approvalEffect.mutationOperationId) {
		refinementContext.addIssue({
			code: "custom",
			path: ["effect", "mutationOperationId"],
			message: "mutation OperationId must be the call OperationId",
		});
	}
	if (approvalEffect.tool === "fork_thread") {
		validateForkRelation(approvalIdentity, approvalEffect, refinementContext);
	}
}

/**
 * Checks a fork's effective boundary against its relation to the caller: a
 * self fork targets the caller at the caller's turn, any other fork targets
 * another thread at the turn its arguments named.
 * @param approvalIdentity - The logical call the approval is for.
 * @param approvalEffect - A canonical fork effect.
 * @param refinementContext - Where issues are recorded.
 */
function validateForkRelation(
	approvalIdentity: DynamicApprovalIdentityValue,
	approvalEffect: Extract<DynamicApprovalEffectValue, { readonly tool: "fork_thread" }>,
	refinementContext: z.RefinementCtx,
): void {
	if (approvalEffect.effectiveBoundary.relation === "self") {
		if (approvalEffect.arguments.threadId !== approvalIdentity.threadId) {
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "arguments", "threadId"],
				message: "self fork must target its caller",
			});
		}
		if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalIdentity.turnId) {
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "effectiveBoundary"],
				message: "self fork boundary must be caller turn",
			});
		}
	} else {
		if (approvalEffect.arguments.threadId === approvalIdentity.threadId) {
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "effectiveBoundary"],
				message: "other fork cannot target its caller",
			});
		}
		if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalEffect.arguments.beforeTurnId) {
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "effectiveBoundary"],
				message: "fork boundary must echo beforeTurnId",
			});
		}
	}
}

/**
 * Spells an approval's identity and effect as compact JSON with every field
 * in a fixed order, the text the effect hash is computed over.
 * @param input - The identity and canonical effect.
 * @returns The canonical JSON.
 */
function canonicalDynamicApprovalJson(input: DynamicApprovalCanonicalInput): string {
	const { identity: approvalIdentity, effect: approvalEffect } = input;
	return JSON.stringify({
		identity: {
			child: approvalIdentity.child,
			epoch: approvalIdentity.epoch,
			threadId: approvalIdentity.threadId,
			turnId: approvalIdentity.turnId,
			callId: approvalIdentity.callId,
			namespace: approvalIdentity.namespace,
			tool: approvalIdentity.tool,
			manifestHash: approvalIdentity.manifestHash,
			operationId: approvalIdentity.operationId,
		},
		effect: {
			tool: approvalEffect.tool,
			arguments: canonicalArguments(approvalEffect.arguments),
			callerAuthority: approvalEffect.callerAuthority,
			targetAuthority: approvalEffect.targetAuthority,
			contextAuthority: approvalEffect.contextAuthority,
			effectiveBoundary: canonicalBoundary(approvalEffect.effectiveBoundary),
			mutationOperationId: approvalEffect.mutationOperationId,
			initialTurnOperationId: approvalEffect.initialTurnOperationId,
			visualSummary: approvalEffect.visualSummary,
		},
	});
}

/**
 * The canonical JSON of a parsed identity and effect, ready to hash.
 * @param approvalIdentity - The parsed identity.
 * @param approvalEffect - The parsed canonical effect.
 * @returns The canonical JSON.
 */
function canonicalHashInput(
	approvalIdentity: z.infer<EffectSchemas["DynamicApprovalIdentitySchema"]>,
	approvalEffect: z.infer<EffectSchemas["DynamicApprovalEffectSchema"]>,
): string {
	return canonicalDynamicApprovalJson({ identity: approvalIdentity, effect: approvalEffect });
}

/**
 * Builds every dynamic approval schema: the canonical request the host
 * validates and hashes, the effect and identity schemas it embeds, and the
 * browser-facing record and response schemas.
 * @param identity - The session's identity schemas.
 * @param context - The validator for the current epoch and, when present, operation ids.
 * @returns The schemas plus the canonical JSON and hashing helpers.
 */
function createDynamicApprovalSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const effectSchemas = createDynamicApprovalEffectSchemas(identity, context);
	const { DynamicApprovalIdentitySchema, DynamicApprovalEffectSchema } = effectSchemas;

	const DynamicApprovalRequestSchema = z
		.object({
			kind: z.literal("dynamic_approval_request"),
			identity: DynamicApprovalIdentitySchema,
			effect: DynamicApprovalEffectSchema,
			effectHash: EffectHashSchema,
			createdAtMs: NonNegativeIntegerSchema,
			expiresAtMs: NonNegativeIntegerSchema,
		})
		.strict()
		.superRefine((request, refinementContext) => {
			validateIdentityAndEffect(request.identity, request.effect, refinementContext);
			// A bounded window, not an exact constant: the request is valid while it
			// expires after it was created and no later than the configured bound.
			const window = request.expiresAtMs - request.createdAtMs;
			if (window <= 0 || window > CODEX_APPROVAL_EXPIRY_MS) {
				refinementContext.addIssue({
					code: "custom",
					path: ["expiresAtMs"],
					message: `expiry must be after creation and at most ${CODEX_APPROVAL_EXPIRY_MS}ms after it`,
				});
			}
			if (
				request.effectHash !== effectHashFor(canonicalHashInput(request.identity, request.effect))
			) {
				refinementContext.addIssue({
					code: "custom",
					path: ["effectHash"],
					message: "effectHash does not match identity and effect",
				});
			}
		});

	const browserSchemas = createDynamicApprovalBrowserSchemas(identity, context, effectSchemas);
	return {
		...effectSchemas,
		...browserSchemas,
		DynamicApprovalRequestSchema,
		DynamicCoordinationApprovalRequestSchema: DynamicApprovalRequestSchema,
		canonicalDynamicApprovalJson,
		dynamicApprovalHashForCanonicalJson,
		/**
		 * Computes the effect hash a request must carry for this identity and effect.
		 * @param input - The parsed identity and canonical effect.
		 * @returns The `sha256:`-prefixed digest.
		 */
		effectHashForRequest: (input: {
			identity: DynamicApprovalIdentityValue;
			effect: DynamicApprovalEffectValue;
		}): string => effectHashFor(canonicalHashInput(input.identity, input.effect)),
	};
}

type DynamicApprovalSchemas = ReturnType<typeof createDynamicApprovalSchemas>;
type DynamicApprovalIdentity = z.infer<DynamicApprovalSchemas["DynamicApprovalIdentitySchema"]>;
type DynamicApprovalEffect = z.infer<DynamicApprovalSchemas["DynamicApprovalEffectSchema"]>;
type DynamicApprovalRequest = z.infer<DynamicApprovalSchemas["DynamicApprovalRequestSchema"]>;
type DynamicApprovalState = z.infer<DynamicApprovalSchemas["DynamicApprovalStateSchema"]>;
type DynamicApprovalDecision = z.infer<DynamicApprovalSchemas["DynamicApprovalDecisionSchema"]>;
type DynamicApprovalToolResult = z.infer<DynamicApprovalSchemas["DynamicApprovalToolResultSchema"]>;
type DynamicApprovalLink = z.infer<DynamicApprovalSchemas["DynamicApprovalLinkSchema"]>;
type DynamicApprovalBinding = z.infer<DynamicApprovalSchemas["DynamicApprovalBindingSchema"]>;
type BrowserDynamicApprovalEffect = z.infer<
	DynamicApprovalSchemas["BrowserDynamicApprovalEffectSchema"]
>;
type BrowserDynamicApproval = z.infer<DynamicApprovalSchemas["BrowserDynamicApprovalSchema"]>;
type BrowserDynamicApprovalResponse = z.infer<
	DynamicApprovalSchemas["BrowserDynamicApprovalResponseSchema"]
>;
type DynamicApprovalResponse = BrowserDynamicApprovalResponse;
type BrowserDynamicApprovalResponseCommand = BrowserDynamicApprovalResponse;
type DynamicCoordinationApprovalRequest = DynamicApprovalRequest;
type DynamicCoordinationApprovalState = DynamicApprovalState;
type DynamicCoordinationApprovalResponse = BrowserDynamicApprovalResponse;
type BrowserDynamicCoordinationApproval = BrowserDynamicApproval;

export {
	type DynamicApprovalCanonicalIdentity,
	type DynamicApprovalCanonicalEffect,
	type DynamicApprovalCanonicalInput,
	dynamicApprovalHashForCanonicalJson,
	canonicalDynamicApprovalJson,
	createDynamicApprovalSchemas,
	type DynamicApprovalSchemas,
	type DynamicApprovalIdentity,
	type DynamicApprovalEffect,
	type DynamicApprovalRequest,
	type DynamicApprovalState,
	type DynamicApprovalDecision,
	type DynamicApprovalToolResult,
	type DynamicApprovalLink,
	type DynamicApprovalBinding,
	type BrowserDynamicApprovalEffect,
	type BrowserDynamicApproval,
	type BrowserDynamicApprovalResponse,
	type DynamicApprovalResponse,
	type BrowserDynamicApprovalResponseCommand,
	type DynamicCoordinationApprovalRequest,
	type DynamicCoordinationApprovalState,
	type DynamicCoordinationApprovalResponse,
	type BrowserDynamicCoordinationApproval,
	CODEX_APPROVAL_EXPIRY_MS,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_STATES,
	DYNAMIC_APPROVAL_TOOLS,
};
