import type { AdditionalContextPolicy, ArchboardContext } from "../index.js";

const contextFixture: ArchboardContext = {
	schema: 1,
	paneId: "pane-1",
	board: {
		note: "vault/architecture.excalidraw.md",
		version: 42,
		cursor: "cursor-1",
	},
	threadLink: {
		state: "executable",
		reason: null,
	},
	child: {
		id: "child-1",
		epoch: "epoch-1",
	},
	workhorse: {
		threadId: "thread-workhorse",
		turnId: "turn-1",
	},
	coordinator: {
		threadId: "thread-coordinator",
		realtimeSessionId: null,
	},
	semantic: {
		brief: "The selected service depends on the repository adapter.",
		capturedAtMs: 100,
		freshUntilMs: 30_100,
		truncated: false,
	},
	focus: {
		paneId: "pane-1",
		capturedAtMs: 101,
	},
	selection: {
		elementIds: ["element-1", "element-2"],
		capturedAtMs: 102,
	},
	claim: {
		holder: "human",
		doing: "Reviewing the adapter boundary",
	},
	ambiguity: [],
	operation: {
		id: null,
		kind: null,
		rpc: null,
		outcome: null,
	},
};

/** Independent byte/shape oracle copied from the reviewed e9fd214 manifest. */
const reviewedAdditionalContextPolicy = {
	schema: 1,
	threadLink: {
		classificationTarget: "target_thread_id",
		exhaustBeforePrecedence: ["thread/list", "thread/loaded/list"],
		classificationFailures: ["repeated_cursor", "transport_failure", "list_exhaustion_failure"],
		reasonNullStates: ["unbound", "executable"],
		reasonRequiredStates: ["inspect_only"],
		nonExecutableStatuses: ["systemError"],
		reasonPrecedence: [
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
		],
		inferThreadFromRecency: false,
	},
	operation: {
		fieldOrder: ["id", "kind", "rpc", "outcome"],
		producers: [
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
		],
		tupleStates: [
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
		],
		outcomeTransitions: [
			{ from: "null", event: "rpc_settled_successfully", to: "delivered" },
			{ from: "null", event: "pre_effect_request_rejected", to: "not_delivered" },
			{ from: "null", event: "settlement_lost", to: "outcome_unknown" },
			{ from: "outcome_unknown", event: "exact_positive_correlation", to: "delivered" },
		],
		turnEvidence: [
			{ event: "turn/started", rpcs: ["turn/start"], outcome: "delivered", tupleAction: "retain" },
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
		],
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
} as const satisfies AdditionalContextPolicy;

const instructionByteMutations = {
	bom: (value: string) => `\uFEFF${value}`,
	crlf: (value: string) => value.replaceAll("\n", "\r\n"),
	missingTerminalLf: (value: string) => value.slice(0, -1),
	extraTerminalLf: (value: string) => `${value}\n`,
	trailingSpace: (value: string) => `${value.slice(0, -1)} \n`,
	wrongSeparator: (value: string) =>
		value.replace("--- ARCHBOARD COORDINATOR ROLE ---", "--- COORDINATOR ROLE ---"),
} as const;

export { contextFixture, instructionByteMutations, reviewedAdditionalContextPolicy };
