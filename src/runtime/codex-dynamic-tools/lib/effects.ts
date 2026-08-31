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
	CodexDynamicOperationTerminalizationError,
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicApprovalIdentity,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicImmutableEffect,
	type DynamicMutationToolName,
	type DynamicOperationIdPort,
	type DynamicOperationTerminalDisposition,
	type DynamicOperationTerminalResult,
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

/**
 * Owns the terminal transition for the operation identities issued by one
 * mutation call. Keeping this state beside the prepared effect prevents a
 * late error path from reusing an identity or leaving it current forever.
 */
export interface DynamicOperationSettlement {
	readonly consume: (operationId: OperationId) => void;
	readonly retire: (operationId: OperationId) => void;
	readonly retireUnsettled: () => void;
	readonly unresolvedOperationCount: () => number;
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
	try {
		return Object.freeze({
			resultOperationId: mutationOperationId,
			mutationOperationId,
			initialTurnOperationId: hasInitialTurn
				? options.operationId.issueCanonicalOperationId()
				: null,
		});
	} catch (error) {
		try {
			terminalizeDynamicOperationId(options.operationId, mutationOperationId, "retired");
		} catch (retirementError) {
			throw retirementError instanceof CodexDynamicOperationTerminalizationError
				? retirementError
				: new CodexDynamicToolsError(
						"system_error",
						"The partially issued dynamic operation could not be retired.",
						retirementError,
					);
		}
		throw error;
	}
}

function exactTerminalResult(
	value: unknown,
	operationId: OperationId,
): DynamicOperationTerminalResult {
	if (
		typeof value !== "object" ||
		value === null ||
		!hasExactKeys(value, ["operationId", "disposition", "terminal"])
	)
		throw new Error("the terminal operation result shape is not exact");
	const result = value as Readonly<Record<string, unknown>>;
	if (
		result.operationId !== operationId ||
		(result.disposition !== "consumed" && result.disposition !== "retired") ||
		result.terminal !== true
	)
		throw new Error("the terminal operation result does not match the issued identity");
	return Object.freeze({ operationId, disposition: result.disposition, terminal: true });
}

function readTerminalResult(
	port: DynamicOperationIdPort,
	operationId: OperationId,
): DynamicOperationTerminalResult | null {
	const observed = port.readCanonicalOperationTerminalResult(operationId);
	if (observed !== null) return exactTerminalResult(observed, operationId);
	port.validateCurrentUnconsumedOperationId(operationId);
	return null;
}

/**
 * Cross the host terminal boundary with an idempotent operation. A thrown
 * attempt is inspected and retried only while the host still reports the ID
 * current. Returning means the requested host disposition is proven.
 */
export function terminalizeDynamicOperationId(
	port: DynamicOperationIdPort,
	operationId: OperationId,
	disposition: DynamicOperationTerminalDisposition,
): DynamicOperationTerminalResult {
	const causes: unknown[] = [];
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const result = exactTerminalResult(
				port.terminalizeCanonicalOperationId({ operationId, disposition }),
				operationId,
			);
			if (result.disposition !== disposition)
				throw new CodexDynamicOperationTerminalizationError(
					operationId,
					disposition,
					"The host terminalized the dynamic operation with another disposition.",
				);
			return result;
		} catch (error) {
			if (error instanceof CodexDynamicOperationTerminalizationError) throw error;
			causes.push(error);
		}

		try {
			const observed = readTerminalResult(port, operationId);
			if (observed === null) continue;
			if (observed.disposition !== disposition)
				throw new CodexDynamicOperationTerminalizationError(
					operationId,
					disposition,
					"The host reports another terminal disposition for the dynamic operation.",
					Object.freeze([...causes]),
				);
			return observed;
		} catch (error) {
			if (error instanceof CodexDynamicOperationTerminalizationError) throw error;
			causes.push(error);
		}
	}

	throw new CodexDynamicOperationTerminalizationError(
		operationId,
		disposition,
		"The host could not prove the dynamic operation terminal after idempotent settlement.",
		Object.freeze(causes),
	);
}

export function createDynamicOperationSettlement(
	options: CodexDynamicToolsOptions,
	operations: DynamicIssuedOperations,
): DynamicOperationSettlement {
	const owned = Object.freeze(operationIdsForRetirement(operations));
	if (new Set(owned).size !== owned.length) {
		for (const operationId of new Set(owned))
			terminalizeDynamicOperationId(options.operationId, operationId, "retired");
		throw new CodexDynamicToolsError(
			"system_error",
			"The dynamic operation authority issued duplicate identities for one call.",
		);
	}
	const requested = new Map<OperationId, DynamicOperationTerminalDisposition>();
	const terminal = new Map<OperationId, DynamicOperationTerminalDisposition>();

	const terminalize = (
		operationId: OperationId,
		kind: "consume" | "retire",
		deferUnresolved: boolean,
	): void => {
		if (!owned.includes(operationId))
			throw new CodexDynamicToolsError(
				"system_error",
				"The dynamic operation settlement received an identity it does not own.",
			);
		if (terminal.has(operationId))
			throw new CodexDynamicToolsError(
				"system_error",
				"The dynamic operation identity was settled more than once.",
			);
		const disposition = kind === "consume" ? "consumed" : "retired";
		const priorRequest = requested.get(operationId);
		if (priorRequest !== undefined && priorRequest !== disposition)
			throw new CodexDynamicToolsError(
				"system_error",
				"The dynamic operation settlement changed its requested disposition.",
			);
		requested.set(operationId, disposition);
		try {
			const result = terminalizeDynamicOperationId(options.operationId, operationId, disposition);
			terminal.set(operationId, result.disposition);
		} catch (error) {
			if (deferUnresolved && error instanceof CodexDynamicOperationTerminalizationError) return;
			throw error;
		}
	};

	const retireUnsettled = (): void => {
		let firstError: unknown = null;
		for (const operationId of owned) {
			if (terminal.has(operationId)) continue;
			try {
				terminalize(
					operationId,
					requested.get(operationId) === "consumed" ? "consume" : "retire",
					false,
				);
			} catch (error) {
				firstError ??= error;
			}
		}
		if (firstError !== null) throw firstError;
	};

	return Object.freeze({
		consume: (operationId: OperationId): void => terminalize(operationId, "consume", true),
		retire: (operationId: OperationId): void => terminalize(operationId, "retire", true),
		retireUnsettled,
		unresolvedOperationCount: (): number => owned.length - terminal.size,
	});
}

export function createDynamicOperationRecoverySettlement(
	options: CodexDynamicToolsOptions,
	error: CodexDynamicOperationTerminalizationError,
): DynamicOperationSettlement {
	let terminal = false;
	const retry = (deferUnresolved: boolean): void => {
		if (terminal) return;
		try {
			terminalizeDynamicOperationId(options.operationId, error.operationId, error.disposition);
			terminal = true;
		} catch (retryError) {
			if (deferUnresolved && retryError instanceof CodexDynamicOperationTerminalizationError)
				return;
			throw retryError;
		}
	};
	return Object.freeze({
		consume: (): void => retry(true),
		retire: (): void => retry(true),
		retireUnsettled: (): void => retry(false),
		unresolvedOperationCount: (): number => (terminal ? 0 : 1),
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
