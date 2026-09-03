import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	GeneralThreadToolNameSchema,
	parseToolArguments,
	type ArchboardAppNamespaceSpec,
	type ToolArguments,
} from "../../codex-thread-tools/index.js";
import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicEpochState,
	type DynamicLifecyclePhase,
	type DynamicMutationToolName,
	type DynamicObservedTarget,
	type DynamicRelation,
	type DynamicTargetAuthority,
	type DynamicToolName,
	type DynamicStatus,
	type DynamicRefusalReason,
} from "./contract.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";
import { isCodexThreadStatusType } from "../../../shared/codex-app-server-contract/index.js";

const DYNAMIC_PARAMS_KEYS = Object.freeze([
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"arguments",
] as const);
const DYNAMIC_REQUEST_KEYS = Object.freeze([
	"child",
	"epoch",
	"requestId",
	"correlation",
	"method",
	"params",
	"owner",
	"logicalCall",
] as const);
const WIRE_CORRELATION_KEYS = Object.freeze(["child", "epoch", "requestId"] as const);
const LOGICAL_CALL_KEYS = Object.freeze([
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const);

export type ValidatedDynamicCall = {
	[Name in DynamicToolName]: {
		readonly name: Name;
		readonly arguments: ToolArguments[Name];
	};
}[DynamicToolName];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
	);
}

function dynamicError(
	code: DynamicRefusalReason,
	message: string,
	cause?: unknown,
): CodexDynamicToolsError {
	return new CodexDynamicToolsError(code, message, cause);
}

function exactCatalogue(catalogue: ArchboardAppNamespaceSpec | undefined): void {
	const candidate = catalogue ?? ARCHBOARD_APP_NAMESPACE;
	if (JSON.stringify(candidate) !== JSON.stringify(ARCHBOARD_APP_NAMESPACE))
		throw dynamicError("invalid_call", "The archboard_app catalogue is not the reviewed manifest.");
}

function exactString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw dynamicError("invalid_call", `${label} must be a non-empty string.`);
	return value;
}

/** Validate the transport correlation, registered namespace, and strict tool arguments once. */
export function validateDynamicCall(
	request: DynamicServerRequest,
	options: Pick<CodexDynamicToolsOptions, "catalogue">,
): ValidatedDynamicCall {
	try {
		exactCatalogue(options.catalogue);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) throw error;
		throw dynamicError(
			"invalid_call",
			"The archboard_app catalogue could not be validated.",
			error,
		);
	}
	if (!isRecord(request) || !hasExactKeys(request, DYNAMIC_REQUEST_KEYS))
		throw dynamicError("invalid_call", "The dynamic request envelope is not exact.");
	if (!isRecord(request.correlation) || !hasExactKeys(request.correlation, WIRE_CORRELATION_KEYS))
		throw dynamicError("invalid_call", "The dynamic wire correlation is not exact.");
	if (
		request.owner !== "codex-dynamic-tools" ||
		request.method !== "item/tool/call" ||
		request.child !== request.correlation.child ||
		request.epoch !== request.correlation.epoch ||
		request.requestId !== request.correlation.requestId
	)
		throw dynamicError("invalid_call", "The dynamic call is not owned by this child epoch.");
	if (!isRecord(request.params) || !hasExactKeys(request.params, DYNAMIC_PARAMS_KEYS))
		throw dynamicError("invalid_call", "The dynamic call parameters contain an unexpected field.");
	if (!isRecord(request.logicalCall) || !hasExactKeys(request.logicalCall, LOGICAL_CALL_KEYS))
		throw dynamicError(
			"invalid_call",
			"The dynamic call correlation contains an unexpected field.",
		);
	if (request.params.namespace !== ARCHBOARD_APP_NAMESPACE.name)
		throw dynamicError("invalid_call", "The dynamic call namespace is not archboard_app.");
	if (request.logicalCall.namespace !== ARCHBOARD_APP_NAMESPACE.name)
		throw dynamicError("invalid_call", "The logical call namespace is not archboard_app.");
	if (request.logicalCall.manifestHash !== ARCHBOARD_APP_MANIFEST_SHA256)
		throw dynamicError("invalid_call", "The dynamic call manifest hash is not the reviewed hash.");
	if (request.logicalCall.tool !== request.params.tool)
		throw dynamicError("invalid_call", "The logical call tool does not match its parameters.");
	for (const [value, label] of [
		[request.child, "child"],
		[request.epoch, "epoch"],
		[request.requestId, "requestId"],
		[request.correlation.child, "correlation child"],
		[request.correlation.epoch, "correlation epoch"],
		[request.correlation.requestId, "correlation requestId"],
		[request.params.threadId, "threadId"],
		[request.params.turnId, "turnId"],
		[request.params.callId, "callId"],
		[request.params.tool, "tool"],
		[request.logicalCall.child, "logical child"],
		[request.logicalCall.epoch, "logical epoch"],
		[request.logicalCall.threadId, "logical threadId"],
		[request.logicalCall.turnId, "logical turnId"],
		[request.logicalCall.callId, "logical callId"],
	] as const)
		exactString(value, label);
	if (
		request.logicalCall.child !== request.child ||
		request.logicalCall.epoch !== request.epoch ||
		request.logicalCall.namespace !== request.params.namespace ||
		request.logicalCall.tool !== request.params.tool
	)
		throw dynamicError("invalid_call", "The dynamic call correlation is not exact.");
	const parsedName = GeneralThreadToolNameSchema.safeParse(request.params.tool);
	if (!parsedName.success)
		throw dynamicError(
			"unsupported",
			`The archboard_app tool ${String(request.params.tool)} is unsupported.`,
		);
	try {
		return Object.freeze({
			name: parsedName.data,
			arguments: parseToolArguments(parsedName.data, request.params.arguments),
		}) as ValidatedDynamicCall;
	} catch (error) {
		throw dynamicError(
			"invalid_call",
			"The dynamic tool arguments failed the reviewed schema.",
			error,
		);
	}
}

function sameProof(
	left: DynamicCallerAuthority["provenance"],
	right: DynamicCallerAuthority["provenance"],
): boolean {
	if (left === null || right === null) return left === right;
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
	record: DynamicCallerAuthority | DynamicTargetAuthority,
	link: ThreadLinkClassification,
	allowInspectOnlyEpoch: boolean,
): void {
	if (link.link.threadId !== record.threadId)
		throw dynamicError("unknown_provenance", "The live thread-link proof names another thread.");
	if (
		link.observation.loaded !== record.loaded ||
		link.observation.canAcceptDirectInput !== record.directInput ||
		link.observation.status !== record.status ||
		!sameSource(link.observation.source, record.source)
	)
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link observation changed during dispatch.",
		);
	if (!sameProof(link.proof, record.provenance))
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link proof is not the durable proof supplied by the authority.",
		);
	if (link.link.state !== "executable" && link.link.state !== "inspect_only")
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link state is not executable or inspect-only.",
		);
	if (
		link.link.state === "executable" &&
		(record.epochState !== "current" || link.proof === null || record.provenance === null)
	)
		throw dynamicError(
			"unknown_provenance",
			"An executable thread-link is missing current durable provenance.",
		);
	if (
		link.link.state === "executable" &&
		(link.link.childId !== record.childId ||
			link.link.epoch !== record.epoch ||
			link.link.source !== record.source ||
			link.link.status !== record.status ||
			!link.link.loaded ||
			!link.link.canAcceptDirectInput)
	)
		throw dynamicError(
			"unknown_provenance",
			"The executable thread-link identity changed during dispatch.",
		);
	if (record.epochState === "current") {
		if (
			record.childId === null ||
			record.epoch === null ||
			link.currentEpoch === null ||
			link.currentEpoch.childId !== record.childId ||
			link.currentEpoch.epoch !== record.epoch
		)
			throw dynamicError("stale_child", "The target is no longer in the current child epoch.");
	}
	if (record.epochState === "prior" && !allowInspectOnlyEpoch)
		throw dynamicError("prior_epoch", "The target belongs to a prior child epoch.");
	if (record.epochState === "unknown" && !allowInspectOnlyEpoch)
		throw dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
}

function assertCallerState(caller: DynamicCallerAuthority): void {
	if (caller.epochState !== "current")
		throw caller.epochState === "prior"
			? dynamicError("prior_epoch", "The dynamic caller belongs to a prior epoch.")
			: dynamicError("stale_child", "The dynamic caller has no current child epoch.");
	if (caller.ownership !== "created")
		throw dynamicError("unknown_provenance", "The dynamic caller was not created by Archboard.");
	if (!isAllowedSource(caller.source))
		throw dynamicError(
			"unknown_provenance",
			"The dynamic caller source is not executable provenance.",
		);
	if (!caller.loaded || caller.status === "notLoaded")
		throw dynamicError("not_loaded", "The dynamic caller is not loaded.");
	if (caller.directInput !== true)
		throw dynamicError("not_controllable", "The dynamic caller cannot accept direct input.");
	if (caller.status !== "active")
		throw caller.status === "systemError"
			? dynamicError("system_error", "The dynamic caller is in a system error state.")
			: dynamicError("invalid_call", "The dynamic caller is not executing an active turn.");
	if (caller.provenance === null)
		throw dynamicError("unknown_provenance", "The dynamic caller has no durable execution proof.");
}

function assertAuthorityShape(
	authority: DynamicCallerAuthority | DynamicTargetAuthority,
	role: "caller" | "target",
): void {
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
	)
		throw dynamicError("invalid_call", `The ${role} authority returned an invalid identity shape.`);
}

export async function resolveCaller(
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
	)
		throw dynamicError("invalid_call", "The caller authority returned an invalid turn identity.");
	if (
		caller.role !== "caller" ||
		!caller.executing ||
		caller.threadId !== request.logicalCall.threadId ||
		caller.turnId !== request.logicalCall.turnId ||
		caller.wireThreadId !== request.params.threadId ||
		caller.wireTurnId !== request.params.turnId ||
		caller.childId !== request.child ||
		caller.epoch !== request.epoch
	)
		throw dynamicError("invalid_call", "The logical caller is not the executing dynamic call.");
	assertCallerState(caller);
	const link = await linkFor(caller, options.threadLink);
	linkEvidenceMatches(caller, link, false);
	if (link.link.state !== "executable" || !link.link.canAcceptDirectInput)
		throw dynamicError("not_controllable", "The dynamic caller thread-link is not executable.");
	return Object.freeze({ ...caller, linkClassification: link });
}

export async function resolveTarget(
	caller: DynamicCallerAuthority,
	threadId: unknown,
	options: Pick<CodexDynamicToolsOptions, "threadAuthority" | "threadLink">,
	observed?: DynamicObservedTarget,
): Promise<DynamicTargetAuthority> {
	let target: DynamicTargetAuthority;
	try {
		target = await options.threadAuthority.classifyExactTarget({ caller, threadId, observed });
	} catch (error) {
		throw authorityError(error, "The dynamic call target could not be classified.");
	}
	assertAuthorityShape(target, "target");
	if (
		target.role !== "target" ||
		typeof target.wireThreadId !== "string" ||
		target.wireThreadId.length === 0
	)
		throw dynamicError("invalid_call", "The target authority returned an invalid thread identity.");
	if (target.wireThreadId !== threadId && target.threadId !== threadId)
		throw dynamicError("invalid_call", "The target authority returned a different ThreadId.");
	const link = await linkFor(target, options.threadLink);
	linkEvidenceMatches(target, link, true);
	if (
		target.epochState === "current" &&
		(target.childId !== caller.childId || target.epoch !== caller.epoch)
	)
		throw dynamicError("stale_child", "The target is not in the caller's current child epoch.");
	return Object.freeze({ ...target, linkClassification: link });
}

export async function revalidateCaller(
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
	)
		throw dynamicError("invalid_call", "The caller authority returned an invalid turn identity.");
	if (fresh.authority !== caller.authority)
		throw dynamicError("invalid_call", "The caller authority token changed during revalidation.");
	if (
		fresh.role !== "caller" ||
		fresh.threadId !== caller.threadId ||
		fresh.turnId !== caller.turnId ||
		fresh.wireThreadId !== caller.wireThreadId ||
		fresh.wireTurnId !== caller.wireTurnId ||
		fresh.childId !== caller.childId ||
		fresh.epoch !== caller.epoch ||
		!fresh.executing
	)
		throw dynamicError("invalid_call", "The logical caller changed during revalidation.");
	assertCallerState(fresh);
	const link = await linkFor(fresh, options.threadLink, false);
	linkEvidenceMatches(fresh, link, false);
	if (link.link.state !== "executable" || !link.link.canAcceptDirectInput)
		throw dynamicError("not_controllable", "The caller thread-link is no longer executable.");
	return Object.freeze({ ...fresh, linkClassification: link });
}

export async function revalidateTarget(
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
	if (fresh.authority !== target.authority)
		throw dynamicError("invalid_call", "The target authority token changed during revalidation.");
	if (
		fresh.threadId !== target.threadId ||
		fresh.wireThreadId !== target.wireThreadId ||
		fresh.role !== "target"
	)
		throw dynamicError("invalid_call", "The target identity changed during revalidation.");
	const link = await linkFor(fresh, options.threadLink, false);
	linkEvidenceMatches(fresh, link, false);
	return Object.freeze({ ...fresh, linkClassification: link });
}

async function linkFor(
	record: DynamicCallerAuthority | DynamicTargetAuthority,
	threadLink: Pick<CodexDynamicToolsOptions["threadLink"], "classify">,
	useEmbedded = true,
): Promise<ThreadLinkClassification> {
	if (useEmbedded && record.linkClassification !== undefined) return record.linkClassification;
	try {
		return await threadLink.classify(record.threadLinkTarget);
	} catch (error) {
		throw authorityError(error, "The live thread-link authority could not classify the target.");
	}
}

function authorityError(error: unknown, message: string): CodexDynamicToolsError {
	const code = errorCode(error);
	if (code === "stale_child" || code === "prior_epoch" || code === "unknown_provenance")
		return dynamicError(code, message, error);
	if (code === "not_loaded" || code === "not_controllable" || code === "system_error")
		return dynamicError(code, message, error);
	return dynamicError("unknown_provenance", message, error);
}

function lifecycleError(error: unknown, message: string): CodexDynamicToolsError {
	const code = errorCode(error);
	if (code === "stale_child" || code === "prior_epoch" || code === "unknown_provenance")
		return dynamicError(code, message, error);
	return dynamicError("invalid_call", message, error);
}

function errorCode(error: unknown): DynamicRefusalReason | undefined {
	if (isRecord(error) && typeof error.code === "string") {
		const code = error.code;
		if (
			code === "stale_child" ||
			code === "prior_epoch" ||
			code === "unknown_provenance" ||
			code === "not_loaded" ||
			code === "not_controllable" ||
			code === "system_error"
		)
			return code;
	}
	return undefined;
}

function statusAllowed(status: DynamicStatus): boolean {
	return isCodexThreadStatusType(status);
}

function stateFailure(state: DynamicEpochState): CodexDynamicToolsError | null {
	if (state === "prior") return dynamicError("prior_epoch", "The target belongs to a prior epoch.");
	if (state === "unknown")
		return dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
	return null;
}

/** Apply the literal target matrix; no caller focus or recency facts enter this function. */
export function assertMutationTargetAllowed(
	tool: DynamicMutationToolName,
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority,
): DynamicRelation {
	if (!statusAllowed(target.status))
		throw dynamicError("invalid_call", "The target status is not in the reviewed target table.");
	const stale = stateFailure(target.epochState);
	if (stale) throw stale;
	if (target.childId !== caller.childId || target.epoch !== caller.epoch)
		throw dynamicError("stale_child", "The target is not in the caller's current child epoch.");
	if (target.ownership === "foreign")
		throw dynamicError(
			"unknown_provenance",
			"Foreign thread provenance cannot receive a mutation.",
		);
	if (target.ownership !== "created" && target.ownership !== "attached")
		throw dynamicError("unknown_provenance", "The target ownership is not proven.");
	if (!target.loaded || target.status === "notLoaded")
		throw dynamicError("not_loaded", "The target is not loaded.");
	if (target.status === "systemError")
		throw dynamicError("system_error", "The target is in a system error state.");
	if (target.directInput !== true)
		throw dynamicError("not_controllable", "The target cannot accept direct input.");
	if (!isAllowedSource(target.source))
		throw dynamicError("unknown_provenance", "The target source is not executable provenance.");
	if (
		target.linkClassification?.link.state !== undefined &&
		target.linkClassification.link.state !== "executable"
	)
		throw dynamicError("unknown_provenance", "The target thread-link is not executable.");
	const relation: DynamicRelation = target.threadId === caller.threadId ? "self" : "other";
	if (tool === "send_message_to_thread" && relation === "self")
		throw dynamicError("cycle", "A dynamic caller cannot send a message to itself.");
	if (tool === "fork_thread" && target.status === "active" && relation !== "self")
		throw dynamicError("busy", "The non-self fork target is already active.");
	if (tool === "fork_thread" && relation === "self" && target.status !== "active")
		throw dynamicError(
			"cycle",
			"A self-fork is allowed only at the executing active turn boundary.",
		);
	if (tool === "send_message_to_thread" && target.status !== "idle") {
		throw dynamicError("busy", "The target is not idle.");
	}
	if (tool === "fork_thread" && target.status === "active" && relation === "self") return relation;
	return relation;
}

export function assertWaitTargetAllowed(
	caller: DynamicCallerAuthority,
	target: DynamicTargetAuthority,
): DynamicRelation {
	const stale = stateFailure(target.epochState);
	if (stale) throw stale;
	if (target.childId !== caller.childId || target.epoch !== caller.epoch)
		throw dynamicError(
			"stale_child",
			"The wait target is not in the caller's current child epoch.",
		);
	if (target.ownership !== "created" && target.ownership !== "attached")
		throw dynamicError("unknown_provenance", "The wait target ownership is not proven.");
	if (!target.loaded || target.status === "notLoaded")
		throw dynamicError("not_loaded", "The wait target is not loaded.");
	if (target.status !== "active" && target.status !== "idle" && target.status !== "systemError")
		throw dynamicError("not_ready", "The wait target is not in a waitable state.");
	const relation: DynamicRelation = target.threadId === caller.threadId ? "self" : "other";
	if (relation === "self") throw dynamicError("cycle", "A dynamic caller cannot wait on itself.");
	return relation;
}

function isAllowedSource(value: DynamicCallerAuthority["source"]): boolean {
	return value === "cli" || value === "vscode" || value === "exec" || value === "appServer";
}

export function asDynamicMutationTool(name: DynamicToolName): DynamicMutationToolName | null {
	return name === "create_thread" || name === "fork_thread" || name === "send_message_to_thread"
		? name
		: null;
}

export function dynamicErrorForResponse(
	error: unknown,
	defaultCode: DynamicRefusalReason = "invalid_call",
): CodexDynamicToolsError {
	if (error instanceof CodexDynamicToolsError) return error;
	return new CodexDynamicToolsError(
		defaultCode,
		error instanceof Error ? error.message : String(error),
		error,
	);
}

export function isDynamicToolName(value: unknown): value is DynamicToolName {
	return GeneralThreadToolNameSchema.safeParse(value).success;
}

export function isDynamicServerRequest(value: unknown): value is DynamicServerRequest {
	return (
		isRecord(value) && value.method === "item/tool/call" && value.owner === "codex-dynamic-tools"
	);
}
