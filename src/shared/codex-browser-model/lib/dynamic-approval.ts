import { z } from "zod";

import { CODEX_APPROVAL_EXPIRY_MS } from "../../timing/timing.js";
import { createDynamicApprovalBrowserSchemas } from "./dynamic-approval-browser.js";
import { effectHashFor } from "./dynamic-approval-hash.js";
import {
	createDynamicApprovalEffectSchemas,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_STATES,
	DYNAMIC_APPROVAL_TOOLS,
} from "./dynamic-approval-effects.js";
import type { DynamicApprovalEffectSchemas } from "./dynamic-approval-effects.js";
import { NonNegativeIntegerSchema } from "./scalars.js";
import type { IdentityContext, IdentitySchemas } from "./scalars.js";

const EffectHashSchema = z
	.string()
	.regex(/^sha256:[0-9a-f]{64}$/u, "effect hash must be sha256 plus 64 lowercase hex characters");

type CanonicalIdentity = {
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

type EffectSchemas = ReturnType<typeof createDynamicApprovalEffectSchemas>;
type DynamicApprovalIdentityValue = z.infer<
	DynamicApprovalEffectSchemas["DynamicApprovalIdentitySchema"]
>;
type DynamicApprovalEffectValue = z.infer<
	DynamicApprovalEffectSchemas["DynamicApprovalEffectSchema"]
>;

function validateIdentityAndEffect(
	approvalIdentity: DynamicApprovalIdentityValue,
	approvalEffect: DynamicApprovalEffectValue,
	refinementContext: z.RefinementCtx,
): void {
	if (approvalIdentity.tool !== approvalEffect.tool)
		refinementContext.addIssue({
			code: "custom",
			path: ["effect", "tool"],
			message: "effect tool does not match logical call tool",
		});
	if (approvalIdentity.operationId !== approvalEffect.mutationOperationId)
		refinementContext.addIssue({
			code: "custom",
			path: ["effect", "mutationOperationId"],
			message: "mutation OperationId must be the call OperationId",
		});
	if (approvalEffect.tool === "create_thread") {
		if (approvalEffect.targetAuthority !== null)
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "targetAuthority"],
				message: "create has no target authority",
			});
		return;
	}
	if (approvalEffect.tool !== "fork_thread") return;
	if (approvalEffect.effectiveBoundary.relation === "self") {
		if (approvalEffect.arguments.threadId !== approvalIdentity.threadId)
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "arguments", "threadId"],
				message: "self fork must target its caller",
			});
		if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalIdentity.turnId)
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "effectiveBoundary"],
				message: "self fork boundary must be caller turn",
			});
	} else {
		if (approvalEffect.arguments.threadId === approvalIdentity.threadId)
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "effectiveBoundary"],
				message: "other fork cannot target its caller",
			});
		if (approvalEffect.effectiveBoundary.beforeTurnId !== approvalEffect.arguments.beforeTurnId)
			refinementContext.addIssue({
				code: "custom",
				path: ["effect", "effectiveBoundary"],
				message: "fork boundary must echo beforeTurnId",
			});
	}
}

function canonicalHashInput(
	approvalIdentity: CanonicalIdentity,
	approvalEffect: z.infer<EffectSchemas["DynamicApprovalEffectSchema"]>,
): string {
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
			arguments: approvalEffect.arguments,
			callerAuthority: approvalEffect.callerAuthority,
			targetAuthority: approvalEffect.targetAuthority,
			contextAuthority: approvalEffect.contextAuthority,
			effectiveBoundary: approvalEffect.effectiveBoundary,
			mutationOperationId: approvalEffect.mutationOperationId,
			initialTurnOperationId: approvalEffect.initialTurnOperationId,
			visualSummary: approvalEffect.visualSummary,
		},
	});
}

export function createDynamicApprovalSchemas(identity: IdentitySchemas, context: IdentityContext) {
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
			if (request.expiresAtMs - request.createdAtMs !== CODEX_APPROVAL_EXPIRY_MS)
				refinementContext.addIssue({
					code: "custom",
					path: ["expiresAtMs"],
					message: `expiry must be exactly ${CODEX_APPROVAL_EXPIRY_MS}ms after creation`,
				});
			if (
				request.effectHash !== effectHashFor(canonicalHashInput(request.identity, request.effect))
			)
				refinementContext.addIssue({
					code: "custom",
					path: ["effectHash"],
					message: "effectHash does not match identity and effect",
				});
		});

	const browserSchemas = createDynamicApprovalBrowserSchemas(identity, context, effectSchemas);
	return {
		...effectSchemas,
		...browserSchemas,
		DynamicApprovalRequestSchema,
		DynamicCoordinationApprovalRequestSchema: DynamicApprovalRequestSchema,
		effectHashForRequest: (input: {
			identity: DynamicApprovalIdentityValue;
			effect: DynamicApprovalEffectValue;
		}): string => effectHashFor(canonicalHashInput(input.identity, input.effect)),
	};
}

export type DynamicApprovalSchemas = ReturnType<typeof createDynamicApprovalSchemas>;
export type DynamicApprovalIdentity = z.infer<
	DynamicApprovalSchemas["DynamicApprovalIdentitySchema"]
>;
export type DynamicApprovalEffect = z.infer<DynamicApprovalSchemas["DynamicApprovalEffectSchema"]>;
export type DynamicApprovalRequest = z.infer<
	DynamicApprovalSchemas["DynamicApprovalRequestSchema"]
>;
export type DynamicApprovalState = z.infer<DynamicApprovalSchemas["DynamicApprovalStateSchema"]>;
export type DynamicApprovalDecision = z.infer<
	DynamicApprovalSchemas["DynamicApprovalDecisionSchema"]
>;
export type DynamicApprovalToolResult = z.infer<
	DynamicApprovalSchemas["DynamicApprovalToolResultSchema"]
>;
export type DynamicApprovalLink = z.infer<DynamicApprovalSchemas["DynamicApprovalLinkSchema"]>;
export type DynamicApprovalBinding = z.infer<
	DynamicApprovalSchemas["DynamicApprovalBindingSchema"]
>;
export type BrowserDynamicApprovalEffect = z.infer<
	DynamicApprovalSchemas["BrowserDynamicApprovalEffectSchema"]
>;
export type BrowserDynamicApproval = z.infer<
	DynamicApprovalSchemas["BrowserDynamicApprovalSchema"]
>;
export type BrowserDynamicApprovalResponse = z.infer<
	DynamicApprovalSchemas["BrowserDynamicApprovalResponseSchema"]
>;
export type DynamicApprovalResponse = BrowserDynamicApprovalResponse;
export type BrowserDynamicApprovalResponseCommand = BrowserDynamicApprovalResponse;
export type DynamicCoordinationApprovalRequest = DynamicApprovalRequest;
export type DynamicCoordinationApprovalState = DynamicApprovalState;
export type DynamicCoordinationApprovalResponse = BrowserDynamicApprovalResponse;
export type BrowserDynamicCoordinationApproval = BrowserDynamicApproval;

export {
	CODEX_APPROVAL_EXPIRY_MS,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_STATES,
	DYNAMIC_APPROVAL_TOOLS,
};
