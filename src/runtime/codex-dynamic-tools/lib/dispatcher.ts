import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type GeneralThreadToolName,
} from "../../codex-thread-tools/index.js";
import type { DynamicToolCallResponse } from "../../codex-thread-tools/index.js";
import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import type { OperationId, TurnId } from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexDynamicToolsError,
	type CodexDynamicTools,
	type CodexDynamicToolsOptions,
	type DynamicDispatchErrorCode,
	type DynamicApprovalIdentity,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicImmutableEffect,
	type DynamicMutationToolName,
	type DynamicRefusalReason,
	type DynamicTargetAuthority,
	type DynamicToolApprovalDecision,
	type DynamicToolApprovalRequest,
} from "./contract.js";
import {
	assertMutationTargetAllowed,
	dynamicErrorForResponse,
	resolveCaller,
	resolveTarget,
	revalidateCaller,
	revalidateTarget,
	validateDynamicCall,
} from "./classification.js";
import {
	approvalExpiry,
	createDynamicOperationSettlement,
	dynamicEffectHash,
	issueMutationOperations,
	issueReadOperation,
	operationWireForIssuedResult,
	prepareMutation,
	validateDecisionShape,
} from "./effects.js";
import { executeCreate, executeFork, executeSend, type MutationExecution } from "./mutations.js";
import type { DynamicOperationSettlement, PreparedDynamicMutation } from "./effects.js";
import { projectList, projectRead } from "./projection.js";
import {
	approvalRequiredDynamicResponse,
	dynamicResponse,
	invalidDynamicResponse,
	outcomeUnknownDynamicResponse,
	refusedDynamicResponse,
} from "./response.js";
import { waitForDynamicThreads } from "./wait.js";
import { encodeDynamicCursor, unwrapDynamicCursor } from "./cursors.js";

const MUTATION_TOOL_NAMES = Object.freeze([
	"create_thread",
	"fork_thread",
	"send_message_to_thread",
] as const);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nowOf(options: CodexDynamicToolsOptions): number {
	const now = options.now?.() ?? Date.now();
	if (!Number.isSafeInteger(now) || now < 0)
		throw new CodexDynamicToolsError(
			"system_error",
			"The host clock returned an invalid timestamp.",
		);
	return now;
}

function approvalIdentityExact(
	left: DynamicApprovalIdentity,
	right: DynamicApprovalIdentity,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function approvalDecisionFallback(
	request: DynamicToolApprovalRequest,
	nowMs: number,
): DynamicToolApprovalDecision {
	if (nowMs >= request.expiresAtMs)
		return Object.freeze({
			outcome: "expired",
			identity: request.identity,
			effectHash: request.effectHash,
			decidedAtMs: nowMs,
			cause: "deadline_reached",
		});
	return Object.freeze({
		outcome: "disconnected",
		identity: request.identity,
		effectHash: request.effectHash,
		decidedAtMs: nowMs,
		cause: "browser_disconnected",
	});
}

function freezeDynamicRequest(request: DynamicServerRequest): DynamicServerRequest {
	const argumentsValue = request.params.arguments;
	const frozenArguments = isRecord(argumentsValue)
		? Object.freeze({ ...argumentsValue })
		: argumentsValue;
	return Object.freeze({
		...request,
		correlation: Object.freeze({ ...request.correlation }),
		params: Object.freeze({ ...request.params, arguments: frozenArguments }),
		logicalCall: Object.freeze({ ...request.logicalCall }),
	});
}

function assertContextAuthority(
	authority: DynamicContextAuthority,
	caller: DynamicCallerAuthority,
): DynamicContextAuthority {
	const keys = ["token", "paneId", "childId", "epoch", "threadId", "turnId"] as const;
	if (
		!isRecord(authority) ||
		Reflect.ownKeys(authority).some(
			(key) => typeof key !== "string" || !keys.includes(key as (typeof keys)[number]),
		) ||
		keys.some((key) => !Object.prototype.hasOwnProperty.call(authority, key)) ||
		keys.some((key) => typeof authority[key] !== "string" || authority[key].length === 0) ||
		authority.childId !== caller.childId ||
		authority.epoch !== caller.epoch ||
		authority.threadId !== caller.threadId ||
		authority.turnId !== caller.turnId
	)
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"The pane-link authority does not match the executing caller.",
		);
	return Object.freeze({ ...authority });
}

async function settleApproval(
	options: CodexDynamicToolsOptions,
	request: DynamicToolApprovalRequest,
	decision: DynamicToolApprovalDecision,
): Promise<void> {
	try {
		await options.approval.settleIdentityAndEffectHashOnce({ request, decision });
	} catch (error) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The visual approval could not be settled once.",
			error,
		);
	}
}

function approvedDecision(decision: DynamicToolApprovalDecision): boolean {
	return decision.outcome === "approved" && decision.cause === "person_approved";
}

function approvalRequiredDecision(decision: DynamicToolApprovalDecision): boolean {
	return decision.outcome === "cancelled" || decision.outcome === "disconnected";
}

async function assertCallExecuting(
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	phase: "before_approval" | "after_approval",
): Promise<void> {
	try {
		await options.lifecycle.assertCallExecuting({ request, caller, phase });
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) throw error;
		const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
		if (
			code === "stale_child" ||
			code === "prior_epoch" ||
			code === "unknown_provenance" ||
			code === "not_loaded" ||
			code === "not_controllable" ||
			code === "system_error"
		)
			throw new CodexDynamicToolsError(
				code,
				"The logical dynamic call is no longer executing.",
				error,
			);
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The logical dynamic call is no longer executing.",
			error,
		);
	}
}

function childDisconnectedDecision(decision: DynamicToolApprovalDecision): boolean {
	return decision.outcome === "disconnected" && decision.cause === "child_disconnected";
}

function approvalRefusal(decision: DynamicToolApprovalDecision): {
	readonly reason: "approval_declined" | "expired";
	readonly message: string;
} {
	return decision.outcome === "declined"
		? { reason: "approval_declined", message: "The person declined this dynamic effect." }
		: { reason: "expired", message: "The visual approval expired before the effect could run." };
}

function boundaryForFork(
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority,
	requestedBeforeTurnId: string | undefined,
	options: CodexDynamicToolsOptions,
): Promise<{ readonly relation: "self" | "other"; readonly boundary: TurnId | null }> {
	const relation = target.threadId === caller.threadId ? "self" : "other";
	return options.threadAuthority
		.resolveExactTurnBoundary({
			caller,
			target,
			requestedBeforeTurnId: relation === "self" ? null : requestedBeforeTurnId,
			relation,
		})
		.then((boundary) => {
			if (boundary !== null && (typeof boundary !== "string" || boundary.length === 0))
				throw new CodexDynamicToolsError(
					"invalid_call",
					"The turn-boundary authority returned an invalid boundary.",
				);
			if (relation === "self" && boundary !== caller.turnId)
				throw new CodexDynamicToolsError(
					"invalid_call",
					"A self-fork boundary must be the executing caller turn.",
				);
			if (relation === "other" && (requestedBeforeTurnId === undefined) !== (boundary === null))
				throw new CodexDynamicToolsError(
					"invalid_call",
					"The resolved fork boundary does not match the requested boundary.",
				);
			return Object.freeze({ relation, boundary });
		})
		.catch((error) => {
			throw boundaryAuthorityError(error, "The fork turn boundary could not be resolved.");
		});
}

function boundaryAuthorityError(error: unknown, message: string): CodexDynamicToolsError {
	if (error instanceof CodexDynamicToolsError) return error;
	const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
	if (
		code === "stale_child" ||
		code === "prior_epoch" ||
		code === "unknown_provenance" ||
		code === "not_loaded" ||
		code === "not_controllable" ||
		code === "system_error"
	)
		return new CodexDynamicToolsError(code, message, error);
	return new CodexDynamicToolsError("invalid_call", message, error);
}

function effectArguments(
	name: DynamicMutationToolName,
	argumentsValue: Readonly<Record<string, unknown>>,
): DynamicImmutableEffect["arguments"] {
	if (name === "create_thread") return { prompt: String(argumentsValue.prompt) };
	if (name === "send_message_to_thread")
		return { threadId: String(argumentsValue.threadId), prompt: String(argumentsValue.prompt) };
	return {
		threadId: String(argumentsValue.threadId),
		beforeTurnId:
			typeof argumentsValue.beforeTurnId === "string" ? argumentsValue.beforeTurnId : null,
		prompt: typeof argumentsValue.prompt === "string" ? argumentsValue.prompt : null,
	};
}
async function revalidateMutation(
	prepared: PreparedDynamicMutation,
	decision: DynamicToolApprovalDecision,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
): Promise<{
	readonly caller: DynamicCallerAuthority;
	readonly target: DynamicTargetAuthority | null;
	readonly context: DynamicContextAuthority;
}> {
	try {
		validateDecisionShape(decision, prepared.request);
		if (
			!approvalIdentityExact(decision.identity, prepared.identity) ||
			decision.effectHash !== prepared.effectHash ||
			dynamicEffectHash(prepared.identity, prepared.effect) !== prepared.effectHash
		)
			throw new CodexDynamicToolsError(
				"invalid_call",
				"The approved dynamic effect is no longer exact.",
			);
	} catch (error) {
		throw dynamicErrorForResponse(error);
	}
	const freshCaller = await revalidateCaller(request, caller, options, "after_approval");
	if (freshCaller.authority !== prepared.effect.callerAuthority)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The caller authority changed during revalidation.",
		);
	let freshTarget: DynamicTargetAuthority | null = null;
	if (prepared.target !== null) {
		freshTarget = await revalidateTarget(prepared.target, options);
		const targetThreadId =
			prepared.effect.tool === "fork_thread" || prepared.effect.tool === "send_message_to_thread"
				? prepared.effect.arguments.threadId
				: null;
		if (targetThreadId === null || freshTarget.wireThreadId !== targetThreadId)
			throw new CodexDynamicToolsError(
				"invalid_call",
				"The target identity changed during revalidation.",
			);
		const relation = assertMutationTargetAllowed(prepared.effect.tool, freshCaller, freshTarget);
		if (prepared.relation !== relation)
			throw new CodexDynamicToolsError("cycle", "The target relation changed during revalidation.");
		if (prepared.effect.tool === "fork_thread") {
			let boundary: TurnId | null;
			try {
				boundary = await options.threadAuthority.resolveExactTurnBoundary({
					caller: freshCaller,
					target: freshTarget,
					requestedBeforeTurnId:
						relation === "self" ? null : prepared.effect.arguments.beforeTurnId,
					relation,
				});
			} catch (error) {
				throw boundaryAuthorityError(error, "The fork turn boundary became stale.");
			}
			if (boundary !== null && (typeof boundary !== "string" || boundary.length === 0))
				throw new CodexDynamicToolsError(
					"invalid_call",
					"The turn-boundary authority returned an invalid boundary.",
				);
			const expectedBoundary = prepared.effect.effectiveBoundary?.beforeTurnId ?? null;
			if (
				(relation === "self" && boundary !== freshCaller.turnId) ||
				(boundary === null ? null : String(boundary)) !== expectedBoundary
			)
				throw new CodexDynamicToolsError(
					"invalid_call",
					"The fork boundary changed during revalidation.",
				);
		}
	}
	if ((freshTarget?.authority ?? null) !== prepared.effect.targetAuthority)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The target authority changed during revalidation.",
		);
	if (
		prepared.effect.tool === "fork_thread" &&
		(prepared.effect.effectiveBoundary?.relation !== prepared.relation ||
			prepared.effect.effectiveBoundary?.beforeTurnId !==
				(prepared.boundary === null ? null : String(prepared.boundary)))
	)
		throw new CodexDynamicToolsError("invalid_call", "The immutable fork boundary is not exact.");
	let freshContextAuthority: DynamicContextAuthority;
	try {
		freshContextAuthority = assertContextAuthority(
			await options.context.issueAndRevalidatePaneLinkAuthority({
				caller: freshCaller,
				existing: contextAuthority,
			}),
			freshCaller,
		);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) throw error;
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"The pane-link authority changed during revalidation.",
			error,
		);
	}
	if (
		freshContextAuthority.token !== prepared.effect.contextAuthority ||
		freshContextAuthority.paneId !== contextAuthority.paneId ||
		freshContextAuthority.childId !== freshCaller.childId ||
		freshContextAuthority.epoch !== freshCaller.epoch ||
		freshContextAuthority.threadId !== freshCaller.threadId ||
		freshContextAuthority.turnId !== freshCaller.turnId
	)
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The context authority changed during revalidation.",
		);
	const operations: readonly { readonly id: OperationId; readonly wire: string }[] = [
		{ id: prepared.operations.mutationOperationId, wire: prepared.effect.mutationOperationId },
		...(prepared.operations.initialTurnOperationId === null ||
		prepared.effect.initialTurnOperationId === null
			? []
			: [
					{
						id: prepared.operations.initialTurnOperationId,
						wire: prepared.effect.initialTurnOperationId,
					},
				]),
	];
	for (const operation of operations) {
		try {
			options.operationId.validateCurrentUnconsumedOperationId(operation.id);
			if (options.operationId.serializeForOwnedWireFields(operation.id) !== operation.wire)
				throw new Error("the operation serializer returned a different identity");
		} catch (error) {
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A dynamic operation identity is no longer unconsumed.",
				error,
			);
		}
	}
	if (approvalExpiry(prepared.request, nowOf(options)))
		throw new CodexDynamicToolsError("expired", "The visual approval expired before the effect.");
	return Object.freeze({
		caller: freshCaller,
		target: freshTarget,
		context: freshContextAuthority,
	});
}

async function approveMutation(
	prepared: PreparedDynamicMutation,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolApprovalDecision> {
	try {
		await options.approval.presentImmutableRequest(prepared.request);
	} catch (error) {
		const decision = approvalDecisionFallback(prepared.request, nowOf(options));
		await settleApproval(options, prepared.request, decision);
		throw new CodexDynamicToolsError(
			"system_error",
			"The visual approval request could not be presented.",
			error,
		);
	}
	let decision: DynamicToolApprovalDecision;
	try {
		decision = await options.approval.awaitOneExactVisualDecision(prepared.request);
	} catch {
		decision = approvalDecisionFallback(prepared.request, nowOf(options));
	}
	try {
		validateDecisionShape(decision, prepared.request);
		if (
			(decision.outcome === "approved" || decision.outcome === "declined") &&
			decision.decidedAtMs >= prepared.request.expiresAtMs
		) {
			const decidedAtMs = decision.decidedAtMs;
			decision = Object.freeze({
				outcome: "expired",
				identity: prepared.request.identity,
				effectHash: prepared.request.effectHash,
				decidedAtMs,
				cause: "deadline_reached",
			});
		}
		if (decision.outcome === "expired" && decision.decidedAtMs < prepared.request.expiresAtMs)
			throw new CodexDynamicToolsError("invalid_call", "The approval expired before its deadline.");
	} catch (error) {
		const fallback = approvalDecisionFallback(prepared.request, nowOf(options));
		await settleApproval(options, prepared.request, fallback);
		throw dynamicErrorForResponse(error);
	}
	await settleApproval(options, prepared.request, decision);
	return decision;
}

async function executeMutation(
	prepared: PreparedDynamicMutation,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority | null,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
	operationSettlement: DynamicOperationSettlement,
): Promise<MutationExecution> {
	switch (prepared.effect.tool) {
		case "create_thread":
			return executeCreate(
				prepared,
				request,
				caller,
				contextAuthority,
				options,
				operationSettlement,
			);
		case "fork_thread":
			if (target === null || prepared.relation === null)
				throw new CodexDynamicToolsError("invalid_call", "The fork target authority is missing.");
			return executeFork(
				prepared,
				request,
				caller,
				contextAuthority,
				target,
				prepared.relation,
				options,
				operationSettlement,
			);
		case "send_message_to_thread":
			if (target === null)
				throw new CodexDynamicToolsError("invalid_call", "The send target authority is missing.");
			return executeSend(
				prepared,
				request,
				caller,
				contextAuthority,
				target,
				options,
				operationSettlement,
			);
	}
}

async function dispatchOne(
	request: DynamicServerRequest,
	options: CodexDynamicToolsOptions,
): Promise<DynamicToolCallResponse> {
	let knownName: GeneralThreadToolName | null = null;
	let boundaryValidated = false;
	let operationSettlement: DynamicOperationSettlement | null = null;
	try {
		const call = validateDynamicCall(request, options);
		boundaryValidated = true;
		knownName = call.name;
		const immutableRequest = freezeDynamicRequest(request);
		const caller = await resolveCaller(immutableRequest, options);
		await assertCallExecuting(options, immutableRequest, caller, "before_approval");
		if (call.name === "list_threads") {
			const operation = issueReadOperation(options).resultOperationId;
			const operationId = operationWireForIssuedResult(options, operation);
			const args = call.arguments;
			const limit = args.limit ?? 10;
			const page = await projectList(
				{
					cursor: unwrapPageCursor(args.cursor, caller, "thread/list", "desc", { limit }),
					limit,
				},
				caller,
				{
					session: options.session,
					classifyTarget: (threadId, observed) =>
						resolveTarget(caller, threadId, options, observed),
				},
			);
			return dynamicResponse(call.name, {
				tag: "ok",
				operationId,
				value: {
					threads: page.threads,
					nextCursor: wrapPageCursor(page.nextCursor, caller, "thread/list", "desc", { limit }),
				},
			});
		}
		if (call.name === "read_thread") {
			const operation = issueReadOperation(options).resultOperationId;
			const operationId = operationWireForIssuedResult(options, operation);
			const args = call.arguments;
			const turnLimit = args.turnLimit ?? 10;
			const includeOutputs = args.includeOutputs ?? false;
			const query = { threadId: args.threadId, turnLimit, includeOutputs };
			const page = await projectRead(
				{
					targetThreadId: args.threadId,
					cursor: unwrapPageCursor(args.cursor, caller, "thread/turns/list", "desc", query),
					turnLimit,
					includeOutputs,
				},
				caller,
				{
					session: options.session,
					classifyTarget: (threadId, observed) =>
						resolveTarget(caller, threadId, options, observed),
				},
			);
			return dynamicResponse(call.name, {
				tag: "ok",
				operationId,
				value: {
					threadId: page.threadId,
					turns: page.turns,
					nextCursor: wrapPageCursor(page.nextCursor, caller, "thread/turns/list", "desc", query),
				},
			});
		}
		if (call.name === "wait_threads") {
			const operation = issueReadOperation(options).resultOperationId;
			const operationId = operationWireForIssuedResult(options, operation);
			const args = call.arguments;
			const wait = await waitForDynamicThreads({
				threadIds: args.threadIds,
				timeoutMs: args.timeoutMs ?? 120_000,
				cursor: args.cursor,
				caller,
				call: {
					callId: immutableRequest.logicalCall.callId,
					namespace: ARCHBOARD_APP_NAMESPACE.name,
					tool: "wait_threads",
					manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
				},
				classifyTarget: (threadId) => resolveTarget(caller, threadId, options),
				options,
			});
			return dynamicResponse(call.name, {
				tag: "ok",
				operationId,
				value: { event: wait.event, threadId: wait.threadId, cursor: wait.cursor },
			});
		}

		const mutationName = call.name;
		if (!MUTATION_TOOL_NAMES.includes(mutationName))
			throw new CodexDynamicToolsError(
				"unsupported",
				"The dynamic tool is not a mutation or read operation.",
			);
		let target: DynamicTargetAuthority | null = null;
		let relation: "self" | "other" | null = null;
		let boundary: TurnId | null = null;
		if (mutationName !== "create_thread") {
			const rawTargetId = isRecord(call.arguments) ? call.arguments.threadId : undefined;
			target = await resolveTarget(caller, rawTargetId, options);
			if (target.wireThreadId !== rawTargetId)
				throw new CodexDynamicToolsError(
					"invalid_call",
					"The target authority returned a different ThreadId.",
				);
			relation = assertMutationTargetAllowed(mutationName, caller, target);
			if (mutationName === "fork_thread") {
				const fork = await boundaryForFork(caller, target, call.arguments.beforeTurnId, options);
				if (fork.relation !== relation)
					throw new CodexDynamicToolsError(
						"invalid_call",
						"The fork relation changed while resolving its boundary.",
					);
				boundary = fork.boundary;
			}
		}
		let contextAuthority: DynamicContextAuthority;
		try {
			contextAuthority = assertContextAuthority(
				await options.context.issueAndRevalidatePaneLinkAuthority({ caller }),
				caller,
			);
		} catch (error) {
			if (error instanceof CodexDynamicToolsError) throw error;
			throw new CodexDynamicToolsError(
				"unknown_provenance",
				"The pane-link authority could not be issued.",
				error,
			);
		}
		const operations = issueMutationOperations(
			mutationName,
			options,
			mutationName === "create_thread" ||
				(mutationName === "fork_thread" && call.arguments.prompt !== undefined),
		);
		operationSettlement = createDynamicOperationSettlement(options, operations);
		const effectArgs = effectArguments(mutationName, call.arguments);
		const prepared = prepareMutation(
			immutableRequest,
			mutationName,
			effectArgs,
			caller,
			target,
			relation,
			contextAuthority,
			operations,
			options,
			boundary,
			nowOf(options),
		);
		const decision = await approveMutation(prepared, options);
		if (childDisconnectedDecision(decision)) {
			return refusedDynamicResponse(
				mutationName,
				"not_ready",
				"The child disconnected before the approved response could be delivered.",
			);
		}
		if (approvalRequiredDecision(decision)) {
			return approvalRequiredDynamicResponse(
				mutationName,
				prepared.identity.operationId,
				prepared.effect.visualSummary,
			);
		}
		if (!approvedDecision(decision)) {
			const refusal = approvalRefusal(decision);
			return refusedDynamicResponse(mutationName, refusal.reason, refusal.message);
		}
		const revalidated = await revalidateMutation(
			prepared,
			decision,
			caller,
			contextAuthority,
			options,
			immutableRequest,
		);
		const execution = await executeMutation(
			prepared,
			immutableRequest,
			revalidated.caller,
			revalidated.target,
			revalidated.context,
			options,
			operationSettlement,
		);
		if (execution.kind === "outcome_unknown")
			return outcomeUnknownDynamicResponse(mutationName, execution.operationId);
		if (execution.kind === "refused")
			return refusedDynamicResponse(mutationName, execution.reason, execution.message);
		return dynamicResponse(mutationName, {
			tag: "ok",
			operationId: execution.operationId,
			value: execution.value,
		});
	} catch (error) {
		const failure = dynamicErrorForResponse(error);
		if (boundaryValidated && knownName !== null)
			return refusedDynamicResponse(
				knownName,
				refusalReasonForResponse(failure.code),
				boundedFailureMessage(failure.message),
			);
		return invalidDynamicResponse(
			failure.code === "unsupported" ? "unsupported" : "invalid_call",
			boundedFailureMessage(failure.message),
		);
	} finally {
		if (operationSettlement !== null) {
			try {
				operationSettlement.retireUnsettled();
			} catch {
				/* The settlement marks before crossing the host boundary; never retry it. */
			}
		}
	}
}

function refusalReasonForResponse(code: DynamicDispatchErrorCode): DynamicRefusalReason {
	return code === "not_delivered" || code === "outcome_unknown" ? "system_error" : code;
}

function boundedFailureMessage(value: string): string {
	const normalized = value.trim() || "The dynamic call was refused.";
	if (Buffer.byteLength(normalized, "utf8") <= 512) return normalized;
	const ellipsis = "…";
	const budget = 512 - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of normalized) {
		if (Buffer.byteLength(result + character, "utf8") > budget) break;
		result += character;
	}
	return `${result}${ellipsis}`;
}

function unwrapPageCursor(
	cursor: string | undefined,
	caller: DynamicCallerAuthority,
	method: string,
	direction: "asc" | "desc",
	query: unknown,
): string | null {
	return unwrapDynamicCursor(cursor, {
		child: caller.childId,
		epoch: caller.epoch,
		method,
		direction,
		query,
	}).cursor;
}

function wrapPageCursor(
	cursor: string | null,
	caller: DynamicCallerAuthority,
	method: string,
	direction: "asc" | "desc",
	query: unknown,
): string | null {
	if (cursor === null) return null;
	return encodeDynamicCursor({
		child: caller.childId,
		epoch: caller.epoch,
		method,
		direction,
		query,
		cursor,
		sequence: 0,
	});
}

export function createCodexDynamicTools(options: CodexDynamicToolsOptions): CodexDynamicTools {
	if (options.checkoutRoot.length === 0)
		throw new CodexDynamicToolsError("invalid_call", "Dynamic tools require a checkout root.");
	let disposed = false;
	const responses = new WeakMap<object, Promise<DynamicToolCallResponse>>();
	const dispatch = (request: DynamicServerRequest): Promise<DynamicToolCallResponse> => {
		const cacheKey = isRecord(request) ? request : null;
		if (cacheKey !== null) {
			const existing = responses.get(cacheKey);
			if (existing !== undefined) return existing;
		}
		if (disposed) {
			const response = Promise.resolve(
				invalidDynamicResponse("invalid_call", "Dynamic tools are disposed."),
			);
			if (cacheKey !== null) responses.set(cacheKey, response);
			return response;
		}
		const response = dispatchOne(request, options).then(async (value) => {
			try {
				await options.transport.respond(request, "codex-dynamic-tools", { result: value });
			} catch {
				/* The child disconnect is a single not-delivered response attempt. */
			}
			return value;
		});
		if (cacheKey !== null) responses.set(cacheKey, response);
		return response;
	};
	const dispose = (): void => {
		disposed = true;
	};
	return Object.freeze({ dispatch, dispose });
}

export const createCodexDynamicToolDispatcher = createCodexDynamicTools;
