import type {
	BrowserDynamicApproval,
	BrowserDynamicApprovalEffect,
	BrowserSchemas,
} from "@/shared/codex-browser-model";
import {
	IdentityValidationError,
	type TrustedIdentityDecoder,
	type TurnId,
} from "@/shared/codex-workbench-identity";
import type { DynamicApprovalOwnerView } from "@/server/codex-workbench/lib/projection-contract";

type DynamicProjectionModel = Pick<
	BrowserSchemas,
	| "BrowserDynamicApprovalEffectSchema"
	| "BrowserDynamicApprovalSchema"
	| "BrowserSnapshotSchema"
	| "BrowserSpokenApprovalSchema"
>;

type DynamicProjectionIdentity = Pick<
	TrustedIdentityDecoder,
	"adoptThreadId" | "adoptTurnId" | "parseTurnId"
>;

/**
 * Dynamic boundaries may already carry an authority-issued turn; request arguments stay raw.
 * @param identity The trusted identity decoder.
 * @param value The boundary turn id as the owner recorded it.
 * @returns The turn id, parsed when it is authority-issued and adopted otherwise.
 */
function adoptBoundaryTurnId(identity: DynamicProjectionIdentity, value: string): TurnId {
	try {
		return identity.parseTurnId(value);
	} catch (error) {
		if (!(error instanceof IdentityValidationError) || error.code !== "invalid-shape") throw error;
		return identity.adoptTurnId(value);
	}
}

/**
 * Project the effect a coordination tool call asks approval for, adopting the
 * thread and turn identities it names.
 * @param model The browser schema owner.
 * @param identity The trusted identity decoder.
 * @param request The dynamic owner's request.
 * @returns The validated browser effect.
 */
function projectDynamicApprovalEffect(
	model: DynamicProjectionModel,
	identity: DynamicProjectionIdentity,
	request: DynamicApprovalOwnerView["request"],
): BrowserDynamicApprovalEffect {
	const effect = request.effect;
	if (effect.tool === "create_thread")
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: { prompt: effect.arguments.prompt },
			target: null,
			effectiveBoundary: null,
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});

	const threadId = identity.adoptThreadId(effect.arguments.threadId);
	if (effect.tool === "fork_thread") {
		const requestedBeforeTurnId =
			effect.arguments.beforeTurnId === null
				? null
				: identity.adoptTurnId(effect.arguments.beforeTurnId);
		const effectiveBeforeTurnId =
			effect.effectiveBoundary.beforeTurnId === null
				? null
				: adoptBoundaryTurnId(identity, effect.effectiveBoundary.beforeTurnId);
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: {
				threadId,
				beforeTurnId: requestedBeforeTurnId,
				prompt: effect.arguments.prompt,
			},
			target: threadId,
			effectiveBoundary: {
				relation: effect.effectiveBoundary.relation,
				beforeTurnId: effectiveBeforeTurnId,
			},
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});
	}

	return model.BrowserDynamicApprovalEffectSchema.parse({
		tool: effect.tool,
		arguments: { threadId, prompt: effect.arguments.prompt },
		target: threadId,
		effectiveBoundary: null,
		mutationOperationId: effect.mutationOperationId,
		initialTurnOperationId: null,
		visualSummary: effect.visualSummary,
	});
}

/**
 * Project one pending coordination approval for the browser.
 * @param model The browser schema owner.
 * @param identity The trusted identity decoder.
 * @param owner The dynamic owner's view of the approval.
 * @returns The validated browser approval.
 */
export function projectDynamicApproval(
	model: DynamicProjectionModel,
	identity: DynamicProjectionIdentity,
	owner: DynamicApprovalOwnerView,
): BrowserDynamicApproval {
	const { request, binding } = owner;
	return model.BrowserDynamicApprovalSchema.parse({
		kind: "dynamic_approval",
		state: "pending",
		identity: {
			child: request.identity.child,
			epoch: request.identity.epoch,
			threadId: request.identity.threadId,
			turnId: request.identity.turnId,
			callId: request.identity.callId,
			namespace: request.identity.namespace,
			tool: request.identity.tool,
			manifestHash: request.identity.manifestHash,
			operationId: request.identity.operationId,
		},
		effect: projectDynamicApprovalEffect(model, identity, request),
		effectHash: request.effectHash,
		createdAtMs: request.createdAtMs,
		expiresAtMs: request.expiresAtMs,
		decision: null,
		delivery: null,
		toolResult: null,
		binding: {
			commandId: binding.commandId,
			paneId: binding.paneId,
			capturedLink: {
				threadId: binding.capturedLink.threadId,
				childId: binding.capturedLink.childId,
				epoch: binding.capturedLink.epoch,
			},
		},
		resumable: false,
	});
}

export type { DynamicProjectionIdentity, DynamicProjectionModel };
