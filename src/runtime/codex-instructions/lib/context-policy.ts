type DeepReadonly<Value> = Value extends readonly unknown[]
	? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
	: Value extends object
		? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
		: Value;

function deepFreeze<Value>(value: Value): DeepReadonly<Value> {
	if (typeof value !== "object" || value === null) return value as DeepReadonly<Value>;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value) as DeepReadonly<Value>;
}

const reasonNullStates = ["unbound", "executable"] as const;
const reasonRequiredStates = ["inspect_only"] as const;
const reasonPrecedence = [
	{ reason: "stale_child", condition: "link_child_is_not_current_child" },
	{ reason: "prior_epoch", condition: "link_or_provenance_epoch_is_prior" },
	{ reason: "thread_start_outcome_unknown", condition: "thread_start_settlement_was_lost" },
	{ reason: "unknown_provenance", condition: "current_epoch_ownership_is_unproven" },
	{ reason: "thread_list_missing", condition: "persisted_target_row_is_missing" },
	{ reason: "thread_list_ambiguous", condition: "persisted_target_rows_conflict" },
	{
		reason: "thread_loaded_list_ambiguous",
		condition: "loaded_target_membership_is_duplicate_or_conflicting",
	},
	{ reason: "thread_source_custom", condition: "thread_source_is_custom" },
	{ reason: "thread_source_subagent", condition: "thread_source_is_subagent" },
	{ reason: "thread_source_unknown", condition: "thread_source_is_unknown" },
	{ reason: "thread_status_not_loaded", condition: "thread_status_is_not_loaded" },
	{ reason: "thread_status_system_error", condition: "thread_status_is_system_error" },
	{ reason: "thread_loaded_list_missing", condition: "loaded_target_membership_is_missing" },
	{ reason: "direct_input_false", condition: "direct_input_capability_is_false" },
	{ reason: "direct_input_unknown", condition: "direct_input_capability_is_null" },
] as const;

const producers = [
	{
		kind: "composer_message",
		rpcs: ["turn/start", "turn/steer"],
		operationIdSource: "host_minted",
		omitWhen: [],
	},
	{
		kind: "create_thread_initial_turn",
		rpcs: ["turn/start"],
		operationIdSource: "initialTurn.operationId",
		omitWhen: [],
	},
	{
		kind: "fork_thread_initial_turn",
		rpcs: ["turn/start"],
		operationIdSource: "initialTurn.operationId",
		omitWhen: ["prompt_absent"],
	},
	{
		kind: "send_message_to_thread",
		rpcs: ["turn/start"],
		operationIdSource: "host_minted",
		omitWhen: [],
	},
	{
		kind: "delegate_to_workhorse",
		rpcs: ["turn/start"],
		operationIdSource: "host_minted",
		omitWhen: ["queued"],
	},
	{
		kind: "steer_workhorse",
		rpcs: ["turn/steer"],
		operationIdSource: "host_minted",
		omitWhen: [],
	},
	{
		kind: "spoken_approval_classifier",
		rpcs: ["turn/start"],
		operationIdSource: "host_minted",
		omitWhen: [],
	},
] as const;

const tupleStates = [
	{ state: "idle", id: "null", kind: "null", rpc: "null", outcome: "null" },
	{ state: "in_flight", id: "non_null", kind: "non_null", rpc: "non_null", outcome: "null" },
	{
		state: "delivered",
		id: "non_null",
		kind: "non_null",
		rpc: "non_null",
		outcome: "delivered",
	},
	{
		state: "not_delivered",
		id: "non_null",
		kind: "non_null",
		rpc: "non_null",
		outcome: "not_delivered",
	},
	{
		state: "outcome_unknown",
		id: "non_null",
		kind: "non_null",
		rpc: "non_null",
		outcome: "outcome_unknown",
	},
] as const;

const outcomeTransitions = [
	{ from: "null", event: "rpc_settled_successfully", to: "delivered" },
	{ from: "null", event: "pre_effect_request_rejected", to: "not_delivered" },
	{ from: "null", event: "settlement_lost", to: "outcome_unknown" },
	{ from: "outcome_unknown", event: "exact_positive_correlation", to: "delivered" },
] as const;

const turnEvidence = [
	{
		event: "turn/started",
		rpcs: ["turn/start"],
		outcome: "delivered",
		tupleAction: "retain",
	},
	{
		event: "turn/steer_response",
		rpcs: ["turn/steer"],
		outcome: "delivered",
		tupleAction: "retain_existing_turn_id",
	},
	{
		event: "turn/completed",
		status: "completed",
		rpcs: ["turn/start", "turn/steer"],
		outcome: "delivered",
		tupleAction: "emit_terminal_then_clear",
	},
	{
		event: "turn/completed",
		status: "interrupted",
		rpcs: ["turn/start", "turn/steer"],
		outcome: "delivered",
		tupleAction: "emit_terminal_then_clear",
	},
	{
		event: "turn/completed",
		status: "failed",
		rpcs: ["turn/start", "turn/steer"],
		outcome: "delivered",
		tupleAction: "emit_terminal_then_clear",
	},
] as const;

const policy = {
	schema: 1,
	threadLink: {
		classificationTarget: "target_thread_id",
		exhaustBeforePrecedence: ["thread/list", "thread/loaded/list"],
		classificationFailures: ["repeated_cursor", "transport_failure", "list_exhaustion_failure"],
		reasonNullStates,
		reasonRequiredStates,
		nonExecutableStatuses: ["systemError"],
		reasonPrecedence,
		inferThreadFromRecency: false,
	},
	operation: {
		fieldOrder: ["id", "kind", "rpc", "outcome"],
		producers,
		tupleStates,
		outcomeTransitions,
		turnEvidence,
		terminal: {
			emit: "once",
			clear: "after_terminal_callback_or_event",
			clearFields: ["id", "kind", "rpc", "outcome"],
		},
		retryAfterOutcomeUnknown: false,
		threadStartOutcomeUnknown: {
			linkState: "inspect_only",
			reason: "thread_start_outcome_unknown",
			inferFromRecency: false,
		},
		excludedBoundaries: [
			"interrupt",
			"queue",
			"semantic_injection",
			"callback_injection",
			"realtime_transport",
		],
		callbackEvents: [
			"accepted",
			"queued",
			"started",
			"progress",
			"attention",
			"completed",
			"failed",
			"outcome_unknown",
		],
		forbiddenFields: ["phase", "status", "event", "source"],
	},
} as const;

export const ADDITIONAL_CONTEXT_POLICY = deepFreeze(policy);

export type AdditionalContextPolicy = typeof ADDITIONAL_CONTEXT_POLICY;
export type ThreadLinkState =
	| AdditionalContextPolicy["threadLink"]["reasonNullStates"][number]
	| AdditionalContextPolicy["threadLink"]["reasonRequiredStates"][number];
export type ThreadLinkReason =
	AdditionalContextPolicy["threadLink"]["reasonPrecedence"][number]["reason"];
export type OperationKind = AdditionalContextPolicy["operation"]["producers"][number]["kind"];
export type OperationRpc =
	AdditionalContextPolicy["operation"]["producers"][number]["rpcs"][number];
export type OperationOutcome = Exclude<
	AdditionalContextPolicy["operation"]["tupleStates"][number]["outcome"],
	"null"
>;
