import type { GeneralThreadToolName } from "@/runtime/codex-thread-tools";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import {
	CodexDynamicToolsError,
	type CodexDynamicToolsOptions,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicDispatchErrorCode,
	type DynamicImmutableEffect,
	type DynamicMutationToolName,
	type DynamicRefusalReason,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	encodeDynamicCursor,
	unwrapDynamicCursor,
} from "@/runtime/codex-dynamic-tools/lib/cursors";

/** The longest refusal message a dynamic response carries. */
const FAILURE_MESSAGE_MAX_UTF8_BYTES = 512;

/** The fields a pane-link authority carries. */
const CONTEXT_AUTHORITY_KEYS = [
	"token",
	"paneId",
	"childId",
	"epoch",
	"threadId",
	"turnId",
] as const;

/** The refusal codes an authority port may raise that the boundary passes through as its own. */
const PASSTHROUGH_CODES = [
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"not_loaded",
	"not_controllable",
	"system_error",
] as const satisfies readonly DynamicDispatchErrorCode[];

/**
 * Whether a tool name is one of the three that mutate.
 * @param value The tool name.
 * @returns Whether it mutates.
 */
function isMutationToolName(value: GeneralThreadToolName): value is DynamicMutationToolName {
	return value === "create_thread" || value === "fork_thread" || value === "send_message_to_thread";
}

/**
 * Whether a value is a plain object, which is the only shape the dispatcher reads.
 * @param value Untrusted value.
 * @returns Whether the value is a plain object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The current time, refusing a host clock that does not read as one, because every approval
 * deadline is measured against it.
 * @param options The dynamic tools options.
 * @returns The current time.
 */
function nowOf(options: CodexDynamicToolsOptions): number {
	const now = options.now?.() ?? Date.now();
	if (!Number.isSafeInteger(now) || now < 0) {
		throw new CodexDynamicToolsError(
			"system_error",
			"The host clock returned an invalid timestamp.",
		);
	}
	return now;
}

/**
 * Freeze a request and the parts of it the dispatcher reads, so nothing can change under an
 * approval between the request being described and the effect being carried out.
 * @param request The server request.
 * @returns The frozen request.
 */
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

/**
 * Whether a pane-link authority carries exactly its own fields, each a nonempty string.
 * @param authority What the context port returned.
 * @returns Whether the shape reads.
 */
function contextAuthorityShaped(authority: Readonly<Record<string, unknown>>): boolean {
	const named = Reflect.ownKeys(authority).every(
		(key) => typeof key === "string" && CONTEXT_AUTHORITY_KEYS.some((known) => known === key),
	);
	if (!named) {
		return false;
	}
	return CONTEXT_AUTHORITY_KEYS.every((key) => {
		const value = authority[key];
		return typeof value === "string" && value.length > 0;
	});
}

/**
 * Whether a pane-link authority names the caller that is executing right now.
 * @param authority The authority.
 * @param caller The caller's authority.
 * @returns Whether the two agree.
 */
function contextAuthorityMatchesCaller(
	authority: DynamicContextAuthority,
	caller: DynamicCallerAuthority,
): boolean {
	if (authority.childId !== caller.childId || authority.epoch !== caller.epoch) {
		return false;
	}
	return authority.threadId === caller.threadId && authority.turnId === caller.turnId;
}

/**
 * Refuse a pane-link authority that is not the executing caller's own. The authority is read
 * through its own fields rather than through the shape the contract type claims, so a context
 * port that returns something else is refused rather than believed.
 * @param authority What the context port returned.
 * @param caller The caller's authority.
 * @returns The authority, frozen.
 */
function assertContextAuthority(
	authority: DynamicContextAuthority,
	caller: DynamicCallerAuthority,
): DynamicContextAuthority {
	const fields: unknown = authority;
	const shaped = isRecord(fields) && contextAuthorityShaped(fields);
	if (!shaped || !contextAuthorityMatchesCaller(authority, caller)) {
		throw new CodexDynamicToolsError(
			"unknown_provenance",
			"The pane-link authority does not match the executing caller.",
		);
	}
	return Object.freeze({ ...authority });
}

/**
 * The refusal code an authority port raised, when it raised one the boundary passes through.
 * @param error What the port threw.
 * @returns The code, or null.
 */
function passthroughCode(error: unknown): DynamicDispatchErrorCode | null {
	if (!isRecord(error) || typeof error["code"] !== "string") {
		return null;
	}
	const code = error["code"];
	return PASSTHROUGH_CODES.find((known) => known === code) ?? null;
}

/**
 * Refuse a call that is no longer the one executing, passing an authority port's own refusal
 * code through so a caller is told why rather than only that it was refused.
 * @param options The dynamic tools options.
 * @param request The server request.
 * @param caller The caller's authority.
 * @param phase Whether this is before or after the approval.
 */
async function assertCallExecuting(
	options: CodexDynamicToolsOptions,
	request: DynamicServerRequest,
	caller: DynamicCallerAuthority,
	phase: "before_approval" | "after_approval",
): Promise<void> {
	try {
		await options.lifecycle.assertCallExecuting({ request, caller, phase });
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw new CodexDynamicToolsError(
			passthroughCode(error) ?? "invalid_call",
			"The logical dynamic call is no longer executing.",
			error,
		);
	}
}

/**
 * The refusal a turn-boundary authority's failure becomes, keeping its own code when it raised
 * one the boundary passes through.
 * @param error What the authority threw.
 * @param message Human-readable explanation.
 * @returns The refusal error.
 */
function boundaryAuthorityError(error: unknown, message: string): CodexDynamicToolsError {
	if (error instanceof CodexDynamicToolsError) {
		return error;
	}
	return new CodexDynamicToolsError(passthroughCode(error) ?? "invalid_call", message, error);
}

/**
 * One mutation's arguments as the effect layer takes them, read straight off the validated
 * call. The effect layer is what refuses anything that does not read; this only names the
 * fields each tool takes.
 * @param name The mutation tool.
 * @param argumentsValue The validated arguments.
 * @returns The effect arguments.
 */
function effectArguments(
	name: DynamicMutationToolName,
	argumentsValue: Readonly<Record<string, unknown>>,
): DynamicImmutableEffect["arguments"] {
	if (name === "create_thread") {
		return { prompt: String(argumentsValue["prompt"]) };
	}
	if (name === "send_message_to_thread") {
		return {
			threadId: String(argumentsValue["threadId"]),
			prompt: String(argumentsValue["prompt"]),
		};
	}
	return {
		threadId: String(argumentsValue["threadId"]),
		beforeTurnId:
			typeof argumentsValue["beforeTurnId"] === "string" ? argumentsValue["beforeTurnId"] : null,
		prompt: typeof argumentsValue["prompt"] === "string" ? argumentsValue["prompt"] : null,
	};
}

/**
 * The refusal reason a dispatch failure is reported under. The two codes that describe delivery
 * rather than the call itself are reported as system errors, because that is what they are to
 * the caller.
 * @param code The failure code.
 * @returns The refusal reason.
 */
function refusalReasonForResponse(code: DynamicDispatchErrorCode): DynamicRefusalReason {
	return code === "not_delivered" || code === "outcome_unknown" ? "system_error" : code;
}

/**
 * A refusal message bounded to what a response carries, with something to say when the failure
 * had no message of its own.
 * @param value The message.
 * @returns The bounded message.
 */
function boundedFailureMessage(value: string): string {
	const normalized = value.trim() || "The dynamic call was refused.";
	if (Buffer.byteLength(normalized, "utf8") <= FAILURE_MESSAGE_MAX_UTF8_BYTES) {
		return normalized;
	}
	const ellipsis = "…";
	const budget = FAILURE_MESSAGE_MAX_UTF8_BYTES - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of normalized) {
		if (Buffer.byteLength(result + character, "utf8") > budget) {
			break;
		}
		result += character;
	}
	return `${result}${ellipsis}`;
}

/**
 * The authority cursor an opaque page cursor carries, bound to the child, epoch and query it
 * was issued for so it cannot be replayed against a different listing.
 * @param cursor The opaque cursor.
 * @param caller The caller's authority.
 * @param method The listing it belongs to.
 * @param direction Which way the listing runs.
 * @param query What the listing was read with.
 * @returns The authority cursor, or null.
 */
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

/**
 * An authority cursor as the opaque cursor a caller resumes with.
 * @param cursor The authority cursor.
 * @param caller The caller's authority.
 * @param method The listing it belongs to.
 * @param direction Which way the listing runs.
 * @param query What the listing was read with.
 * @returns The opaque cursor, or null when the listing is exhausted.
 */
function wrapPageCursor(
	cursor: string | null,
	caller: DynamicCallerAuthority,
	method: string,
	direction: "asc" | "desc",
	query: unknown,
): string | null {
	if (cursor === null) {
		return null;
	}
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

export {
	assertCallExecuting,
	assertContextAuthority,
	boundaryAuthorityError,
	boundedFailureMessage,
	effectArguments,
	freezeDynamicRequest,
	isMutationToolName,
	isRecord,
	nowOf,
	refusalReasonForResponse,
	unwrapPageCursor,
	wrapPageCursor,
};
