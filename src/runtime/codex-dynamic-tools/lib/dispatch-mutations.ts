import type { DynamicToolCallResponse } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { TurnId } from "@/shared/codex-workbench-identity";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicMutationToolName,
	type DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import { assertMutationTargetAllowed } from "@/runtime/codex-dynamic-tools/lib/classification";
import { resolveTarget } from "@/runtime/codex-dynamic-tools/lib/authority-classification";
import type { ValidatedDynamicCall } from "@/runtime/codex-dynamic-tools/lib/request-validation";
import {
	createDynamicOperationSettlement,
	issueMutationOperations,
	prepareMutation,
	type DynamicOperationSettlement,
	type PreparedDynamicMutation,
} from "@/runtime/codex-dynamic-tools/lib/effects";
import {
	executeCreate,
	executeFork,
	executeSend,
	type MutationExecution,
} from "@/runtime/codex-dynamic-tools/lib/mutations";
import {
	approvalRequiredDynamicResponse,
	dynamicResponse,
	outcomeUnknownDynamicResponse,
	refusedDynamicResponse,
} from "@/runtime/codex-dynamic-tools/lib/response";
import {
	assertContextAuthority,
	effectArguments,
	nowOf,
} from "@/runtime/codex-dynamic-tools/lib/dispatch-support";
import {
	approvalRefusal,
	approvalRequiredDecision,
	approveMutation,
	approvedDecision,
	childDisconnectedDecision,
} from "@/runtime/codex-dynamic-tools/lib/dispatch-approval";
import {
	boundaryForFork,
	revalidateMutation,
} from "@/runtime/codex-dynamic-tools/lib/dispatch-revalidation";

/** One validated call that mutates. */
type MutationCall = Extract<ValidatedDynamicCall, { name: DynamicMutationToolName }>;

/** What a mutation was resolved to act on before anyone was asked about it. */
interface MutationSubject {
	readonly target: DynamicTargetAuthority | null;
	readonly relation: "self" | "other" | null;
	readonly boundary: TurnId | null;
}

/** What one dispatched mutation left behind for the quarantine boundary to account for. */
interface MutationDispatchState {
	operationSettlement: DynamicOperationSettlement | null;
	mutationName: DynamicMutationToolName | null;
}

/**
 * Carry out one approved and revalidated mutation.
 * @param prepared The prepared mutation.
 * @param request The server request.
 * @param caller The revalidated caller.
 * @param target The revalidated target, when the mutation names one.
 * @param contextAuthority The revalidated pane-link authority.
 * @param options The dynamic tools options.
 * @param operationSettlement How the call's operation identities are settled.
 * @returns What the mutation did.
 */
async function executeMutation(
	prepared: PreparedDynamicMutation,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority | null,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
	operationSettlement: DynamicOperationSettlement,
): Promise<MutationExecution> {
	const effect = prepared.effect;
	if (effect.tool === "create_thread") {
		return await executeCreate(
			prepared,
			request,
			caller,
			contextAuthority,
			options,
			operationSettlement,
		);
	}
	if (effect.tool === "fork_thread") {
		if (target === null || prepared.relation === null) {
			throw new CodexDynamicToolsError("invalid_call", "The fork target authority is missing.");
		}
		return await executeFork(
			prepared,
			request,
			caller,
			contextAuthority,
			target,
			prepared.relation,
			options,
			operationSettlement,
		);
	}
	if (target === null) {
		throw new CodexDynamicToolsError("invalid_call", "The send target authority is missing.");
	}
	return await executeSend(
		prepared,
		request,
		caller,
		contextAuthority,
		target,
		options,
		operationSettlement,
	);
}

/**
 * Resolve what a mutation acts on, refusing a target authority that renames the thread the call
 * asked about and a fork whose relation changes while its boundary is resolved.
 * @param call The validated call.
 * @param caller The caller's authority.
 * @param options The dynamic tools options.
 * @returns The target, the relation and the boundary.
 */
async function resolveMutationSubject(
	call: MutationCall,
	caller: DynamicCallerAuthority,
	options: CodexDynamicToolsOptions,
): Promise<MutationSubject> {
	if (call.name === "create_thread") {
		return { target: null, relation: null, boundary: null };
	}
	const rawTargetId = call.arguments.threadId;
	const target = await resolveTarget(caller, rawTargetId, options);
	if (target.wireThreadId !== rawTargetId) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The target authority returned a different ThreadId.",
		);
	}
	const relation = assertMutationTargetAllowed(call.name, caller, target);
	if (call.name !== "fork_thread") {
		return { target, relation, boundary: null };
	}
	const fork = await boundaryForFork(caller, target, call.arguments.beforeTurnId, options);
	if (fork.relation !== relation) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The fork relation changed while resolving its boundary.",
		);
	}
	return { target, relation, boundary: fork.boundary };
}

/**
 * Issue the pane-link authority one mutation is carried out under.
 * @param caller The caller's authority.
 * @param options The dynamic tools options.
 * @returns The authority.
 */
async function issueContextAuthority(
	caller: DynamicCallerAuthority,
	options: CodexDynamicToolsOptions,
): Promise<DynamicContextAuthority> {
	try {
		return assertContextAuthority(
			await options.context.issueAndRevalidatePaneLinkAuthority({ caller }),
			caller,
		);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"The pane-link authority could not be issued.",
			error,
		);
	}
}

/**
 * Whether a mutation also starts a turn, and so needs a second operation identity.
 * @param call The validated call.
 * @returns Whether an initial turn is started.
 */
function startsInitialTurn(call: MutationCall): boolean {
	if (call.name === "create_thread") {
		return true;
	}
	return call.name === "fork_thread" && call.arguments.prompt !== undefined;
}

/**
 * The response a decision that is not an approval turns into: the child went away, nobody
 * answered and the caller must ask again, or a person said no.
 * @param mutationName The mutation tool.
 * @param prepared The prepared mutation.
 * @param decision The decision.
 * @returns The response, or null when the effect was approved and may run.
 */
function unapprovedResponse(
	mutationName: DynamicMutationToolName,
	prepared: PreparedDynamicMutation,
	decision: Parameters<typeof approvedDecision>[0],
): DynamicToolCallResponse | null {
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
	if (approvedDecision(decision)) {
		return null;
	}
	const refusal = approvalRefusal(decision);
	return refusedDynamicResponse(mutationName, refusal.reason, refusal.message);
}

/**
 * What one carried-out mutation reports back.
 * @param mutationName The mutation tool.
 * @param execution What the mutation did.
 * @returns The response.
 */
function executionResponse(
	mutationName: DynamicMutationToolName,
	execution: MutationExecution,
): DynamicToolCallResponse {
	if (execution.kind === "outcome_unknown") {
		return outcomeUnknownDynamicResponse(mutationName, execution.operationId);
	}
	if (execution.kind === "refused") {
		return refusedDynamicResponse(mutationName, execution.reason, execution.message);
	}
	return dynamicResponse(mutationName, {
		tag: "ok",
		operationId: execution.operationId,
		value: execution.value,
	});
}

/**
 * Carry one mutation from a validated call to a response.
 *
 * The mutation is described, put to a person, and — only if a person approves it — checked
 * again against everything it stands on before it runs. The operation identities it is
 * accounted for by are recorded on the dispatch state as soon as they are issued, so the
 * quarantine boundary can settle them whatever happens next.
 * @param call The validated call.
 * @param request The frozen server request.
 * @param caller The caller's authority.
 * @param options The dynamic tools options.
 * @param state Where the call's settlement is recorded.
 * @returns The response.
 */
async function dispatchMutation(
	call: MutationCall,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	options: CodexDynamicToolsOptions,
	state: MutationDispatchState,
): Promise<DynamicToolCallResponse> {
	const mutationName = call.name;
	state.mutationName = mutationName;
	const subject = await resolveMutationSubject(call, caller, options);
	const contextAuthority = await issueContextAuthority(caller, options);
	const operations = issueMutationOperations(options, startsInitialTurn(call));
	const operationSettlement = createDynamicOperationSettlement(options, operations);
	state.operationSettlement = operationSettlement;
	const prepared = prepareMutation(
		request,
		mutationName,
		effectArguments(mutationName, call.arguments),
		caller,
		subject.target,
		subject.relation,
		contextAuthority,
		operations,
		options,
		subject.boundary,
		nowOf(options),
	);
	const decision = await approveMutation(prepared, options);
	const unapproved = unapprovedResponse(mutationName, prepared, decision);
	if (unapproved !== null) {
		return unapproved;
	}
	const revalidated = await revalidateMutation(
		prepared,
		decision,
		caller,
		contextAuthority,
		options,
		request,
	);
	const execution = await executeMutation(
		prepared,
		request,
		revalidated.caller,
		revalidated.target,
		revalidated.context,
		options,
		operationSettlement,
	);
	return executionResponse(mutationName, execution);
}

export { type MutationCall, type MutationDispatchState, dispatchMutation };
