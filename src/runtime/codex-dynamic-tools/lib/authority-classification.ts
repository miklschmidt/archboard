import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/errors";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
	DynamicObservedTarget,
	DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import { isAllowedSource } from "@/runtime/codex-dynamic-tools/lib/classification";
import {
	authorityRefusalCode,
	epochRefusalCode,
	isDynamicEpochState,
	isDynamicOwnership,
	isDynamicStatus,
	type DynamicLifecyclePhase,
	type DynamicRefusalReason,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import {
	isExactlyTrue,
	isNonEmptyString,
	isRecord,
} from "@/runtime/codex-dynamic-tools/lib/value-shape";

type AuthorityFacts = Readonly<
	Omit<DynamicTargetAuthority, "authority" | "role" | "linkClassification" | "threadLinkTarget">
>;
type CallerFacts = Readonly<
	Omit<DynamicCallerAuthority, "linkClassification" | "threadLinkTarget">
>;
type LinkEvidence = Readonly<Omit<ThreadLinkClassification, "thread">>;
type AuthorityShape = Readonly<
	Omit<DynamicCallerAuthority | DynamicTargetAuthority, "linkClassification" | "threadLinkTarget">
> & {
	readonly threadLinkTarget: Readonly<Pick<DynamicTargetAuthority["threadLinkTarget"], "threadId">>;
};
type ExecutionProof = NonNullable<DynamicCallerAuthority["provenance"]>;
type ProofRecord = ExecutionProof["record"];
type ThreadLinkDependency = Pick<CodexDynamicToolsOptions["threadLink"], "classify">;
type AuthorityDependencies = Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink">;

/**
 * Build a refusal for the authority boundary.
 * @param code Refusal reason.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The refusal error.
 */
function dynamicError(
	code: DynamicRefusalReason,
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

/**
 * Whether a value is null or a non-empty string, the shape of an optional
 * identity field.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is null or a non-empty string.
 */
function isNullOrNonEmptyString(value: unknown): value is string | null {
	return value === null || isNonEmptyString(value);
}

/**
 * Whether two durable records name the same staged operation correlation.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the correlations are equal.
 */
function sameCorrelation(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.correlation.childId === right.correlation.childId &&
		left.correlation.epoch === right.correlation.epoch &&
		left.correlation.operationId === right.correlation.operationId
	);
}

/**
 * Whether two durable records describe the same operation.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the operation fields are equal.
 */
function sameOperation(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.operation.id === right.operation.id &&
		left.operation.kind === right.operation.kind &&
		left.operation.rpc === right.operation.rpc
	);
}

/**
 * Whether two durable records carry the same provenance identity.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the child, epoch, thread and turn are equal.
 */
function sameProvenanceIdentity(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.provenance.childId === right.provenance.childId &&
		left.provenance.epoch === right.provenance.epoch &&
		left.provenance.threadId === right.provenance.threadId &&
		left.provenance.turnId === right.provenance.turnId
	);
}

/**
 * Whether two durable records carry the same provenance evidence.
 * @param left One record.
 * @param right The other record.
 * @returns Whether the source, roots, hashes and confirmation time are equal.
 */
function sameProvenanceEvidence(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.provenance.threadSource === right.provenance.threadSource &&
		left.provenance.workspaceRoot === right.provenance.workspaceRoot &&
		left.provenance.instructionHash === right.provenance.instructionHash &&
		left.provenance.manifestHash === right.provenance.manifestHash &&
		left.provenance.confirmedAtMs === right.provenance.confirmedAtMs
	);
}

/**
 * Whether two durable records are in the same lifecycle state.
 * @param left One record.
 * @param right The other record.
 * @returns Whether status, outcome, reason and timestamps are equal.
 */
function sameRecordState(left: ProofRecord, right: ProofRecord): boolean {
	return (
		left.status === right.status &&
		left.outcome === right.outcome &&
		left.reason === right.reason &&
		left.createdAtMs === right.createdAtMs &&
		left.updatedAtMs === right.updatedAtMs
	);
}

/**
 * Whether two non-null execution proofs are field-for-field equal.
 * @param left One proof.
 * @param right The other proof.
 * @returns Whether every compared field is equal.
 */
function sameProofRecords(left: ExecutionProof, right: ExecutionProof): boolean {
	return (
		left.manifestRevision === right.manifestRevision &&
		sameCorrelation(left.record, right.record) &&
		sameOperation(left.record, right.record) &&
		sameProvenanceIdentity(left.record, right.record) &&
		sameProvenanceEvidence(left.record, right.record) &&
		sameRecordState(left.record, right.record)
	);
}

/**
 * Whether two execution proofs are equal, treating a malformed proof as unequal.
 * @param left One proof or null.
 * @param right The other proof or null.
 * @returns Whether both are null or field-for-field equal.
 */
function sameProof(
	left: DynamicCallerAuthority["provenance"],
	right: DynamicCallerAuthority["provenance"],
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	try {
		return sameProofRecords(left, right);
	} catch {
		return false;
	}
}

/**
 * Whether two thread sources are structurally equal.
 * @param left One source.
 * @param right The other source.
 * @returns Whether the sources serialize identically.
 */
function sameSource(
	left: DynamicCallerAuthority["source"],
	right: DynamicCallerAuthority["source"],
): boolean {
	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

/**
 * Refuse live link evidence that names another thread or observed the thread
 * differently from the authority record.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 */
function assertLinkObservesRecord(record: AuthorityFacts, link: LinkEvidence): void {
	if (link.link.threadId !== record.threadId) {
		throw dynamicError("unknown_provenance", "The live thread-link proof names another thread.");
	}
	if (
		link.observation.loaded !== record.loaded ||
		link.observation.canAcceptDirectInput !== record.directInput ||
		link.observation.status !== record.status ||
		!sameSource(link.observation.source, record.source)
	) {
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link observation changed during dispatch.",
		);
	}
}

/**
 * Refuse an executable link that lacks current durable provenance.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 */
function assertExecutableLinkProvenance(record: AuthorityFacts, link: LinkEvidence): void {
	if (
		link.link.state === "executable" &&
		(record.epochState !== "current" || link.proof === null || record.provenance === null)
	) {
		throw dynamicError(
			"unknown_provenance",
			"An executable thread-link is missing current durable provenance.",
		);
	}
}

/**
 * Refuse an executable link whose identity differs from the authority record.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 */
function assertExecutableLinkIdentity(record: AuthorityFacts, link: LinkEvidence): void {
	if (
		link.link.state === "executable" &&
		(link.link.childId !== record.childId ||
			link.link.epoch !== record.epoch ||
			link.link.source !== record.source ||
			link.link.status !== record.status)
	) {
		throw dynamicError(
			"unknown_provenance",
			"The executable thread-link identity changed during dispatch.",
		);
	}
}

/**
 * Whether the authority record and the live link agree on the current child epoch.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 * @returns Whether both name the same current child epoch.
 */
function currentEpochMatches(record: AuthorityFacts, link: LinkEvidence): boolean {
	return (
		record.childId !== null &&
		record.epoch !== null &&
		link.currentEpoch !== null &&
		link.currentEpoch.childId === record.childId &&
		link.currentEpoch.epoch === record.epoch
	);
}

/**
 * Refuse a record outside the current child epoch unless inspect-only epochs
 * are allowed for this classification.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 * @param allowInspectOnlyEpoch Whether prior or unknown epochs are tolerated.
 */
function assertEpochOwnership(
	record: AuthorityFacts,
	link: LinkEvidence,
	allowInspectOnlyEpoch: boolean,
): void {
	if (record.epochState === "current" && !currentEpochMatches(record, link)) {
		throw dynamicError("stale_child", "The target is no longer in the current child epoch.");
	}
	if (record.epochState === "prior" && !allowInspectOnlyEpoch) {
		throw dynamicError("prior_epoch", "The target belongs to a prior child epoch.");
	}
	if (record.epochState === "unknown" && !allowInspectOnlyEpoch) {
		throw dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
	}
}

/**
 * Cross-check an authority record against the live thread-link evidence so a
 * stale or forged record cannot authorize an effect.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 * @param allowInspectOnlyEpoch Whether prior or unknown epochs are tolerated.
 */
function linkEvidenceMatches(
	record: AuthorityFacts,
	link: LinkEvidence,
	allowInspectOnlyEpoch: boolean,
): void {
	assertLinkObservesRecord(record, link);
	if (!sameProof(link.proof, record.provenance)) {
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link proof is not the durable proof supplied by the authority.",
		);
	}
	assertExecutableLinkProvenance(record, link);
	assertExecutableLinkIdentity(record, link);
	assertEpochOwnership(record, link, allowInspectOnlyEpoch);
}

/**
 * Refuse a caller outside the current epoch, not created by Archboard, or
 * from a non-executable source.
 * @param caller The caller's thread facts.
 */
function assertCallerEpoch(caller: CallerFacts): void {
	if (caller.epochState !== "current") {
		throw caller.epochState === "prior"
			? dynamicError("prior_epoch", "The dynamic caller belongs to a prior epoch.")
			: dynamicError("stale_child", "The dynamic caller has no current child epoch.");
	}
	if (caller.ownership !== "created") {
		throw dynamicError("unknown_provenance", "The dynamic caller was not created by Archboard.");
	}
	if (!isAllowedSource(caller.source)) {
		throw dynamicError("unknown_provenance", "The dynamic caller source is not executable provenance.");
	}
}

/**
 * Refuse a caller that is not loaded or cannot accept direct input.
 * @param caller The caller's thread facts.
 */
function assertCallerLoaded(caller: CallerFacts): void {
	if (!caller.loaded || caller.status === "notLoaded") {
		throw dynamicError("not_loaded", "The dynamic caller is not loaded.");
	}
	if (caller.directInput !== true) {
		throw dynamicError("not_controllable", "The dynamic caller cannot accept direct input.");
	}
}

/**
 * Refuse a caller that is not executing an active turn with durable proof.
 * @param caller The caller's thread facts.
 */
function assertCallerActive(caller: CallerFacts): void {
	if (caller.status !== "active") {
		throw caller.status === "systemError"
			? dynamicError("system_error", "The dynamic caller is in a system error state.")
			: dynamicError("invalid_call", "The dynamic caller is not executing an active turn.");
	}
	if (caller.provenance === null) {
		throw dynamicError("unknown_provenance", "The dynamic caller has no durable execution proof.");
	}
}

/**
 * Apply every caller-state rule in the reviewed order.
 * @param caller The caller's thread facts.
 */
function assertCallerState(caller: CallerFacts): void {
	assertCallerEpoch(caller);
	assertCallerLoaded(caller);
	assertCallerActive(caller);
}

/**
 * Whether an authority record carries a well-formed role and thread identity.
 * @param authority Record returned by the host authority.
 * @param role The role this record must claim.
 * @returns Whether the identity fields are well-formed.
 */
function hasAuthorityIdentity(authority: AuthorityShape, role: "caller" | "target"): boolean {
	return (
		authority.role === role &&
		isNonEmptyString(authority.authority) &&
		isNonEmptyString(authority.threadId) &&
		isNonEmptyString(authority.wireThreadId)
	);
}

/**
 * Whether an authority record carries well-formed epoch and ownership fields.
 * @param authority Record returned by the host authority.
 * @returns Whether the epoch fields are well-formed.
 */
function hasAuthorityEpochFields(authority: AuthorityShape): boolean {
	return (
		isNullOrNonEmptyString(authority.childId) &&
		isNullOrNonEmptyString(authority.epoch) &&
		isDynamicEpochState(authority.epochState) &&
		isDynamicOwnership(authority.ownership)
	);
}

/**
 * Whether an authority record carries well-formed observation fields and a
 * thread-link target naming the same thread.
 * @param authority Record returned by the host authority.
 * @returns Whether the observation fields are well-formed.
 */
function hasAuthorityObservation(authority: AuthorityShape): boolean {
	return (
		typeof authority.loaded === "boolean" &&
		(authority.directInput === null || typeof authority.directInput === "boolean") &&
		isDynamicStatus(authority.status) &&
		isRecord(authority.threadLinkTarget) &&
		authority.threadLinkTarget.threadId === authority.threadId
	);
}

/**
 * Refuse an authority record whose shape is not the reviewed identity shape,
 * whatever its static type promised.
 * @param authority Record returned by the host authority.
 * @param role The role this record must claim.
 */
function assertAuthorityShape(authority: AuthorityShape, role: "caller" | "target"): void {
	if (
		!hasAuthorityIdentity(authority, role) ||
		!hasAuthorityEpochFields(authority) ||
		!hasAuthorityObservation(authority)
	) {
		throw dynamicError("invalid_call", `The ${role} authority returned an invalid identity shape.`);
	}
}

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
function callerNamesRequest(caller: DynamicCallerAuthority, request: DynamicServerRequest): boolean {
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
function sameCallerIdentity(fresh: DynamicCallerAuthority, caller: DynamicCallerAuthority): boolean {
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
function assertCallerUnchanged(fresh: DynamicCallerAuthority, caller: DynamicCallerAuthority): void {
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
