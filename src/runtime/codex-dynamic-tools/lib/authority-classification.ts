import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/errors";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
	DynamicObservedTarget,
	DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import {
	authorityRefusalCode,
	epochRefusalCode,
	type DynamicLifecyclePhase,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import { isExactlyTrue, isNonEmptyString } from "@/runtime/codex-dynamic-tools/lib/value-shape";
import {
	dynamicError,
	type AuthorityDependencies,
	type ThreadLinkDependency,
} from "@/runtime/codex-dynamic-tools/lib/authority-facts";
import {
	assertAuthorityShape,
	assertCallerState,
	linkEvidenceMatches,
} from "@/runtime/codex-dynamic-tools/lib/authority-assertions";

/**
 * Wrap an authority port failure, passing through a recognized refusal code
 * and defaulting to unproven provenance.
 * @param error Thrown value.
 * @param message Human-readable explanation.
 * @returns The refusal error.
 */
function authorityError(error: unknown, message: string): CodexDynamicToolsError {
	return dynamicError(authorityRefusalCode(error) ?? "unknown_provenance", message, error);
}

/**
 * Wrap a lifecycle port failure, passing through an epoch refusal code and
 * defaulting to an invalid call.
 * @param error Thrown value.
 * @param message Human-readable explanation.
 * @returns The refusal error.
 */
function lifecycleError(error: unknown, message: string): CodexDynamicToolsError {
	return dynamicError(epochRefusalCode(error) ?? "invalid_call", message, error);
}

/**
 * Obtain the live thread-link classification for a record, reusing the
 * embedded one when allowed.
 * @param record Authority record to classify.
 * @param threadLink Thread-link classifier.
 * @param useEmbedded Whether an embedded classification may be reused.
 * @returns The classification.
 */
async function linkFor(
	record: DynamicCallerAuthority | DynamicTargetAuthority,
	threadLink: ThreadLinkDependency,
	useEmbedded = true,
): Promise<ThreadLinkClassification> {
	if (useEmbedded && record.linkClassification !== undefined) {
		return record.linkClassification;
	}
	try {
		return await threadLink.classify(record.threadLinkTarget);
	} catch (error) {
		throw authorityError(error, "The live thread-link authority could not classify the target.");
	}
}

/**
 * Refuse a caller record without non-empty turn identities.
 * @param caller Record returned by the host authority.
 */
function assertCallerTurnIdentity(caller: DynamicCallerAuthority): void {
	if (!isNonEmptyString(caller.turnId) || !isNonEmptyString(caller.wireTurnId)) {
		throw dynamicError("invalid_call", "The caller authority returned an invalid turn identity.");
	}
}

/**
 * Whether a caller record names the request's logical call and wire identities.
 * @param caller Record returned by the host authority.
 * @param request The dynamic request being dispatched.
 * @returns Whether the thread and turn identities match.
 */
function callerNamesRequest(
	caller: DynamicCallerAuthority,
	request: DynamicServerRequest,
): boolean {
	return (
		caller.threadId === request.logicalCall.threadId &&
		caller.turnId === request.logicalCall.turnId &&
		caller.wireThreadId === request.params.threadId &&
		caller.wireTurnId === request.params.turnId
	);
}

/**
 * Refuse a caller record that is not the executing logical call of the request.
 * @param caller Record returned by the host authority.
 * @param request The dynamic request being dispatched.
 */
function assertCallerMatchesRequest(
	caller: DynamicCallerAuthority,
	request: DynamicServerRequest,
): void {
	if (
		!isExactlyTrue(caller.executing) ||
		!callerNamesRequest(caller, request) ||
		caller.childId !== request.child ||
		caller.epoch !== request.epoch
	) {
		throw dynamicError("invalid_call", "The logical caller is not the executing dynamic call.");
	}
}

/**
 * Refuse a caller whose live thread-link is not executable.
 * @param link Live thread-link evidence.
 * @param message Refusal message.
 */
function assertExecutableCallerLink(link: ThreadLinkClassification, message: string): void {
	if (link.link.state !== "executable") {
		throw dynamicError("not_controllable", message);
	}
}

/**
 * Ask the host authority for the logical caller of a request.
 * @param request The dynamic request being dispatched.
 * @param options Authority dependencies.
 * @returns The caller record.
 */
async function resolvedCaller(
	request: DynamicServerRequest,
	options: AuthorityDependencies,
): Promise<DynamicCallerAuthority> {
	try {
		return await options.threadAuthority.resolveExactLogicalCaller({ request });
	} catch (error) {
		throw authorityError(error, "The dynamic call caller could not be resolved.");
	}
}

/**
 * Resolve and prove the executing caller of a dynamic request against the
 * host authority and the live thread-link.
 * @param request The dynamic request being dispatched.
 * @param options Authority dependencies.
 * @returns The proven caller with its link classification attached.
 */
async function resolveCaller(
	request: DynamicServerRequest,
	options: AuthorityDependencies,
): Promise<DynamicCallerAuthority> {
	const caller = await resolvedCaller(request, options);
	assertAuthorityShape(caller, "caller");
	assertCallerTurnIdentity(caller);
	assertCallerMatchesRequest(caller, request);
	assertCallerState(caller);
	const link = await linkFor(caller, options.threadLink);
	linkEvidenceMatches(caller, link, false);
	assertExecutableCallerLink(link, "The dynamic caller thread-link is not executable.");
	return Object.freeze({ ...caller, linkClassification: link });
}

/**
 * Ask the host authority to classify a target thread.
 * @param caller The proven caller.
 * @param threadId Requested target thread identity.
 * @param options Authority dependencies.
 * @param observed Facts already observed about the target, if any.
 * @returns The target record.
 */
async function classifiedTarget(
	caller: DynamicCallerAuthority,
	threadId: unknown,
	options: AuthorityDependencies,
	observed: DynamicObservedTarget | undefined,
): Promise<DynamicTargetAuthority> {
	try {
		return await options.threadAuthority.classifyExactTarget({
			caller,
			threadId,
			...(observed === undefined ? {} : { observed }),
		});
	} catch (error) {
		throw authorityError(error, "The dynamic call target could not be classified.");
	}
}

/**
 * Refuse a current-epoch target that is not in the caller's child epoch.
 * @param target The target record.
 * @param caller The proven caller.
 */
function assertCurrentTargetInCallerEpoch(
	target: DynamicTargetAuthority,
	caller: DynamicCallerAuthority,
): void {
	if (
		target.epochState === "current" &&
		(target.childId !== caller.childId || target.epoch !== caller.epoch)
	) {
		throw dynamicError("stale_child", "The target is not in the caller's current child epoch.");
	}
}

/**
 * Classify and prove a target thread against the host authority and the live
 * thread-link.
 * @param caller The proven caller.
 * @param threadId Requested target thread identity.
 * @param options Authority dependencies.
 * @param observed Facts already observed about the target, if any.
 * @returns The proven target with its link classification attached.
 */
async function resolveTarget(
	caller: DynamicCallerAuthority,
	threadId: unknown,
	options: AuthorityDependencies,
	observed?: DynamicObservedTarget,
): Promise<DynamicTargetAuthority> {
	const target = await classifiedTarget(caller, threadId, options, observed);
	assertAuthorityShape(target, "target");
	if (!isNonEmptyString(target.wireThreadId)) {
		throw dynamicError("invalid_call", "The target authority returned an invalid thread identity.");
	}
	if (target.wireThreadId !== threadId && target.threadId !== threadId) {
		throw dynamicError("invalid_call", "The target authority returned a different ThreadId.");
	}
	const link = await linkFor(target, options.threadLink);
	linkEvidenceMatches(target, link, true);
	assertCurrentTargetInCallerEpoch(target, caller);
	return Object.freeze({ ...target, linkClassification: link });
}

/**
 * Ask the lifecycle port whether the logical call is still executing.
 * @param request The dynamic request being dispatched.
 * @param caller The proven caller.
 * @param options Lifecycle dependency.
 * @param phase Which dispatch phase is being entered.
 */
async function assertStillExecuting(
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	options: Pick<CodexDynamicToolsOptions, "lifecycle">,
	phase: DynamicLifecyclePhase,
): Promise<void> {
	try {
		await options.lifecycle.assertCallExecuting({ request, caller, phase });
	} catch (error) {
		throw lifecycleError(error, "The logical dynamic call is no longer executing.");
	}
}

/**
 * Ask the host authority to revalidate a caller record.
 * @param caller The previously proven caller.
 * @param options Authority dependencies.
 * @returns The fresh caller record.
 */
async function revalidatedCaller(
	caller: DynamicCallerAuthority,
	options: AuthorityDependencies,
): Promise<DynamicCallerAuthority> {
	try {
		return await options.threadAuthority.revalidateCaller(caller);
	} catch (error) {
		throw authorityError(error, "The dynamic caller authority became stale.");
	}
}

/**
 * Whether a fresh caller record names the same thread and turn as before.
 * @param fresh The revalidated caller.
 * @param caller The previously proven caller.
 * @returns Whether the identities are equal.
 */
function sameCallerIdentity(
	fresh: DynamicCallerAuthority,
	caller: DynamicCallerAuthority,
): boolean {
	return (
		fresh.threadId === caller.threadId &&
		fresh.turnId === caller.turnId &&
		fresh.wireThreadId === caller.wireThreadId &&
		fresh.wireTurnId === caller.wireTurnId
	);
}

/**
 * Refuse a revalidated caller whose token or identity changed.
 * @param fresh The revalidated caller.
 * @param caller The previously proven caller.
 */
function assertCallerUnchanged(
	fresh: DynamicCallerAuthority,
	caller: DynamicCallerAuthority,
): void {
	if (fresh.authority !== caller.authority) {
		throw dynamicError("invalid_call", "The caller authority token changed during revalidation.");
	}
	if (
		!isExactlyTrue(fresh.executing) ||
		!sameCallerIdentity(fresh, caller) ||
		fresh.childId !== caller.childId ||
		fresh.epoch !== caller.epoch
	) {
		throw dynamicError("invalid_call", "The logical caller changed during revalidation.");
	}
}

/**
 * Re-prove the caller after a pause (an approval, for instance): the call
 * must still execute and the fresh record must match the original.
 * @param request The dynamic request being dispatched.
 * @param caller The previously proven caller.
 * @param options Authority and lifecycle dependencies.
 * @param phase Which dispatch phase is being entered.
 * @returns The fresh proven caller with its link classification attached.
 */
async function revalidateCaller(
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	options: Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink" | "lifecycle">,
	phase: DynamicLifecyclePhase,
): Promise<DynamicCallerAuthority> {
	await assertStillExecuting(request, caller, options, phase);
	const fresh = await revalidatedCaller(caller, options);
	assertAuthorityShape(fresh, "caller");
	assertCallerTurnIdentity(fresh);
	assertCallerUnchanged(fresh, caller);
	assertCallerState(fresh);
	const link = await linkFor(fresh, options.threadLink, false);
	linkEvidenceMatches(fresh, link, false);
	assertExecutableCallerLink(link, "The caller thread-link is no longer executable.");
	return Object.freeze({ ...fresh, linkClassification: link });
}

/**
 * Ask the host authority to revalidate a target record.
 * @param target The previously proven target.
 * @param options Authority dependencies.
 * @returns The fresh target record.
 */
async function revalidatedTarget(
	target: DynamicTargetAuthority,
	options: AuthorityDependencies,
): Promise<DynamicTargetAuthority> {
	try {
		return await options.threadAuthority.revalidateTarget(target);
	} catch (error) {
		throw authorityError(error, "The target authority became stale.");
	}
}

/**
 * Re-prove a target after a pause: the fresh record must carry the same token
 * and identity and its live link must still match.
 * @param target The previously proven target.
 * @param options Authority dependencies.
 * @returns The fresh proven target with its link classification attached.
 */
async function revalidateTarget(
	target: DynamicTargetAuthority,
	options: AuthorityDependencies,
): Promise<DynamicTargetAuthority> {
	const fresh = await revalidatedTarget(target, options);
	assertAuthorityShape(fresh, "target");
	if (fresh.authority !== target.authority) {
		throw dynamicError("invalid_call", "The target authority token changed during revalidation.");
	}
	if (fresh.threadId !== target.threadId || fresh.wireThreadId !== target.wireThreadId) {
		throw dynamicError("invalid_call", "The target identity changed during revalidation.");
	}
	const link = await linkFor(fresh, options.threadLink, false);
	linkEvidenceMatches(fresh, link, false);
	return Object.freeze({ ...fresh, linkClassification: link });
}

export { resolveCaller, resolveTarget, revalidateCaller, revalidateTarget };
