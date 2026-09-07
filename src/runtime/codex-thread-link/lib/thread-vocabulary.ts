import { ADDITIONAL_CONTEXT_POLICY } from "@/runtime/codex-instructions";
import type { SessionThread } from "@/runtime/codex-session";
import { CODEX_THREAD_STATUS_TYPES } from "@/shared/codex-app-server-contract";
import {
	CodexThreadLinkError,
	type ThreadLinkAllowedSource,
	type ThreadLinkCondition,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkExecutableStatus,
	type ThreadLinkReason,
	type ThreadLinkSource,
	type ThreadLinkStatus,
} from "@/runtime/codex-thread-link/lib/contract";

const ALLOWED_SOURCES = Object.freeze([
	"cli",
	"vscode",
	"exec",
	"appServer",
] satisfies readonly ThreadLinkAllowedSource[]);
const ALLOWED_SOURCE_SET = new Set<string>(ALLOWED_SOURCES);
const STATUS_VALUES = new Set<string>(CODEX_THREAD_STATUS_TYPES);
const NON_EXECUTABLE_STATUS_SET = new Set<string>(
	ADDITIONAL_CONTEXT_POLICY.threadLink.nonExecutableStatuses,
);
const REASON_PRECEDENCE = ADDITIONAL_CONTEXT_POLICY.threadLink.reasonPrecedence;

/**
 * Refuses to load when the authored policy no longer matches what this classifier
 * implements: unique conditions and reasons, and systemError as the only non-executable status.
 */
function assertPolicyConformance(): void {
	const conditions = new Set(REASON_PRECEDENCE.map(({ condition }) => condition));
	const reasons = new Set(REASON_PRECEDENCE.map(({ reason }) => reason));
	if (
		conditions.size !== REASON_PRECEDENCE.length ||
		reasons.size !== REASON_PRECEDENCE.length ||
		NON_EXECUTABLE_STATUS_SET.size !== 1 ||
		!NON_EXECUTABLE_STATUS_SET.has("systemError") ||
		[...NON_EXECUTABLE_STATUS_SET].some((status) => !STATUS_VALUES.has(status))
	) {
		throw new Error(
			"additional-context thread-link policy has drifted from its classifier contract",
		);
	}
}

assertPolicyConformance();

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether a value is a string with at least one character.
 * @param value The value.
 * @returns True for a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

/**
 * The authored reason the policy assigns to a refusal condition.
 * @param condition The refusal condition.
 * @returns The reason code the additional-context policy publishes for it.
 */
function authoredReason(condition: ThreadLinkCondition): ThreadLinkReason {
	const entry = REASON_PRECEDENCE.find((candidate) => candidate.condition === condition);
	if (entry === undefined) {
		throw new Error(`additional-context policy is missing condition ${condition}`);
	}
	return entry.reason;
}

/**
 * The invalid-result error for a malformed session answer.
 * @param message What was malformed.
 * @param cause The underlying failure, if any.
 * @returns The error.
 */
function invalidResult(message: string, cause?: unknown): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_result", message, cause);
}

/**
 * Whether a value names a child and epoch.
 * @param value The value.
 * @returns True when both identities are non-empty strings.
 */
function isCurrentEpoch(value: unknown): value is ThreadLinkCurrentEpoch {
	return isRecord(value) && isNonEmptyString(value["childId"]) && isNonEmptyString(value["epoch"]);
}

/**
 * Whether a source is one a pane may execute against.
 * @param value The source.
 * @returns True for the allowed top-level sources.
 */
function isAllowedThreadLinkSource(value: unknown): value is ThreadLinkAllowedSource {
	return typeof value === "string" && ALLOWED_SOURCE_SET.has(value);
}

/**
 * The sources a pane may execute against, in listing order.
 * @returns The allowed sources.
 */
function allowedThreadLinkSources(): readonly ThreadLinkAllowedSource[] {
	return ALLOWED_SOURCES;
}

/**
 * Whether a value is any source the contract can describe, including custom and sub-agent forms.
 * @param value The source.
 * @returns True for a recognised source.
 */
function isThreadLinkSource(value: unknown): value is ThreadLinkSource {
	if (typeof value === "string") {
		return isAllowedThreadLinkSource(value) || value === "unknown";
	}
	if (!isRecord(value)) {
		return false;
	}
	return Object.hasOwn(value, "custom") || Object.hasOwn(value, "subAgent");
}

/**
 * A thread's source, or "unknown" when the session returned something unrecognised.
 * @param thread The session thread.
 * @returns The source.
 */
function sourceOf(thread: SessionThread): ThreadLinkSource {
	const source: unknown = thread.source;
	return isThreadLinkSource(source) ? source : "unknown";
}

/**
 * Whether a value is a status the contract publishes.
 * @param value The status.
 * @returns True for a known status type.
 */
function isThreadLinkStatus(value: unknown): value is ThreadLinkStatus {
	return typeof value === "string" && STATUS_VALUES.has(value);
}

/**
 * Whether a status allows execution: known, loaded, and not a system error.
 * @param value The status.
 * @returns True for an executable status.
 */
function isExecutableThreadLinkStatus(value: unknown): value is ThreadLinkExecutableStatus {
	return (
		isThreadLinkStatus(value) && value !== "notLoaded" && !NON_EXECUTABLE_STATUS_SET.has(value)
	);
}

/**
 * A thread's status type, refusing a row whose status the contract does not know.
 * @param thread The session thread.
 * @returns The status type.
 */
function statusOf(thread: SessionThread): ThreadLinkStatus {
	const status: unknown = thread.status;
	if (!isRecord(status) || !isThreadLinkStatus(status["type"])) {
		throw invalidResult("thread/list returned a row with an invalid thread status.");
	}
	return status["type"];
}

/**
 * The direct-input capability a thread row observed, or null when it was absent.
 * @param thread The session thread.
 * @returns The capability as observed.
 */
function observedDirectInput(thread: SessionThread): boolean | null {
	const capability: unknown = thread.canAcceptDirectInput;
	if (capability === true) {
		return true;
	}
	return capability === false ? false : null;
}

/**
 * The refusal a source earns, if any.
 * @param source The source.
 * @returns The reason for custom, sub-agent and unknown sources; null for allowed ones.
 */
function sourceReason(source: ThreadLinkSource): ThreadLinkReason | null {
	if (typeof source === "object") {
		if (Object.hasOwn(source, "custom")) {
			return authoredReason("thread_source_is_custom");
		}
		if (Object.hasOwn(source, "subAgent")) {
			return authoredReason("thread_source_is_subagent");
		}
		return authoredReason("thread_source_is_unknown");
	}
	return isAllowedThreadLinkSource(source) ? null : authoredReason("thread_source_is_unknown");
}

/**
 * The refusal a status earns, if any.
 * @param status The status type.
 * @returns The reason for unloaded and system-error threads; null otherwise.
 */
function statusReason(status: ThreadLinkStatus): ThreadLinkReason | null {
	if (status === "notLoaded") {
		return authoredReason("thread_status_is_not_loaded");
	}
	if (NON_EXECUTABLE_STATUS_SET.has(status)) {
		return authoredReason("thread_status_is_system_error");
	}
	return null;
}

export {
	ALLOWED_SOURCES,
	REASON_PRECEDENCE,
	allowedThreadLinkSources,
	authoredReason,
	invalidResult,
	isAllowedThreadLinkSource,
	isCurrentEpoch,
	isExecutableThreadLinkStatus,
	isNonEmptyString,
	isRecord,
	isThreadLinkSource,
	isThreadLinkStatus,
	observedDirectInput,
	sourceOf,
	sourceReason,
	statusOf,
	statusReason,
};
