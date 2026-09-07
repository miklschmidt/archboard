import { GeneralThreadToolNameSchema } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/errors";
import type {
	DynamicCallerAuthority,
	DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	isDynamicStatus,
	type DynamicEpochState,
	type DynamicMutationToolName,
	type DynamicRefusalReason,
	type DynamicRelation,
	type DynamicStatus,
	type DynamicToolName,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import { isRecord } from "@/runtime/codex-dynamic-tools/lib/value-shape";

type PolicyAuthorityView<Authority extends DynamicCallerAuthority | DynamicTargetAuthority> =
	Readonly<Omit<Authority, "linkClassification" | "threadLinkTarget">> & {
		readonly linkClassification?: Readonly<
			Pick<NonNullable<Authority["linkClassification"]>, "link">
		>;
	};
type CallerView = PolicyAuthorityView<DynamicCallerAuthority>;
type TargetView = PolicyAuthorityView<DynamicTargetAuthority>;

/**
 * Build a refusal for the policy matrix.
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
 * Map a non-current epoch state to its refusal.
 * @param state Epoch state of the target.
 * @returns The refusal, or null when the target is in the current epoch.
 */
function stateFailure(state: DynamicEpochState): CodexDynamicToolsError | null {
	if (state === "prior") {
		return dynamicError("prior_epoch", "The target belongs to a prior epoch.");
	}
	if (state === "unknown") {
		return dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
	}
	return null;
}

/**
 * Whether a thread source is one Archboard may execute against: the reviewed
 * source kinds, never a custom or sub-agent source.
 * @param value Thread source of unknown shape.
 * @returns Whether the source is executable provenance.
 */
function isAllowedSource(value: unknown): boolean {
	return value === "cli" || value === "vscode" || value === "exec" || value === "appServer";
}

/**
 * Refuse a target outside the caller's current child epoch.
 * @param caller Current proven logical caller.
 * @param target Current classified target.
 * @param message Refusal message when the child epoch differs.
 */
function assertTargetInCallerEpoch(caller: CallerView, target: TargetView, message: string): void {
	const stale = stateFailure(target.epochState);
	if (stale !== null) {
		throw stale;
	}
	if (target.childId !== caller.childId || target.epoch !== caller.epoch) {
		throw dynamicError("stale_child", message);
	}
}

/**
 * Refuse a mutation target whose provenance is not proven executable: foreign
 * ownership, a non-executable source, or a non-executable thread-link.
 * @param target Current classified target.
 */
function assertTargetProvenance(target: TargetView): void {
	if (target.ownership === "foreign") {
		throw dynamicError("unknown_provenance", "Foreign thread provenance cannot receive a mutation.");
	}
	if (!isAllowedSource(target.source)) {
		throw dynamicError("unknown_provenance", "The target source is not executable provenance.");
	}
	if (
		target.linkClassification?.link.state !== undefined &&
		target.linkClassification.link.state !== "executable"
	) {
		throw dynamicError("unknown_provenance", "The target thread-link is not executable.");
	}
}

/**
 * Refuse a mutation target that is not loaded, in system error, or unable to
 * accept direct input.
 * @param target Current classified target.
 */
function assertTargetControllable(target: TargetView): void {
	if (!target.loaded || target.status === "notLoaded") {
		throw dynamicError("not_loaded", "The target is not loaded.");
	}
	if (target.status === "systemError") {
		throw dynamicError("system_error", "The target is in a system error state.");
	}
	if (target.directInput !== true) {
		throw dynamicError("not_controllable", "The target cannot accept direct input.");
	}
}

/**
 * Whether caller and target name the same thread.
 * @param caller Current proven logical caller.
 * @param target Current classified target.
 * @returns The self/other relation.
 */
function relationOf(caller: CallerView, target: TargetView): DynamicRelation {
	return target.threadId === caller.threadId ? "self" : "other";
}

/**
 * Apply the send rules: a caller never messages itself, and only an idle
 * target may receive a message.
 * @param relation Relation between caller and target.
 * @param status Target thread status.
 */
function assertSendRelation(relation: DynamicRelation, status: DynamicStatus): void {
	if (relation === "self") {
		throw dynamicError("cycle", "A dynamic caller cannot send a message to itself.");
	}
	if (status !== "idle") {
		throw dynamicError("busy", "The target is not idle.");
	}
}

/**
 * Apply the fork rules: another active thread is busy, and a self-fork is
 * allowed only at the executing active turn boundary.
 * @param relation Relation between caller and target.
 * @param status Target thread status.
 */
function assertForkRelation(relation: DynamicRelation, status: DynamicStatus): void {
	if (status === "active" && relation !== "self") {
		throw dynamicError("busy", "The non-self fork target is already active.");
	}
	if (relation === "self" && status !== "active") {
		throw dynamicError("cycle", "A self-fork is allowed only at the executing active turn boundary.");
	}
}

/**
 * Apply the literal target matrix; no caller focus or recency facts enter this function.
 * @param tool Mutation tool whose relation rules must be enforced.
 * @param caller Current proven logical caller.
 * @param target Current classified target.
 * @returns Whether caller and target name the same thread.
 */
function assertMutationTargetAllowed(
	tool: DynamicMutationToolName,
	caller: CallerView,
	target: TargetView,
): DynamicRelation {
	if (!isDynamicStatus(target.status)) {
		throw dynamicError("invalid_call", "The target status is not in the reviewed target table.");
	}
	assertTargetInCallerEpoch(caller, target, "The target is not in the caller's current child epoch.");
	assertTargetProvenance(target);
	assertTargetControllable(target);
	const relation = relationOf(caller, target);
	if (tool === "send_message_to_thread") {
		assertSendRelation(relation, target.status);
	} else if (tool === "fork_thread") {
		assertForkRelation(relation, target.status);
	}
	return relation;
}

/**
 * Apply the wait matrix: the target must be in the caller's epoch with proven
 * ownership, loaded, and not the caller itself.
 * @param caller Current proven logical caller.
 * @param target Current classified target.
 * @returns The self/other relation, always "other" on success.
 */
function assertWaitTargetAllowed(caller: CallerView, target: TargetView): DynamicRelation {
	assertTargetInCallerEpoch(
		caller,
		target,
		"The wait target is not in the caller's current child epoch.",
	);
	if (target.ownership !== "created" && target.ownership !== "attached") {
		throw dynamicError("unknown_provenance", "The wait target ownership is not proven.");
	}
	if (!target.loaded || target.status === "notLoaded") {
		throw dynamicError("not_loaded", "The wait target is not loaded.");
	}
	const relation = relationOf(caller, target);
	if (relation === "self") {
		throw dynamicError("cycle", "A dynamic caller cannot wait on itself.");
	}
	return relation;
}

/**
 * Narrow a tool name to a mutation tool.
 * @param name Any dynamic tool name.
 * @returns The mutation tool name, or null for a read or wait tool.
 */
function asDynamicMutationTool(name: DynamicToolName): DynamicMutationToolName | null {
	return name === "create_thread" || name === "fork_thread" || name === "send_message_to_thread"
		? name
		: null;
}

/**
 * Coerce any thrown value into a dynamic-tools error so a response can name
 * its refusal code.
 * @param error Thrown value.
 * @param defaultCode Code used when the value is not already a dynamic error.
 * @returns The dynamic-tools error.
 */
function dynamicErrorForResponse(
	error: unknown,
	defaultCode: DynamicRefusalReason = "invalid_call",
): CodexDynamicToolsError {
	if (error instanceof CodexDynamicToolsError) {
		return error;
	}
	return new CodexDynamicToolsError(
		defaultCode,
		error instanceof Error ? error.message : String(error),
		error,
	);
}

/**
 * Whether a value names one of the reviewed dynamic tools.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a dynamic tool name.
 */
function isDynamicToolName(value: unknown): value is DynamicToolName {
	return GeneralThreadToolNameSchema.safeParse(value).success;
}

/**
 * Whether a reverse request is a dynamic tool call owned by this module.
 * @param value Reverse request of unknown shape.
 * @returns Whether the request is a dynamic tool call.
 */
function isDynamicServerRequest(value: unknown): value is DynamicServerRequest {
	return (
		isRecord(value) &&
		value["method"] === "item/tool/call" &&
		value["owner"] === "codex-dynamic-tools"
	);
}

export {
	asDynamicMutationTool,
	assertMutationTargetAllowed,
	assertWaitTargetAllowed,
	dynamicErrorForResponse,
	isAllowedSource,
	isDynamicServerRequest,
	isDynamicToolName,
};
