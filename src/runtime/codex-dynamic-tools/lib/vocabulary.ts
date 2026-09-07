import type { SessionThread } from "@/runtime/codex-session";
import type { GeneralThreadToolName } from "@/runtime/codex-thread-tools";
import { isCodexThreadStatusType } from "@/shared/codex-app-server-contract";

type DynamicToolName = GeneralThreadToolName;
const DYNAMIC_MUTATION_TOOL_NAMES = [
	"create_thread",
	"fork_thread",
	"send_message_to_thread",
] as const;
type DynamicMutationToolName = (typeof DYNAMIC_MUTATION_TOOL_NAMES)[number];
type DynamicReadToolName = "list_threads" | "read_thread";
type DynamicStatus = SessionThread["status"]["type"];
const DYNAMIC_OWNERSHIPS = ["created", "attached", "foreign"] as const;
type DynamicOwnership = (typeof DYNAMIC_OWNERSHIPS)[number];
const DYNAMIC_EPOCH_STATES = ["current", "prior", "unknown"] as const;
type DynamicEpochState = (typeof DYNAMIC_EPOCH_STATES)[number];
type DynamicRelation = "self" | "other";

const DYNAMIC_REFUSAL_REASONS = [
	"invalid_call",
	"not_ready",
	"not_loaded",
	"not_controllable",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"approval_declined",
	"cycle",
	"busy",
	"expired",
	"unsupported",
] as const;
type DynamicRefusalReason = (typeof DYNAMIC_REFUSAL_REASONS)[number];

type DynamicApprovalOutcome = "approved" | "declined" | "expired" | "cancelled" | "disconnected";

type DynamicApprovalCause =
	| "person_approved"
	| "person_declined"
	| "deadline_reached"
	| "call_cancelled"
	| "caller_turn_interrupted"
	| "host_shutdown"
	| "browser_disconnected"
	| "child_disconnected";

type DynamicLifecyclePhase = "before_approval" | "after_approval" | "before_effect";

type DynamicDispatchErrorCode = DynamicRefusalReason | "not_delivered" | "outcome_unknown";

/** Refusal codes a host authority or lifecycle port may pass through unchanged. */
const AUTHORITY_REFUSAL_CODES = [
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"not_loaded",
	"not_controllable",
	"system_error",
] as const;
type AuthorityRefusalCode = (typeof AUTHORITY_REFUSAL_CODES)[number];

/** The subset of authority codes that name a child-epoch ownership failure. */
const EPOCH_REFUSAL_CODES = ["stale_child", "prior_epoch", "unknown_provenance"] as const;
type EpochRefusalCode = (typeof EPOCH_REFUSAL_CODES)[number];

/**
 * Whether a value is one of a fixed literal list, narrowing it to the list's
 * member type without a cast.
 * @param values The reviewed literal list.
 * @param value Candidate of unknown origin.
 * @returns Whether the candidate is one of the listed literals.
 */
function isOneOf<const Values extends readonly string[]>(
	values: Values,
	value: unknown,
): value is Values[number] {
	return values.some((candidate) => candidate === value);
}

/**
 * Whether a tool name is one of the three mutation tools.
 * @param value Candidate tool name.
 * @returns Whether the name is a mutation tool.
 */
function isDynamicMutationToolName(value: unknown): value is DynamicMutationToolName {
	return isOneOf(DYNAMIC_MUTATION_TOOL_NAMES, value);
}

/**
 * Whether a value is a reviewed thread ownership word.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is an ownership word.
 */
function isDynamicOwnership(value: unknown): value is DynamicOwnership {
	return isOneOf(DYNAMIC_OWNERSHIPS, value);
}

/**
 * Whether a value is a reviewed epoch state word.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is an epoch state word.
 */
function isDynamicEpochState(value: unknown): value is DynamicEpochState {
	return isOneOf(DYNAMIC_EPOCH_STATES, value);
}

/**
 * Whether a value is a thread status type from the bound app-server contract.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a thread status type.
 */
function isDynamicStatus(value: unknown): value is DynamicStatus {
	return isCodexThreadStatusType(value);
}

/**
 * Whether a value is one of the reviewed refusal reasons.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a refusal reason.
 */
function isDynamicRefusalReason(value: unknown): value is DynamicRefusalReason {
	return isOneOf(DYNAMIC_REFUSAL_REASONS, value);
}

/**
 * Read the `code` field of an arbitrary thrown value without trusting its shape.
 * @param error Thrown value.
 * @returns The code field, or undefined when the value has none.
 */
function errorCodeOf(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

/**
 * Classify a thrown value's code as one an authority port may pass through.
 * @param error Thrown value.
 * @returns The authority refusal code, or null when the code is not one.
 */
function authorityRefusalCode(error: unknown): AuthorityRefusalCode | null {
	const code = errorCodeOf(error);
	return isOneOf(AUTHORITY_REFUSAL_CODES, code) ? code : null;
}

/**
 * Classify a thrown value's code as a child-epoch ownership failure.
 * @param error Thrown value.
 * @returns The epoch refusal code, or null when the code is not one.
 */
function epochRefusalCode(error: unknown): EpochRefusalCode | null {
	const code = errorCodeOf(error);
	return isOneOf(EPOCH_REFUSAL_CODES, code) ? code : null;
}

export {
	type AuthorityRefusalCode,
	type DynamicApprovalCause,
	type DynamicApprovalOutcome,
	type DynamicDispatchErrorCode,
	type DynamicEpochState,
	type DynamicLifecyclePhase,
	type DynamicMutationToolName,
	type DynamicOwnership,
	type DynamicReadToolName,
	type DynamicRefusalReason,
	type DynamicRelation,
	type DynamicStatus,
	type DynamicToolName,
	type EpochRefusalCode,
	authorityRefusalCode,
	epochRefusalCode,
	errorCodeOf,
	isDynamicEpochState,
	isDynamicMutationToolName,
	isDynamicOwnership,
	isDynamicRefusalReason,
	isDynamicStatus,
	isOneOf,
};
