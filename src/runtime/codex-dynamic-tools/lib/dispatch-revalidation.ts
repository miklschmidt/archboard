import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { OperationId, TurnId } from "@/shared/codex-workbench-identity";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicTargetAuthority,
	type DynamicToolApprovalDecision,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	assertMutationTargetAllowed,
	dynamicErrorForResponse,
} from "@/runtime/codex-dynamic-tools/lib/classification";
import {
	revalidateCaller,
	revalidateTarget,
} from "@/runtime/codex-dynamic-tools/lib/authority-classification";
import {
	approvalExpiry,
	dynamicEffectHash,
	validateDecisionShape,
} from "@/runtime/codex-dynamic-tools/lib/effects";
import type { PreparedDynamicMutation } from "@/runtime/codex-dynamic-tools/lib/effects";
import {
	assertContextAuthority,
	boundaryAuthorityError,
	nowOf,
} from "@/runtime/codex-dynamic-tools/lib/dispatch-support";
import { approvalIdentityExact } from "@/runtime/codex-dynamic-tools/lib/dispatch-approval";

/** How a fork stands to the thread it forks, and where it stops. */
interface ForkBoundary {
	readonly relation: "self" | "other";
	readonly boundary: TurnId | null;
}

/** Everything a revalidated mutation may now be carried out against. */
interface RevalidatedMutation {
	readonly caller: DynamicCallerAuthority;
	readonly target: DynamicTargetAuthority | null;
	readonly context: DynamicContextAuthority;
}

/**
 * Refuse a boundary the authority returned that is not something a fork could stop at.
 * @param boundary What the authority returned.
 */
function assertUsableBoundary(boundary: TurnId | null): void {
	if (boundary !== null && (typeof boundary !== "string" || boundary.length === 0)) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The turn-boundary authority returned an invalid boundary.",
		);
	}
}

/**
 * Refuse a resolved boundary that does not match what was asked for. A self fork must stop at
 * the executing turn, because everything after it is still being written; a fork of another
 * thread must resolve a boundary exactly when one was requested.
 * @param relation How the caller stands to the target.
 * @param boundary The resolved boundary.
 * @param caller The caller's authority.
 * @param requestedBeforeTurnId The boundary the call asked for, if it asked for one.
 */
function assertBoundaryAsRequested(
	relation: "self" | "other",
	boundary: TurnId | null,
	caller: DynamicCallerAuthority,
	requestedBeforeTurnId: string | undefined,
): void {
	if (relation === "self" && boundary !== caller.turnId) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"A self-fork boundary must be the executing caller turn.",
		);
	}
	if (relation === "other" && (requestedBeforeTurnId === undefined) !== (boundary === null)) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The resolved fork boundary does not match the requested boundary.",
		);
	}
}

/**
 * Where one fork stops, resolved against the target's own turn history.
 * @param caller The caller's authority.
 * @param target The target's authority.
 * @param requestedBeforeTurnId The boundary the call asked for, if it asked for one.
 * @param options The dynamic tools options.
 * @returns The relation and the boundary.
 */
async function boundaryForFork(
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority,
	requestedBeforeTurnId: string | undefined,
	options: CodexDynamicToolsOptions,
): Promise<ForkBoundary> {
	const relation = target.threadId === caller.threadId ? "self" : "other";
	let boundary: TurnId | null;
	try {
		boundary = await options.threadAuthority.resolveExactTurnBoundary({
			caller,
			target,
			requestedBeforeTurnId: relation === "self" ? null : requestedBeforeTurnId,
			relation,
		});
	} catch (error) {
		throw boundaryAuthorityError(error, "The fork turn boundary could not be resolved.");
	}
	try {
		assertUsableBoundary(boundary);
		assertBoundaryAsRequested(relation, boundary, caller, requestedBeforeTurnId);
	} catch (error) {
		throw boundaryAuthorityError(error, "The fork turn boundary could not be resolved.");
	}
	return Object.freeze({ relation, boundary });
}

/**
 * Refuse a decision that no longer answers the effect it was given for: another identity,
 * another hash, or an effect whose own hash no longer matches what was approved.
 * @param prepared The prepared mutation.
 * @param decision The decision.
 */
function assertDecisionStillExact(
	prepared: PreparedDynamicMutation,
	decision: DynamicToolApprovalDecision,
): void {
	try {
		validateDecisionShape(decision, prepared.request);
		const sameIdentity = approvalIdentityExact(decision.identity, prepared.identity);
		const sameHash = decision.effectHash === prepared.effectHash;
		const effectUnchanged =
			dynamicEffectHash(prepared.identity, prepared.effect) === prepared.effectHash;
		if (!sameIdentity || !sameHash || !effectUnchanged) {
			throw new CodexDynamicToolsError(
				"invalid_call",
				"The approved dynamic effect is no longer exact.",
			);
		}
	} catch (error) {
		throw dynamicErrorForResponse(error);
	}
}

/**
 * The thread a mutation's effect names, when the effect names one.
 * @param prepared The prepared mutation.
 * @returns The thread, or null.
 */
function effectTargetThreadId(prepared: PreparedDynamicMutation): string | null {
	const effect = prepared.effect;
	if (effect.tool === "fork_thread" || effect.tool === "send_message_to_thread") {
		return effect.arguments.threadId;
	}
	return null;
}

/**
 * Refuse a fork whose boundary moved while the approval was open, since a person approved a
 * fork of what the thread was then and not of what it is now.
 * @param prepared The prepared mutation.
 * @param caller The revalidated caller.
 * @param target The revalidated target.
 * @param relation How the caller stands to the target.
 * @param options The dynamic tools options.
 */
async function assertForkBoundaryUnchanged(
	prepared: PreparedDynamicMutation,
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority,
	relation: "self" | "other",
	options: CodexDynamicToolsOptions,
): Promise<void> {
	const effect = prepared.effect;
	if (effect.tool !== "fork_thread") {
		return;
	}
	let boundary: TurnId | null;
	try {
		boundary = await options.threadAuthority.resolveExactTurnBoundary({
			caller,
			target,
			requestedBeforeTurnId: relation === "self" ? null : effect.arguments.beforeTurnId,
			relation,
		});
	} catch (error) {
		throw boundaryAuthorityError(error, "The fork turn boundary became stale.");
	}
	assertUsableBoundary(boundary);
	if (!boundaryUnchanged(boundary, effect.effectiveBoundary.beforeTurnId, relation, caller)) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The fork boundary changed during revalidation.",
		);
	}
}

/**
 * Whether a re-resolved fork boundary is still the one the approved effect names.
 * @param boundary The re-resolved boundary.
 * @param expected The boundary the effect names.
 * @param relation How the caller stands to the target.
 * @param caller The revalidated caller.
 * @returns Whether the boundary held.
 */
function boundaryUnchanged(
	boundary: TurnId | null,
	expected: string | null,
	relation: "self" | "other",
	caller: DynamicCallerAuthority,
): boolean {
	if (relation === "self" && boundary !== caller.turnId) {
		return false;
	}
	return (boundary === null ? null : String(boundary)) === expected;
}

/**
 * Re-resolve the target a mutation names and refuse anything about it that changed while the
 * approval was open: the thread it names, the caller's relation to it, or a fork's boundary.
 * @param prepared The prepared mutation.
 * @param caller The revalidated caller.
 * @param options The dynamic tools options.
 * @returns The revalidated target, or null when the mutation names none.
 */
async function revalidatedTargetFor(
	prepared: PreparedDynamicMutation,
	caller: DynamicCallerAuthority,
	options: CodexDynamicToolsOptions,
): Promise<DynamicTargetAuthority | null> {
	if (prepared.target === null) {
		return null;
	}
	const freshTarget = await revalidateTarget(prepared.target, options);
	const targetThreadId = effectTargetThreadId(prepared);
	if (targetThreadId === null || freshTarget.wireThreadId !== targetThreadId) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The target identity changed during revalidation.",
		);
	}
	const relation = assertMutationTargetAllowed(prepared.effect.tool, caller, freshTarget);
	if (prepared.relation !== relation) {
		throw new CodexDynamicToolsError("cycle", "The target relation changed during revalidation.");
	}
	await assertForkBoundaryUnchanged(prepared, caller, freshTarget, relation, options);
	return freshTarget;
}

/**
 * Refuse a prepared fork whose own immutable boundary does not agree with what it was prepared
 * with, which would mean the effect and the thing that was approved have come apart.
 * @param prepared The prepared mutation.
 */
function assertImmutableForkBoundary(prepared: PreparedDynamicMutation): void {
	const effect = prepared.effect;
	if (effect.tool !== "fork_thread") {
		return;
	}
	const preparedBoundary = prepared.boundary === null ? null : String(prepared.boundary);
	const sameRelation = effect.effectiveBoundary.relation === prepared.relation;
	if (!sameRelation || effect.effectiveBoundary.beforeTurnId !== preparedBoundary) {
		throw new CodexDynamicToolsError("invalid_call", "The immutable fork boundary is not exact.");
	}
}

/**
 * Re-issue the pane-link authority and refuse anything about it that changed while the approval
 * was open, since the effect is carried out under the token a person was shown.
 * @param prepared The prepared mutation.
 * @param caller The revalidated caller.
 * @param contextAuthority The authority the mutation was prepared under.
 * @param options The dynamic tools options.
 * @returns The revalidated authority.
 */
async function revalidatedContext(
	prepared: PreparedDynamicMutation,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
): Promise<DynamicContextAuthority> {
	let fresh: DynamicContextAuthority;
	try {
		fresh = assertContextAuthority(
			await options.context.issueAndRevalidatePaneLinkAuthority({
				caller,
				existing: contextAuthority,
			}),
			caller,
		);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"The pane-link authority changed during revalidation.",
			error,
		);
	}
	const sameToken = fresh.token === prepared.effect.contextAuthority;
	if (!sameToken || fresh.paneId !== contextAuthority.paneId) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The context authority changed during revalidation.",
		);
	}
	return fresh;
}

/**
 * Refuse a call whose operation identities are no longer the ones its effect names, or are no
 * longer unconsumed, since the effect would then run under an identity nothing accounted for.
 * @param prepared The prepared mutation.
 * @param options The dynamic tools options.
 */
function assertOperationsUnconsumed(
	prepared: PreparedDynamicMutation,
	options: CodexDynamicToolsOptions,
): void {
	const pairs: readonly { readonly id: OperationId; readonly wire: string }[] = [
		{ id: prepared.operations.mutationOperationId, wire: prepared.effect.mutationOperationId },
		...initialTurnPair(prepared),
	];
	for (const operation of pairs) {
		try {
			options.operationId.validateCurrentUnconsumedOperationId(operation.id);
			if (options.operationId.serializeForOwnedWireFields(operation.id) !== operation.wire) {
				throw new Error("the operation serializer returned a different identity");
			}
		} catch (error) {
			throw new CodexDynamicToolsError(
				"invalid_call",
				"A dynamic operation identity is no longer unconsumed.",
				error,
			);
		}
	}
}

/**
 * The initial-turn identity a mutation also owns, when it owns one.
 * @param prepared The prepared mutation.
 * @returns The identity and its wire form, or nothing.
 */
function initialTurnPair(
	prepared: PreparedDynamicMutation,
): readonly { readonly id: OperationId; readonly wire: string }[] {
	const id = prepared.operations.initialTurnOperationId;
	const wire = prepared.effect.initialTurnOperationId;
	if (id === null || wire === null) {
		return [];
	}
	return [{ id, wire }];
}

/**
 * Check that nothing an approved mutation stands on has changed while a person was answering.
 *
 * Everything the effect was described against is resolved again — the caller, the target, the
 * fork boundary, the pane-link authority and the operation identities — and anything that has
 * moved refuses the call. What a person approved is what runs, or nothing does.
 * @param prepared The prepared mutation.
 * @param decision The approval decision.
 * @param caller The caller's authority as it was.
 * @param contextAuthority The pane-link authority as it was.
 * @param options The dynamic tools options.
 * @param request The server request.
 * @returns What the mutation may now be carried out against.
 */
async function revalidateMutation(
	prepared: PreparedDynamicMutation,
	decision: DynamicToolApprovalDecision,
	caller: DynamicCallerAuthority,
	contextAuthority: DynamicContextAuthority,
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
): Promise<RevalidatedMutation> {
	assertDecisionStillExact(prepared, decision);
	const freshCaller = await revalidateCaller(request, caller, options, "after_approval");
	if (freshCaller.authority !== prepared.effect.callerAuthority) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The caller authority changed during revalidation.",
		);
	}
	const freshTarget = await revalidatedTargetFor(prepared, freshCaller, options);
	if ((freshTarget?.authority ?? null) !== prepared.effect.targetAuthority) {
		throw new CodexDynamicToolsError(
			"invalid_call",
			"The target authority changed during revalidation.",
		);
	}
	assertImmutableForkBoundary(prepared);
	const freshContext = await revalidatedContext(prepared, freshCaller, contextAuthority, options);
	assertOperationsUnconsumed(prepared, options);
	if (approvalExpiry(prepared.request, nowOf(options))) {
		throw new CodexDynamicToolsError("expired", "The visual approval expired before the effect.");
	}
	return Object.freeze({ caller: freshCaller, target: freshTarget, context: freshContext });
}

export { type ForkBoundary, type RevalidatedMutation, boundaryForFork, revalidateMutation };
