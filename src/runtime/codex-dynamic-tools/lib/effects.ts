import type { ChildEpoch, ChildId, TurnId } from "@/shared/codex-workbench-identity";
import { CODEX_APPROVAL_EXPIRY_MS } from "@/shared/timing/timing";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicApprovalIdentity,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicImmutableEffect,
	type DynamicMutationToolName,
	type DynamicRelation,
	type DynamicTargetAuthority,
	type DynamicToolApprovalRequest,
	type DynamicToolApprovalDecision,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	createPrompt,
	dynamicEffectHash,
	forkArguments,
	freezeDeep,
	hasExactKeys,
	identityFor,
	normalizedArguments,
	sendArguments,
	summaryFor,
	type EffectArguments,
} from "@/runtime/codex-dynamic-tools/lib/effect-values";
import {
	createDynamicOperationRecoverySettlement,
	createDynamicOperationSettlement,
	issueMutationOperations,
	issueReadOperation,
	operationIdsForRetirement,
	operationWire,
	operationWireForIssuedResult,
	operationWireForResult,
	terminalizeDynamicOperationId,
	type DynamicIssuedOperations,
	type DynamicOperationSettlement,
} from "@/runtime/codex-dynamic-tools/lib/operation-identity";

/** One mutation, as it stands once a person could be asked to approve it. */
export interface PreparedDynamicMutation {
	readonly identity: DynamicApprovalIdentity;
	readonly effect: DynamicImmutableEffect;
	readonly effectHash: string;
	readonly request: DynamicToolApprovalRequest;
	readonly operations: DynamicIssuedOperations;
	readonly relation: DynamicRelation | null;
	readonly target: DynamicTargetAuthority | null;
	readonly boundary: TurnId | null;
}

/** Which child epoch something belongs to. */
export type DynamicEpochIdentity = Readonly<{
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}>;

/** The operation identities a mutation is carried out under, serialized for the wire. */
interface MutationWireIdentities {
	readonly outerOperationId: string;
	readonly initialTurnOperationId: string | null;
}

/** Everything a mutation's effect is built from besides its own arguments. */
interface EffectContext {
	readonly caller: DynamicCallerAuthority;
	readonly target: DynamicTargetAuthority | null;
	readonly relation: DynamicRelation | null;
	readonly contextAuthority: DynamicContextAuthority;
	readonly boundary: TurnId | null;
	readonly wire: MutationWireIdentities;
}

/**
 * The effect a create mutation carries. A create starts a turn as well as a thread, so it needs
 * both identities before it can be described.
 * @param argumentsValue The raw arguments.
 * @param context What the effect is built from.
 * @returns The effect.
 */
function createEffect(
	argumentsValue: EffectArguments,
	context: EffectContext,
): DynamicImmutableEffect {
	const initialTurnOperationId = context.wire.initialTurnOperationId;
	if (initialTurnOperationId === null) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"A create operation requires an initial-turn identity.",
		);
	}
	const prompt = createPrompt(normalizedArguments("create_thread", argumentsValue));
	return freezeDeep({
		tool: "create_thread",
		arguments: { prompt },
		callerAuthority: context.caller.authority,
		targetAuthority: null,
		contextAuthority: context.contextAuthority.token,
		effectiveBoundary: null,
		mutationOperationId: context.wire.outerOperationId,
		initialTurnOperationId,
		visualSummary: summaryFor("create_thread", { prompt }),
	});
}

/**
 * The effect a fork mutation carries. A fork names both the thread it forks and the turn it
 * forks before, and needs the caller's relation to that thread to say which of the two it is.
 * @param argumentsValue The raw arguments.
 * @param context What the effect is built from.
 * @returns The effect.
 */
function forkEffect(
	argumentsValue: EffectArguments,
	context: EffectContext,
): DynamicImmutableEffect {
	const target = context.target;
	const relation = context.relation;
	if (target === null || relation === null) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"A fork operation requires target authority and relation.",
		);
	}
	const fork = forkArguments(normalizedArguments("fork_thread", argumentsValue));
	const effectArguments = { ...fork };
	return freezeDeep({
		tool: "fork_thread",
		arguments: effectArguments,
		callerAuthority: context.caller.authority,
		targetAuthority: target.authority,
		contextAuthority: context.contextAuthority.token,
		effectiveBoundary: {
			relation,
			beforeTurnId: context.boundary === null ? null : String(context.boundary),
		},
		mutationOperationId: context.wire.outerOperationId,
		initialTurnOperationId: context.wire.initialTurnOperationId,
		visualSummary: summaryFor("fork_thread", effectArguments),
	});
}

/**
 * The effect a send mutation carries.
 * @param argumentsValue The raw arguments.
 * @param context What the effect is built from.
 * @returns The effect.
 */
function sendEffect(
	argumentsValue: EffectArguments,
	context: EffectContext,
): DynamicImmutableEffect {
	const target = context.target;
	if (target === null) {
		throw new CodexDynamicToolsError("invalid_call", "A send operation requires target authority.");
	}
	const send = sendArguments(normalizedArguments("send_message_to_thread", argumentsValue));
	const effectArguments = { ...send };
	return freezeDeep({
		tool: "send_message_to_thread",
		arguments: effectArguments,
		callerAuthority: context.caller.authority,
		targetAuthority: target.authority,
		contextAuthority: context.contextAuthority.token,
		effectiveBoundary: null,
		mutationOperationId: context.wire.outerOperationId,
		initialTurnOperationId: null,
		visualSummary: summaryFor("send_message_to_thread", effectArguments),
	});
}

/**
 * The effect one mutation carries, whichever of the three it is.
 * @param tool The mutation tool.
 * @param argumentsValue The raw arguments.
 * @param context What the effect is built from.
 * @returns The effect.
 */
function effectFor(
	tool: DynamicMutationToolName,
	argumentsValue: EffectArguments,
	context: EffectContext,
): DynamicImmutableEffect {
	if (tool === "create_thread") {
		return createEffect(argumentsValue, context);
	}
	return tool === "fork_thread"
		? forkEffect(argumentsValue, context)
		: sendEffect(argumentsValue, context);
}

/**
 * Everything one mutation is made of before it is put to a person.
 *
 * The effect is frozen through and hashed with the identity it will be carried out under, so a
 * person approves exactly the mutation that will run: nothing about it can be changed between
 * the approval and the effect without the hash no longer matching.
 * @param request The server request.
 * @param tool The mutation tool.
 * @param argumentsValue The raw arguments.
 * @param caller The caller's authority.
 * @param target The target's authority, when the mutation names one.
 * @param relation How the caller stands to the target, when the mutation needs it.
 * @param contextAuthority The context token the effect is carried out under.
 * @param operations The identities the call was issued.
 * @param options The dynamic tools options.
 * @param boundary The turn a fork stops before, when the mutation is a fork.
 * @param nowMs The current time.
 * @returns The prepared mutation.
 */
export function prepareMutation(
	request: DynamicServerRequest,
	tool: DynamicMutationToolName,
	argumentsValue: EffectArguments,
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority | null,
	relation: DynamicRelation | null,
	contextAuthority: DynamicContextAuthority,
	operations: DynamicIssuedOperations,
	options: CodexDynamicToolsOptions,
	boundary: TurnId | null,
	nowMs: number,
): PreparedDynamicMutation {
	const wire: MutationWireIdentities = {
		outerOperationId: operationWire(options, operations.mutationOperationId),
		initialTurnOperationId:
			operations.initialTurnOperationId === null
				? null
				: operationWire(options, operations.initialTurnOperationId),
	};
	const identity = identityFor(request.logicalCall, wire.outerOperationId);
	const effect = effectFor(tool, argumentsValue, {
		caller,
		target,
		relation,
		contextAuthority,
		boundary,
		wire,
	});
	const hash = dynamicEffectHash(identity, effect);
	const requestValue: DynamicToolApprovalRequest = freezeDeep({
		identity,
		effect,
		effectHash: hash,
		createdAtMs: nowMs,
		expiresAtMs: nowMs + CODEX_APPROVAL_EXPIRY_MS,
	});
	return Object.freeze({
		identity,
		effect,
		effectHash: hash,
		request: requestValue,
		operations,
		relation,
		target,
		boundary,
	});
}

/** The fields an approval decision carries. */
const DECISION_KEYS = ["outcome", "identity", "effectHash", "decidedAtMs", "cause"] as const;

/** The fields an approval identity carries. */
const IDENTITY_KEYS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
	"operationId",
] as const;

/** How a decision may have been reached, by outcome. */
const DECISION_CAUSES = {
	approved: ["person_approved"],
	declined: ["person_declined"],
	expired: ["deadline_reached"],
	cancelled: ["call_cancelled", "caller_turn_interrupted", "host_shutdown"],
	disconnected: ["browser_disconnected", "child_disconnected"],
} as const;

/** What an approval hash looks like. */
const EFFECT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

/**
 * Build a refusal about an approval decision.
 * @param message Human-readable explanation.
 * @returns The refusal error.
 */
function decisionError(message: string): CodexDynamicToolsError {
	return new CodexDynamicToolsError("invalid_call", message);
}

/**
 * Refuse a decision that is not the reviewed shape, or whose outcome is not one the boundary
 * knows what to do with.
 * @param decision The decision.
 */
function assertDecisionShapeAndOutcome(decision: DynamicToolApprovalDecision): void {
	// The decision comes from the browser: it is read through its own fields, so one that does
	// not match the shape the contract type claims is refused rather than believed.
	const fields: unknown = decision;
	if (typeof fields !== "object" || fields === null || !hasExactKeys(fields, DECISION_KEYS)) {
		throw decisionError("The approval decision shape is not exact.");
	}
	if (!Object.prototype.hasOwnProperty.call(DECISION_CAUSES, decision.outcome)) {
		throw decisionError("The approval decision outcome is not recognized.");
	}
}

/**
 * Refuse a decision whose cause is not one its own outcome can be reached by, which would say
 * the person's answer and the reason for it disagree.
 * @param decision The decision.
 */
function assertDecisionCause(decision: DynamicToolApprovalDecision): void {
	const causes: readonly string[] = DECISION_CAUSES[decision.outcome];
	if (!causes.includes(decision.cause)) {
		throw decisionError("The approval decision has an invalid terminal cause.");
	}
}

/**
 * Refuse a decision whose identity is not exactly the request's own, since a decision that
 * names another call would authorize a mutation nobody was asked about.
 * @param decision The decision.
 * @param request The request it answers.
 */
function assertDecisionIdentity(
	decision: DynamicToolApprovalDecision,
	request: DynamicToolApprovalRequest,
): void {
	const identity: unknown = decision.identity;
	if (typeof identity !== "object" || identity === null || !hasExactKeys(identity, IDENTITY_KEYS)) {
		throw decisionError("The approval decision identity shape is not exact.");
	}
	if (JSON.stringify(identity) !== JSON.stringify(request.identity)) {
		throw decisionError("The approval decision identity is not exact.");
	}
}

/**
 * Refuse anything an approval decision could say that its request did not ask: another shape,
 * an outcome or cause the boundary does not know, another call's identity, another effect's
 * hash, or a decision made before the request existed.
 * @param decision The decision.
 * @param request The request it answers.
 */
export function validateDecisionShape(
	decision: DynamicToolApprovalDecision,
	request: DynamicToolApprovalRequest,
): void {
	assertDecisionShapeAndOutcome(decision);
	assertDecisionCause(decision);
	assertDecisionIdentity(decision, request);
	if (
		!EFFECT_HASH_PATTERN.test(decision.effectHash) ||
		decision.effectHash !== request.effectHash
	) {
		throw decisionError("The approval decision effect hash is not exact.");
	}
	if (!Number.isSafeInteger(decision.decidedAtMs) || decision.decidedAtMs < request.createdAtMs) {
		throw decisionError("The approval decision timestamp is invalid.");
	}
}

/**
 * Whether an approval request has run out of time.
 * @param request The request.
 * @param nowMs The current time.
 * @returns Whether it has expired.
 */
export function approvalExpiry(request: DynamicToolApprovalRequest, nowMs: number): boolean {
	return nowMs >= request.expiresAtMs;
}

/**
 * Whether a decision means the child itself disconnected rather than the approval being
 * answered.
 * @param decision The decision.
 * @returns Whether the child disconnected.
 */
export function isChildDisconnect(decision: DynamicToolApprovalDecision): boolean {
	return decision.cause === "child_disconnected";
}

/**
 * Whether a decision leaves the mutation still needing an approval: nobody answered, so the
 * caller must ask again rather than treat the silence as a refusal.
 * @param decision The decision.
 * @returns Whether an approval is still required.
 */
export function isApprovalRequired(decision: DynamicToolApprovalDecision): boolean {
	return (
		decision.outcome === "cancelled" ||
		(decision.outcome === "disconnected" && decision.cause === "browser_disconnected")
	);
}

export {
	type DynamicIssuedOperations,
	type DynamicOperationSettlement,
	createDynamicOperationRecoverySettlement,
	createDynamicOperationSettlement,
	dynamicEffectHash,
	issueMutationOperations,
	issueReadOperation,
	operationIdsForRetirement,
	operationWireForIssuedResult,
	operationWireForResult,
	terminalizeDynamicOperationId,
};
