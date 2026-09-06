import { GeneralThreadToolNameSchema } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import { isCodexThreadStatusType } from "@/shared/codex-app-server-contract";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/contract";
import type {
	DynamicCallerAuthority,
	DynamicEpochState,
	DynamicMutationToolName,
	DynamicRefusalReason,
	DynamicRelation,
	DynamicStatus,
	DynamicTargetAuthority,
	DynamicToolName,
} from "@/runtime/codex-dynamic-tools/lib/contract";

type PolicyAuthorityView<Authority extends DynamicCallerAuthority | DynamicTargetAuthority> =
	Readonly<Omit<Authority, "linkClassification" | "threadLinkTarget">> & {
		readonly linkClassification?: Readonly<
			Pick<NonNullable<Authority["linkClassification"]>, "link">
		>;
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

function statusAllowed(status: DynamicStatus): boolean {
	return isCodexThreadStatusType(status);
}

function stateFailure(state: DynamicEpochState): CodexDynamicToolsError | null {
	if (state === "prior") {
		return dynamicError("prior_epoch", "The target belongs to a prior epoch.");
	}
	if (state === "unknown") {
		return dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
	}
	return null;
}

function isAllowedSource(value: unknown): boolean {
	return value === "cli" || value === "vscode" || value === "exec" || value === "appServer";
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
	caller: PolicyAuthorityView<DynamicCallerAuthority>,
	target: PolicyAuthorityView<DynamicTargetAuthority>,
): DynamicRelation {
	if (!statusAllowed(target.status)) {
		throw dynamicError("invalid_call", "The target status is not in the reviewed target table.");
	}
	const stale = stateFailure(target.epochState);
	if (stale !== null) {
		throw stale;
	}
	if (target.childId !== caller.childId || target.epoch !== caller.epoch) {
		throw dynamicError("stale_child", "The target is not in the caller's current child epoch.");
	}
	if (target.ownership === "foreign") {
		throw dynamicError(
			"unknown_provenance",
			"Foreign thread provenance cannot receive a mutation.",
		);
	}
	if (target.ownership !== "created" && target.ownership !== "attached") {
		throw dynamicError("unknown_provenance", "The target ownership is not proven.");
	}
	if (!target.loaded || target.status === "notLoaded") {
		throw dynamicError("not_loaded", "The target is not loaded.");
	}
	if (target.status === "systemError") {
		throw dynamicError("system_error", "The target is in a system error state.");
	}
	if (target.directInput !== true) {
		throw dynamicError("not_controllable", "The target cannot accept direct input.");
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
	const relation: DynamicRelation = target.threadId === caller.threadId ? "self" : "other";
	if (tool === "send_message_to_thread" && relation === "self") {
		throw dynamicError("cycle", "A dynamic caller cannot send a message to itself.");
	}
	if (tool === "fork_thread" && target.status === "active" && relation !== "self") {
		throw dynamicError("busy", "The non-self fork target is already active.");
	}
	if (tool === "fork_thread" && relation === "self" && target.status !== "active") {
		throw dynamicError(
			"cycle",
			"A self-fork is allowed only at the executing active turn boundary.",
		);
	}
	if (tool === "send_message_to_thread" && target.status !== "idle") {
		throw dynamicError("busy", "The target is not idle.");
	}
	return relation;
}

function assertWaitTargetAllowed(
	caller: PolicyAuthorityView<DynamicCallerAuthority>,
	target: PolicyAuthorityView<DynamicTargetAuthority>,
): DynamicRelation {
	const stale = stateFailure(target.epochState);
	if (stale !== null) {
		throw stale;
	}
	if (target.childId !== caller.childId || target.epoch !== caller.epoch) {
		throw dynamicError(
			"stale_child",
			"The wait target is not in the caller's current child epoch.",
		);
	}
	if (target.ownership !== "created" && target.ownership !== "attached") {
		throw dynamicError("unknown_provenance", "The wait target ownership is not proven.");
	}
	if (!target.loaded || target.status === "notLoaded") {
		throw dynamicError("not_loaded", "The wait target is not loaded.");
	}
	if (target.status !== "active" && target.status !== "idle" && target.status !== "systemError") {
		throw dynamicError("not_ready", "The wait target is not in a waitable state.");
	}
	const relation: DynamicRelation = target.threadId === caller.threadId ? "self" : "other";
	if (relation === "self") {
		throw dynamicError("cycle", "A dynamic caller cannot wait on itself.");
	}
	return relation;
}

function asDynamicMutationTool(name: DynamicToolName): DynamicMutationToolName | null {
	return name === "create_thread" || name === "fork_thread" || name === "send_message_to_thread"
		? name
		: null;
}

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

function isDynamicToolName(value: unknown): value is DynamicToolName {
	return GeneralThreadToolNameSchema.safeParse(value).success;
}

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
