import { createHash } from "node:crypto";

import type {
	ChildEpoch,
	ChildId,
	LogicalToolCallCorrelation,
	OperationId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_APPROVAL_EXPIRY_MS } from "../../../shared/timing/timing.js";
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
} from "./contract.js";
import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";

const EFFECT_KEYS = Object.freeze([
	"tool",
	"arguments",
	"callerAuthority",
	"targetAuthority",
	"contextAuthority",
	"effectiveBoundary",
	"mutationOperationId",
	"initialTurnOperationId",
	"visualSummary",
] as const);

export interface DynamicIssuedOperations {
	readonly resultOperationId: OperationId;
	readonly mutationOperationId: OperationId;
	readonly initialTurnOperationId: OperationId | null;
}

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

function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
	return Object.freeze(value);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
	);
}

function truncateUtf8(value: string, maximum: number): string {
	if (Buffer.byteLength(value, "utf8") <= maximum) return value;
	const ellipsis = "…";
	const budget = maximum - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > budget) break;
		result += character;
	}
	return `${result}${ellipsis}`;
}

function operationWire(options: CodexDynamicToolsOptions, operationId: OperationId): string {
	try {
		options.operationId.validateCurrentUnconsumedOperationId(operationId);
		const serialized = options.operationId.serializeForOwnedWireFields(operationId);
		if (typeof serialized !== "string" || serialized.length === 0)
			throw new Error("the operation serializer returned an empty value");
		return serialized;
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not validate a canonical dynamic operation identity.",
			error,
		);
	}
}

function identityFor(
	call: LogicalToolCallCorrelation,
	operationId: string,
): DynamicApprovalIdentity {
	return freezeDeep({
		child: call.child,
		epoch: call.epoch,
		threadId: call.threadId,
		turnId: call.turnId,
		callId: call.callId,
		namespace: call.namespace,
		tool: call.tool,
		manifestHash: call.manifestHash,
		operationId,
	});
}

function effectHash(identity: DynamicApprovalIdentity, effect: DynamicImmutableEffect): string {
	const orderedEffect: Record<string, unknown> = {};
	for (const key of EFFECT_KEYS) orderedEffect[key] = effect[key];
	const input = JSON.stringify({ identity, effect: orderedEffect });
	if (input === undefined) throw new Error("dynamic effect was not JSON serializable");
	return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

export function dynamicEffectHash(
	identity: DynamicApprovalIdentity,
	effect: DynamicImmutableEffect,
): string {
	return effectHash(identity, effect);
}

function summaryFor(
	tool: DynamicMutationToolName,
	argumentsValue: DynamicImmutableEffect["arguments"],
): string {
	let text: string;
	switch (tool) {
		case "create_thread":
			if (!("prompt" in argumentsValue) || typeof argumentsValue.prompt !== "string")
				throw new CodexDynamicToolsError("invalid_call", "The create effect prompt is invalid.");
			text = `Create thread: ${argumentsValue.prompt}`;
			break;
		case "fork_thread":
			if (
				!("threadId" in argumentsValue) ||
				!("beforeTurnId" in argumentsValue) ||
				typeof argumentsValue.threadId !== "string" ||
				(argumentsValue.prompt !== null && typeof argumentsValue.prompt !== "string")
			)
				throw new CodexDynamicToolsError("invalid_call", "The fork effect arguments are invalid.");
			text = `Fork thread ${argumentsValue.threadId}${argumentsValue.prompt === null ? "" : `: ${argumentsValue.prompt}`}`;
			break;
		case "send_message_to_thread":
			if (
				!("threadId" in argumentsValue) ||
				typeof argumentsValue.threadId !== "string" ||
				typeof argumentsValue.prompt !== "string"
			)
				throw new CodexDynamicToolsError("invalid_call", "The send effect arguments are invalid.");
			text = `Send message to thread ${argumentsValue.threadId}: ${argumentsValue.prompt}`;
			break;
	}
	return truncateUtf8(text, 512);
}

function normalizedArguments(
	tool: DynamicMutationToolName,
	value: DynamicImmutableEffect["arguments"],
): DynamicImmutableEffect["arguments"] {
	if (tool === "create_thread") {
		if (!Object.prototype.hasOwnProperty.call(value, "prompt") || typeof value.prompt !== "string")
			throw new CodexDynamicToolsError("invalid_call", "The create effect prompt is invalid.");
		return freezeDeep({ prompt: value.prompt });
	}
	if (tool === "send_message_to_thread") {
		if (
			!("threadId" in value) ||
			typeof value.threadId !== "string" ||
			typeof value.prompt !== "string"
		)
			throw new CodexDynamicToolsError("invalid_call", "The send effect arguments are invalid.");
		return freezeDeep({ threadId: value.threadId, prompt: value.prompt });
	}
	if (
		!("threadId" in value) ||
		!("beforeTurnId" in value) ||
		typeof value.threadId !== "string" ||
		(value.beforeTurnId !== null && typeof value.beforeTurnId !== "string") ||
		(value.prompt !== null && typeof value.prompt !== "string")
	)
		throw new CodexDynamicToolsError("invalid_call", "The fork effect arguments are invalid.");
	return freezeDeep({
		threadId: value.threadId,
		beforeTurnId: value.beforeTurnId,
		prompt: value.prompt,
	});
}

export function issueMutationOperations(
	tool: DynamicMutationToolName,
	options: CodexDynamicToolsOptions,
	hasInitialTurn: boolean,
): DynamicIssuedOperations {
	const mutationOperationId = options.operationId.issueCanonicalOperationId();
	const initialTurnOperationId = hasInitialTurn
		? options.operationId.issueCanonicalOperationId()
		: null;
	return Object.freeze({
		resultOperationId: mutationOperationId,
		mutationOperationId,
		initialTurnOperationId,
	});
}

export function issueReadOperation(options: CodexDynamicToolsOptions): {
	readonly resultOperationId: OperationId;
} {
	return Object.freeze({ resultOperationId: options.operationId.issueCanonicalOperationId() });
}

export function prepareMutation(
	request: DynamicServerRequest,
	tool: DynamicMutationToolName,
	argumentsValue: DynamicImmutableEffect["arguments"],
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority | null,
	relation: DynamicRelation | null,
	contextAuthority: DynamicContextAuthority,
	operations: DynamicIssuedOperations,
	options: CodexDynamicToolsOptions,
	boundary: TurnId | null,
	nowMs: number,
): PreparedDynamicMutation {
	const outerOperationId = operationWire(options, operations.mutationOperationId);
	const initialTurnOperationId =
		operations.initialTurnOperationId === null
			? null
			: operationWire(options, operations.initialTurnOperationId);
	const identity = identityFor(request.logicalCall, outerOperationId);
	let effect: DynamicImmutableEffect;
	if (tool === "create_thread") {
		if (initialTurnOperationId === null)
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A create operation requires an initial-turn identity.",
			);
		const effectArguments = normalizedArguments(tool, argumentsValue);
		if (!("prompt" in effectArguments) || typeof effectArguments.prompt !== "string")
			throw new CodexDynamicToolsError("invalid_call", "The create effect prompt is invalid.");
		effect = freezeDeep({
			tool,
			arguments: { prompt: effectArguments.prompt },
			callerAuthority: caller.authority,
			targetAuthority: null,
			contextAuthority: contextAuthority.token,
			effectiveBoundary: null,
			mutationOperationId: outerOperationId,
			initialTurnOperationId,
			visualSummary: summaryFor(tool, { prompt: effectArguments.prompt }),
		});
	} else if (tool === "fork_thread") {
		if (target === null || relation === null)
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A fork operation requires target authority and relation.",
			);
		const effectArguments = normalizedArguments(tool, argumentsValue);
		if (
			!("threadId" in effectArguments) ||
			!("beforeTurnId" in effectArguments) ||
			typeof effectArguments.threadId !== "string" ||
			(effectArguments.beforeTurnId !== null && typeof effectArguments.beforeTurnId !== "string") ||
			(effectArguments.prompt !== null && typeof effectArguments.prompt !== "string")
		)
			throw new CodexDynamicToolsError("invalid_call", "The fork effect arguments are invalid.");
		effect = freezeDeep({
			tool,
			arguments: {
				threadId: effectArguments.threadId,
				beforeTurnId: effectArguments.beforeTurnId,
				prompt: effectArguments.prompt,
			},
			callerAuthority: caller.authority,
			targetAuthority: target.authority,
			contextAuthority: contextAuthority.token,
			effectiveBoundary: {
				relation,
				beforeTurnId: boundary === null ? null : String(boundary),
			},
			mutationOperationId: outerOperationId,
			initialTurnOperationId,
			visualSummary: summaryFor(tool, {
				threadId: effectArguments.threadId,
				beforeTurnId: effectArguments.beforeTurnId,
				prompt: effectArguments.prompt,
			}),
		});
	} else {
		if (target === null)
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A send operation requires target authority.",
			);
		const effectArguments = normalizedArguments(tool, argumentsValue);
		if (
			!("threadId" in effectArguments) ||
			typeof effectArguments.threadId !== "string" ||
			typeof effectArguments.prompt !== "string"
		)
			throw new CodexDynamicToolsError("invalid_call", "The send effect arguments are invalid.");
		effect = freezeDeep({
			tool,
			arguments: { threadId: effectArguments.threadId, prompt: effectArguments.prompt },
			callerAuthority: caller.authority,
			targetAuthority: target.authority,
			contextAuthority: contextAuthority.token,
			effectiveBoundary: null,
			mutationOperationId: outerOperationId,
			initialTurnOperationId: null,
			visualSummary: summaryFor(tool, {
				threadId: effectArguments.threadId,
				prompt: effectArguments.prompt,
			}),
		});
	}
	const hash = effectHash(identity, effect);
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

export function operationWireForResult(
	options: CodexDynamicToolsOptions,
	operationId: OperationId,
): string {
	try {
		const serialized = options.operationId.serializeForOwnedWireFields(operationId);
		if (typeof serialized !== "string" || serialized.length === 0)
			throw new Error("the operation serializer returned an empty value");
		return serialized;
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not serialize the canonical dynamic operation identity.",
			error,
		);
	}
}

/** Serialize a newly issued result identity before it is exposed on the wire. */
export function operationWireForIssuedResult(
	options: CodexDynamicToolsOptions,
	operationId: OperationId,
): string {
	try {
		options.operationId.validateCurrentUnconsumedOperationId(operationId);
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The host could not validate a canonical dynamic operation identity.",
			error,
		);
	}
	return operationWireForResult(options, operationId);
}

export function validateDecisionShape(
	decision: DynamicToolApprovalDecision,
	request: DynamicToolApprovalRequest,
): void {
	if (
		typeof decision !== "object" ||
		decision === null ||
		!hasExactKeys(decision, ["outcome", "identity", "effectHash", "decidedAtMs", "cause"])
	)
		throw new CodexDynamicToolsError("invalid_call", "The approval decision shape is not exact.");
	if (
		decision.outcome !== "approved" &&
		decision.outcome !== "declined" &&
		decision.outcome !== "expired" &&
		decision.outcome !== "cancelled" &&
		decision.outcome !== "disconnected"
	)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The approval decision outcome is not recognized.",
		);
	if (
		typeof decision.identity !== "object" ||
		decision.identity === null ||
		!hasExactKeys(decision.identity, [
			"child",
			"epoch",
			"threadId",
			"turnId",
			"callId",
			"namespace",
			"tool",
			"manifestHash",
			"operationId",
		])
	)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The approval decision identity shape is not exact.",
		);
	if (
		(decision.outcome === "approved" && decision.cause !== "person_approved") ||
		(decision.outcome === "declined" && decision.cause !== "person_declined") ||
		(decision.outcome === "expired" && decision.cause !== "deadline_reached") ||
		(decision.outcome === "cancelled" &&
			decision.cause !== "call_cancelled" &&
			decision.cause !== "caller_turn_interrupted" &&
			decision.cause !== "host_shutdown") ||
		(decision.outcome === "disconnected" &&
			decision.cause !== "browser_disconnected" &&
			decision.cause !== "child_disconnected")
	)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The approval decision has an invalid terminal cause.",
		);
	if (JSON.stringify(decision.identity) !== JSON.stringify(request.identity))
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The approval decision identity is not exact.",
		);
	if (
		!/^sha256:[0-9a-f]{64}$/u.test(decision.effectHash) ||
		decision.effectHash !== request.effectHash
	)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The approval decision effect hash is not exact.",
		);
	if (!Number.isSafeInteger(decision.decidedAtMs) || decision.decidedAtMs < request.createdAtMs)
		throw new CodexDynamicToolsError("invalid_call", "The approval decision timestamp is invalid.");
}

export function approvalExpiry(request: DynamicToolApprovalRequest, nowMs: number): boolean {
	return nowMs >= request.expiresAtMs;
}

export function isChildDisconnect(decision: DynamicToolApprovalDecision): boolean {
	return decision.cause === "child_disconnected";
}

export function isApprovalRequired(decision: DynamicToolApprovalDecision): boolean {
	return (
		decision.outcome === "cancelled" ||
		(decision.outcome === "disconnected" && decision.cause === "browser_disconnected")
	);
}

export function operationIdsForRetirement(
	operations: DynamicIssuedOperations,
): readonly OperationId[] {
	return Object.freeze(
		operations.initialTurnOperationId === null
			? [operations.mutationOperationId]
			: [operations.mutationOperationId, operations.initialTurnOperationId],
	);
}

export type DynamicEpochIdentity = Readonly<{
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}>;
