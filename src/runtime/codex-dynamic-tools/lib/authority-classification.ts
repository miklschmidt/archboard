import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import { CodexDynamicToolsError } from "./contract.js";
import type {
	CodexDynamicToolsOptions,
	DynamicCallerAuthority,
	DynamicLifecyclePhase,
	DynamicObservedTarget,
	DynamicRefusalReason,
	DynamicTargetAuthority,
} from "./contract.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";
import { isAllowedSource } from "./classification.js";

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dynamicError(
	code: DynamicRefusalReason,
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

function sameProof(
	left: DynamicCallerAuthority["provenance"],
	right: DynamicCallerAuthority["provenance"],
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	try {
		return (
			left.manifestRevision === right.manifestRevision &&
			left.record.correlation.childId === right.record.correlation.childId &&
			left.record.correlation.epoch === right.record.correlation.epoch &&
			left.record.correlation.operationId === right.record.correlation.operationId &&
			left.record.operation.id === right.record.operation.id &&
			left.record.operation.kind === right.record.operation.kind &&
			left.record.operation.rpc === right.record.operation.rpc &&
			left.record.status === right.record.status &&
			left.record.outcome === right.record.outcome &&
			left.record.provenance.childId === right.record.provenance.childId &&
			left.record.provenance.epoch === right.record.provenance.epoch &&
			left.record.provenance.threadId === right.record.provenance.threadId &&
			left.record.provenance.turnId === right.record.provenance.turnId &&
			left.record.provenance.threadSource === right.record.provenance.threadSource &&
			left.record.provenance.workspaceRoot === right.record.provenance.workspaceRoot &&
			left.record.provenance.instructionHash === right.record.provenance.instructionHash &&
			left.record.provenance.manifestHash === right.record.provenance.manifestHash &&
			left.record.provenance.confirmedAtMs === right.record.provenance.confirmedAtMs &&
			left.record.reason === right.record.reason &&
			left.record.createdAtMs === right.record.createdAtMs &&
			left.record.updatedAtMs === right.record.updatedAtMs
		);
	} catch {
		return false;
	}
}

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

function linkEvidenceMatches(
	record: AuthorityFacts,
	link: LinkEvidence,
	allowInspectOnlyEpoch: boolean,
): void {
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
	if (!sameProof(link.proof, record.provenance)) {
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link proof is not the durable proof supplied by the authority.",
		);
	}
	if (link.link.state !== "executable" && link.link.state !== "inspect_only") {
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link state is not executable or inspect-only.",
		);
	}
	if (
		link.link.state === "executable" &&
		(record.epochState !== "current" || link.proof === null || record.provenance === null)
	) {
		throw dynamicError(
			"unknown_provenance",
			"An executable thread-link is missing current durable provenance.",
		);
	}
	if (
		link.link.state === "executable" &&
		(link.link.childId !== record.childId ||
			link.link.epoch !== record.epoch ||
			link.link.source !== record.source ||
			link.link.status !== record.status ||
			!link.link.loaded ||
			!link.link.canAcceptDirectInput)
	) {
		throw dynamicError(
			"unknown_provenance",
			"The executable thread-link identity changed during dispatch.",
		);
	}
	if (
		record.epochState === "current" &&
		(record.childId === null ||
			record.epoch === null ||
			link.currentEpoch === null ||
			link.currentEpoch.childId !== record.childId ||
			link.currentEpoch.epoch !== record.epoch)
	) {
		throw dynamicError("stale_child", "The target is no longer in the current child epoch.");
	}
	if (record.epochState === "prior" && !allowInspectOnlyEpoch) {
		throw dynamicError("prior_epoch", "The target belongs to a prior child epoch.");
	}
	if (record.epochState === "unknown" && !allowInspectOnlyEpoch) {
		throw dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
	}
}

function assertCallerState(caller: CallerFacts): void {
	if (caller.epochState !== "current") {
		throw caller.epochState === "prior"
			? dynamicError("prior_epoch", "The dynamic caller belongs to a prior epoch.")
			: dynamicError("stale_child", "The dynamic caller has no current child epoch.");
	}
	if (caller.ownership !== "created") {
		throw dynamicError("unknown_provenance", "The dynamic caller was not created by Archboard.");
	}
	if (!isAllowedSource(caller.source)) {
		throw dynamicError(
			"unknown_provenance",
			"The dynamic caller source is not executable provenance.",
		);
	}
	if (!caller.loaded || caller.status === "notLoaded") {
		throw dynamicError("not_loaded", "The dynamic caller is not loaded.");
	}
	if (caller.directInput !== true) {
		throw dynamicError("not_controllable", "The dynamic caller cannot accept direct input.");
	}
	if (caller.status !== "active") {
		throw caller.status === "systemError"
			? dynamicError("system_error", "The dynamic caller is in a system error state.")
			: dynamicError("invalid_call", "The dynamic caller is not executing an active turn.");
	}
	if (caller.provenance === null) {
		throw dynamicError("unknown_provenance", "The dynamic caller has no durable execution proof.");
	}
}

function assertAuthorityShape(authority: AuthorityShape, role: "caller" | "target"): void {
	if (
		authority.role !== role ||
		typeof authority.authority !== "string" ||
		authority.authority.length === 0 ||
		typeof authority.threadId !== "string" ||
		authority.threadId.length === 0 ||
		typeof authority.wireThreadId !== "string" ||
		authority.wireThreadId.length === 0 ||
		(authority.childId !== null &&
			(typeof authority.childId !== "string" || authority.childId.length === 0)) ||
		(authority.epoch !== null &&
			(typeof authority.epoch !== "string" || authority.epoch.length === 0)) ||
		(authority.epochState !== "current" &&
			authority.epochState !== "prior" &&
			authority.epochState !== "unknown") ||
		(authority.ownership !== "created" &&
			authority.ownership !== "attached" &&
			authority.ownership !== "foreign") ||
		typeof authority.loaded !== "boolean" ||
		(authority.directInput !== null && typeof authority.directInput !== "boolean") ||
		(authority.status !== "notLoaded" &&
			authority.status !== "idle" &&
			authority.status !== "systemError" &&
			authority.status !== "active") ||
		!isRecord(authority.threadLinkTarget) ||
		authority.threadLinkTarget.threadId !== authority.threadId
	) {
		throw dynamicError("invalid_call", `The ${role} authority returned an invalid identity shape.`);
	}
}

function errorCode(error: unknown): DynamicRefusalReason | undefined {
	if (isRecord(error) && typeof error["code"] === "string") {
		const { code } = error;
		if (
			code === "stale_child" ||
			code === "prior_epoch" ||
			code === "unknown_provenance" ||
			code === "not_loaded" ||
			code === "not_controllable" ||
			code === "system_error"
		) {
			return code;
		}
	}
	return undefined;
}

function authorityError(error: unknown, message: string): CodexDynamicToolsError {
	const code = errorCode(error);
	if (code === "stale_child" || code === "prior_epoch" || code === "unknown_provenance") {
		return dynamicError(code, message, error);
	}
	if (code === "not_loaded" || code === "not_controllable" || code === "system_error") {
		return dynamicError(code, message, error);
	}
	return dynamicError("unknown_provenance", message, error);
}

function lifecycleError(error: unknown, message: string): CodexDynamicToolsError {
	const code = errorCode(error);
	if (code === "stale_child" || code === "prior_epoch" || code === "unknown_provenance") {
		return dynamicError(code, message, error);
	}
	return dynamicError("invalid_call", message, error);
}

async function linkFor(
	record: DynamicCallerAuthority | DynamicTargetAuthority,
	threadLink: Pick<CodexDynamicToolsOptions["threadLink"], "classify">,
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

async function resolveCaller(
	request: DynamicServerRequest,
	options: Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink">,
): Promise<DynamicCallerAuthority> {
	let caller: DynamicCallerAuthority;
	try {
		caller = await options.threadAuthority.resolveExactLogicalCaller({ request });
	} catch (error) {
		throw authorityError(error, "The dynamic call caller could not be resolved.");
	}
	assertAuthorityShape(caller, "caller");
	if (
		typeof caller.turnId !== "string" ||
		caller.turnId.length === 0 ||
		typeof caller.wireTurnId !== "string" ||
		caller.wireTurnId.length === 0
	) {
		throw dynamicError("invalid_call", "The caller authority returned an invalid turn identity.");
	}
	if (
		caller.role !== "caller" ||
		!caller.executing ||
		caller.threadId !== request.logicalCall.threadId ||
		caller.turnId !== request.logicalCall.turnId ||
		caller.wireThreadId !== request.params.threadId ||
		caller.wireTurnId !== request.params.turnId ||
		caller.childId !== request.child ||
		caller.epoch !== request.epoch
	) {
		throw dynamicError("invalid_call", "The logical caller is not the executing dynamic call.");
	}
	assertCallerState(caller);
	const link = await linkFor(caller, options.threadLink);
	linkEvidenceMatches(caller, link, false);
	if (link.link.state !== "executable" || !link.link.canAcceptDirectInput) {
		throw dynamicError("not_controllable", "The dynamic caller thread-link is not executable.");
	}
	return Object.freeze({ ...caller, linkClassification: link });
}

async function resolveTarget(
	caller: DynamicCallerAuthority,
	threadId: unknown,
	options: Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink">,
	observed?: DynamicObservedTarget,
): Promise<DynamicTargetAuthority> {
	let target: DynamicTargetAuthority;
	try {
		target = await options.threadAuthority.classifyExactTarget({
			caller,
			threadId,
			...(observed === undefined ? {} : { observed }),
		});
	} catch (error) {
		throw authorityError(error, "The dynamic call target could not be classified.");
	}
	assertAuthorityShape(target, "target");
	if (
		target.role !== "target" ||
		typeof target.wireThreadId !== "string" ||
		target.wireThreadId.length === 0
	) {
		throw dynamicError("invalid_call", "The target authority returned an invalid thread identity.");
	}
	if (target.wireThreadId !== threadId && target.threadId !== threadId) {
		throw dynamicError("invalid_call", "The target authority returned a different ThreadId.");
	}
	const link = await linkFor(target, options.threadLink);
	linkEvidenceMatches(target, link, true);
	if (
		target.epochState === "current" &&
		(target.childId !== caller.childId || target.epoch !== caller.epoch)
	) {
		throw dynamicError("stale_child", "The target is not in the caller's current child epoch.");
	}
	return Object.freeze({ ...target, linkClassification: link });
}

async function revalidateCaller(
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	options: Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink" | "lifecycle">,
	phase: DynamicLifecyclePhase,
): Promise<DynamicCallerAuthority> {
	try {
		await options.lifecycle.assertCallExecuting({ request, caller, phase });
	} catch (error) {
		throw lifecycleError(error, "The logical dynamic call is no longer executing.");
	}
	let fresh: DynamicCallerAuthority;
	try {
		fresh = await options.threadAuthority.revalidateCaller(caller);
	} catch (error) {
		throw authorityError(error, "The dynamic caller authority became stale.");
	}
	assertAuthorityShape(fresh, "caller");
	if (
		typeof fresh.turnId !== "string" ||
		fresh.turnId.length === 0 ||
		typeof fresh.wireTurnId !== "string" ||
		fresh.wireTurnId.length === 0
	) {
		throw dynamicError("invalid_call", "The caller authority returned an invalid turn identity.");
	}
	if (fresh.authority !== caller.authority) {
		throw dynamicError("invalid_call", "The caller authority token changed during revalidation.");
	}
	if (
		fresh.role !== "caller" ||
		fresh.threadId !== caller.threadId ||
		fresh.turnId !== caller.turnId ||
		fresh.wireThreadId !== caller.wireThreadId ||
		fresh.wireTurnId !== caller.wireTurnId ||
		fresh.childId !== caller.childId ||
		fresh.epoch !== caller.epoch ||
		!fresh.executing
	) {
		throw dynamicError("invalid_call", "The logical caller changed during revalidation.");
	}
	assertCallerState(fresh);
	const link = await linkFor(fresh, options.threadLink, false);
	linkEvidenceMatches(fresh, link, false);
	if (link.link.state !== "executable" || !link.link.canAcceptDirectInput) {
		throw dynamicError("not_controllable", "The caller thread-link is no longer executable.");
	}
	return Object.freeze({ ...fresh, linkClassification: link });
}

async function revalidateTarget(
	target: DynamicTargetAuthority,
	options: Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink">,
): Promise<DynamicTargetAuthority> {
	let fresh: DynamicTargetAuthority;
	try {
		fresh = await options.threadAuthority.revalidateTarget(target);
	} catch (error) {
		throw authorityError(error, "The target authority became stale.");
	}
	assertAuthorityShape(fresh, "target");
	if (fresh.authority !== target.authority) {
		throw dynamicError("invalid_call", "The target authority token changed during revalidation.");
	}
	if (
		fresh.threadId !== target.threadId ||
		fresh.wireThreadId !== target.wireThreadId ||
		fresh.role !== "target"
	) {
		throw dynamicError("invalid_call", "The target identity changed during revalidation.");
	}
	const link = await linkFor(fresh, options.threadLink, false);
	linkEvidenceMatches(fresh, link, false);
	return Object.freeze({ ...fresh, linkClassification: link });
}

export { resolveCaller, resolveTarget, revalidateCaller, revalidateTarget };
