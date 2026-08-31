import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	decisionCauses,
	decisionOutcomes,
	dispatcherOrder,
	effectFields,
	effectRows,
	identityFields,
	operationBoundaries,
	requestFieldOrder,
	revalidationFailures,
	waitReleaseEvents,
} from "./codex-dynamic-approval-fixed.js";

export type JsonRecord = Record<string, unknown>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const contract = fs.readFileSync(
	path.join(repoRoot, "docs/design/codex-workbench-authored-contracts.md"),
	"utf8",
);

function jsonFenceAfter(anchor: string): string {
	const anchorOffset = contract.indexOf(anchor);
	if (anchorOffset < 0) throw new Error(`JSON anchor is missing: ${anchor}`);
	const start = contract.indexOf("```json\n", anchorOffset);
	if (start < 0) throw new Error(`JSON fence is missing after: ${anchor}`);
	const bodyStart = start + "```json\n".length;
	const end = contract.indexOf("\n```", bodyStart);
	if (end < 0) throw new Error(`JSON fence is unterminated after: ${anchor}`);
	return contract.slice(bodyStart, end);
}

export const policy = JSON.parse(
	jsonFenceAfter("The strict manifest is the semantic source"),
) as JsonRecord;

export function record(value: unknown, label: string): JsonRecord {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as JsonRecord;
}

export function records(value: unknown, label: string): JsonRecord[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
	value.forEach((item, index) => record(item, `${label}[${index}]`));
	return value as JsonRecord[];
}

export function strings(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`${label} must be a string array`);
	}
	return value as string[];
}

function exact(label: string, actual: unknown, expected: unknown): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} changed`);
}

function ordered(label: string, actual: readonly string[], expected: readonly string[]): void {
	const duplicate = actual.find((value, index) => actual.indexOf(value) !== index);
	if (duplicate !== undefined) throw new Error(`${label} has duplicate ${duplicate}`);
	const missing = expected.find((value) => !actual.includes(value));
	if (missing !== undefined) throw new Error(`${label} is missing ${missing}`);
	const extra = actual.find((value) => !expected.includes(value));
	if (extra !== undefined) throw new Error(`${label} has extra ${extra}`);
	if (actual.some((value, index) => value !== expected[index])) {
		throw new Error(`${label} is reordered`);
	}
}

function fields(label: string, value: JsonRecord, expected: readonly string[]): void {
	ordered(`${label} fields`, Object.keys(value), expected);
}

function validateRequest(root: JsonRecord): void {
	const request = record(root.request, "request");
	fields("request", request, [
		"fieldOrder",
		"identityFields",
		"effectFields",
		"effectiveBoundaryFields",
		"effects",
		"selfForkBoundary",
		"otherForkBoundary",
		"hash",
		"expiry",
		"freshness",
	]);
	ordered(
		"request field order",
		strings(request.fieldOrder, "request field order"),
		requestFieldOrder,
	);
	ordered("identity fields", strings(request.identityFields, "identity fields"), identityFields);
	ordered("effect fields", strings(request.effectFields, "effect fields"), effectFields);
	ordered("boundary fields", strings(request.effectiveBoundaryFields, "boundary fields"), [
		"relation",
		"beforeTurnId",
	]);
	exact("effect rows", request.effects, effectRows);
	exact("self-fork boundary", request.selfForkBoundary, {
		relation: "self",
		beforeTurnId: "identity.turnId",
		callerBeforeTurnId: "ignored",
	});
	exact("other-fork boundary", request.otherForkBoundary, {
		relation: "other",
		beforeTurnId: "arguments.beforeTurnId",
	});
	exact("effect hash policy", request.hash, {
		algorithm: "sha256",
		wireForm: "sha256:<64-lowercase-hex>",
		inputFields: ["identity", "effect"],
		canonicalization: "utf8_compact_json_in_manifest_field_order",
	});
	exact("expiry policy", request.expiry, {
		durationMs: 90000,
		source: "CODEX_APPROVAL_EXPIRY_MS",
		expiresAtMs: "createdAtMs + durationMs",
		expiredWhen: "nowMs >= expiresAtMs",
		extendable: false,
	});
	exact("freshness policy", request.freshness, {
		oneRequestPerDynamicCall: true,
		cachedGrant: false,
		sessionGrant: false,
		reusedDecision: false,
		mutableSnapshot: false,
	});
}

function validateDecision(root: JsonRecord): void {
	const decision = record(root.decision, "decision");
	fields("decision", decision, [
		"fieldOrder",
		"timestampAuthority",
		"outcomes",
		"personDecisionOutcomes",
		"hostTerminalOutcomes",
		"personDecisionAcceptedWhen",
		"causes",
		"terminal",
		"approvalRequired",
	]);
	ordered("decision fields", strings(decision.fieldOrder, "decision fields"), [
		"outcome",
		"identity",
		"effectHash",
		"decidedAtMs",
		"cause",
	]);
	exact("decision timestamp authority", decision.timestampAuthority, {
		decidedAtMs: "host_nowMs_at_terminal_compare_and_set",
		callerSupplied: false,
		personDecisionAcceptedWhen: "same_host_nowMs < expiresAtMs",
		expiryWinsWhen: "same_host_nowMs >= expiresAtMs",
	});
	ordered("decision outcomes", strings(decision.outcomes, "decision outcomes"), decisionOutcomes);
	ordered(
		"person decision outcomes",
		strings(decision.personDecisionOutcomes, "person decision outcomes"),
		["approved", "declined"],
	);
	ordered(
		"host terminal outcomes",
		strings(decision.hostTerminalOutcomes, "host terminal outcomes"),
		["expired", "cancelled", "disconnected"],
	);
	ordered(
		"person decision acceptance",
		strings(decision.personDecisionAcceptedWhen, "person decision acceptance"),
		[
			"request_is_pending",
			"identity_exactly_echoes_request",
			"effect_hash_exactly_echoes_request",
			"same_host_nowMs_stamped_as_decidedAtMs_is_before_expiresAtMs",
		],
	);
	exact("decision causes", decision.causes, decisionCauses);
	exact("decision terminal policy", decision.terminal, {
		settle: "compare_and_set_once",
		removePendingAuthority: true,
		removePendingCard: true,
		approvedOperationIds: "reserved_for_same_in_flight_call_only",
		nonApprovedOperationIds: "retire_without_effect",
		lateDecision: "reject_without_effect_or_second_tool_response",
		duplicateDecision: "reject_without_replacing_terminal_decision",
	});
	exact("approval_required policy", decision.approvalRequired, {
		terminalToolResult: true,
		resumable: false,
		resumeCommand: null,
		retainedExecutionAuthority: false,
		retainedPendingCard: false,
		nextAttempt: "new_dynamic_call_with_new_identity_operation_ids_effect_hash_and_decision",
	});
}

function validateExecution(root: JsonRecord): void {
	const revalidation = record(root.revalidation, "revalidation");
	fields("revalidation", revalidation, [
		"order",
		"failures",
		"freshContext",
		"staleApprovedDecision",
	]);
	exact("revalidation order", revalidation.order, [
		"decision_identity_and_effect_hash",
		"current_child_epoch_and_logical_call",
		"caller_authority",
		"target_authority_and_classification",
		"immutable_effect_and_effective_boundary",
		"context_authority",
		"operation_ids_unconsumed",
		"approval_expiry",
	]);
	exact("revalidation failures", revalidation.failures, revalidationFailures);
	exact("fresh context policy", revalidation.freshContext, {
		readAfterApprovalAndRevalidation: true,
		source: "DynamicContextPort",
		capturedContentMayAdvance: true,
		paneLinkAuthorityMustMatch: true,
		callerSuppliedContext: false,
		fallbackContext: false,
	});
	exact("stale approved decision", revalidation.staleApprovedDecision, {
		approvalOutcomeRemains: "approved",
		effect: "none",
		operationIds: "retire_without_effect",
		toolResult: "refused_with_exact_failure_reason",
	});
	const ids = record(root.operationIds, "operation IDs");
	fields("operation IDs", ids, [
		"issuer",
		"outerOperationId",
		"boundaries",
		"contextOperations",
		"unresolvedTerminalAuthority",
		"clientUserMessageId",
		"retireOn",
		"consumeOn",
		"reusable",
		"newIdForRetry",
		"callerSuppliedId",
		"castFromAnotherIdentity",
		"adHocMinting",
	]);
	exact("operation ID issuer", ids.issuer, "DynamicOperationIdPort");
	exact(
		"outer operation ID",
		ids.outerOperationId,
		"one_fresh_id_per_mutating_dynamic_call_before_effect_hash",
	);
	exact("operation ID boundaries", ids.boundaries, operationBoundaries);
	exact("context operation rows", ids.contextOperations, [
		{
			boundary: "create_thread_initial_turn",
			kind: "create_thread_initial_turn",
			rpc: "turn/start",
		},
		{
			boundary: "fork_thread_initial_turn",
			kind: "fork_thread_initial_turn",
			rpc: "turn/start",
		},
		{
			boundary: "send_message_to_thread",
			kind: "send_message_to_thread",
			rpc: "turn/start",
		},
	]);
	exact("unresolved terminal authority", ids.unresolvedTerminalAuthority, {
		transition: "host_confirmed_idempotent_atomic",
		logicalOwner: "exact_child_epoch_and_logical_call_quarantine",
		wireOwner: "one_original_transport_handle_per_admitted_json_rpc_request_id",
		epochStateBeforeRelease: "poisoned",
		sameRequestId: "deduplicate_without_second_response_write",
		sameLogicalCall: "admit_distinct_wire_and_fan_canonical_outcome",
		otherCallsInEpoch:
			"retain_distinct_wire_with_canonical_refusal_before_operation_id_approval_stage_or_effect",
		wireCapacity: 128,
		overflow: "synchronous_fail_closed_shutdown_without_unbounded_wire_admission",
		poisonFailure: "synchronous_exact_epoch_shutdown_or_retained_fatal_lifecycle_fault",
		normalResponseWhileAnyOwnedIdIsCurrent: false,
		recovery: "lifecycle_triggered_bounded_terminalization_then_one_response_per_admitted_wire",
		clearWithoutResponseOn: ["exact_child_exit", "exact_transport_teardown", "dispose"],
	});
	exact(
		"clientUserMessageId policy",
		ids.clientUserMessageId,
		"serialize_the_same_boundary_operation_id",
	);
	exact(
		"operation ID terminal policy",
		{ retireOn: ids.retireOn, consumeOn: ids.consumeOn, reusable: ids.reusable },
		{
			retireOn: ["declined", "expired", "cancelled", "disconnected", "stale_revalidation"],
			consumeOn: "durable_boundary_settlement",
			reusable: false,
		},
	);
	exact(
		"operation ID authority policy",
		[ids.newIdForRetry, ids.callerSuppliedId, ids.castFromAnotherIdentity, ids.adHocMinting],
		[false, false, false, false],
	);
}

function validateDispatcherAndWait(root: JsonRecord): void {
	const dispatcher = record(root.dispatcher, "dispatcher");
	fields("dispatcher", dispatcher, [
		"order",
		"operationGroups",
		"initialTurnCondition",
		"mutationRetry",
		"provenanceSettlement",
		"toolResultConstruction",
		"transportResponseAttempt",
		"childDisconnectResponse",
	]);
	ordered("dispatcher order", strings(dispatcher.order, "dispatcher order"), dispatcherOrder);
	exact("dispatcher operation groups", dispatcher.operationGroups, [
		{ tool: "create_thread", boundaries: ["thread/start", "initial_turn/turn/start"] },
		{ tool: "fork_thread", boundaries: ["thread/fork", "optional_initial_turn/turn/start"] },
		{ tool: "send_message_to_thread", boundaries: ["turn/start"] },
	]);
	exact(
		"dispatcher terminal rules",
		{
			initialTurnCondition: dispatcher.initialTurnCondition,
			mutationRetry: dispatcher.mutationRetry,
			provenanceSettlement: dispatcher.provenanceSettlement,
			toolResultConstruction: dispatcher.toolResultConstruction,
			transportResponseAttempt: dispatcher.transportResponseAttempt,
			childDisconnectResponse: dispatcher.childDisconnectResponse,
		},
		{
			initialTurnCondition: "only_after_confirmed_create_or_fork_and_when_prompt_present",
			mutationRetry: false,
			provenanceSettlement: "once_per_declared_operation_boundary",
			toolResultConstruction: "once_after_all_attempted_boundaries_settle",
			transportResponseAttempt: "once_when_child_request_transport_is_owned",
			childDisconnectResponse: "classify_not_delivered_and_never_retry",
		},
	);
	const wait = record(root.waitThreads, "wait_threads");
	fields("wait_threads", wait, [
		"ownerFields",
		"operationId",
		"registrationOrder",
		"release",
		"retainedOwnerAfterRelease",
		"reusedOwner",
		"releaseAfterResponse",
	]);
	ordered("wait owner fields", strings(wait.ownerFields, "wait owner fields"), [
		"child",
		"epoch",
		"threadId",
		"turnId",
		"callId",
		"namespace",
		"tool",
		"manifestHash",
		"sortedTargetThreadIds",
	]);
	exact("wait operation ID", wait.operationId, null);
	exact("wait registration order", wait.registrationOrder, [
		"validate_call_and_cursor",
		"resolve_exact_caller_and_targets",
		"sort_unique_target_ids",
		"reject_direct_or_transitive_cycle",
		"register_exact_owner_once",
	]);
	const releases = records(wait.release, "wait releases");
	ordered(
		"wait release events",
		releases.map((row) => String(row.event)),
		waitReleaseEvents,
	);
	exact("wait release policy", wait.release, [
		{ event: "completion", action: "release_owner_once_before_completed_response" },
		{ event: "attention", action: "release_owner_once_before_attention_response" },
		{ event: "timeout", action: "release_owner_once_before_timeout_response" },
		{ event: "cancellation", action: "release_owner_once_before_terminal_settlement" },
		{ event: "interruption", action: "release_owner_once_for_caller_turn" },
		{ event: "disconnect", action: "release_owner_once_for_disconnected_call" },
		{ event: "child_exit", action: "release_every_owner_for_exact_child_once" },
	]);
	exact(
		"wait terminal policy",
		[wait.retainedOwnerAfterRelease, wait.reusedOwner, wait.releaseAfterResponse],
		[false, false, false],
	);
}

function validatePortsAndOwnership(root: JsonRecord): void {
	const ports = records(root.ports, "ports");
	ordered(
		"port names",
		ports.map((row) => String(row.port)),
		[
			"DynamicToolApprovalPort",
			"DynamicThreadAuthorityPort",
			"DynamicContextPort",
			"DynamicOperationIdPort",
			"DynamicToolLifecyclePort",
		],
	);
	for (const port of ports)
		fields(`port ${String(port.port)}`, port, ["port", "provides", "forbids"]);
	exact(
		"port policy",
		ports.map((port) => [port.provides, port.forbids]),
		[
			[
				[
					"present_immutable_request",
					"await_one_exact_visual_decision",
					"settle_identity_and_effect_hash_once",
				],
				["seven_family_broker", "cached_or_session_grant", "resumable_approval_required"],
			],
			[
				[
					"resolve_exact_logical_caller",
					"classify_exact_target",
					"issue_and_revalidate_opaque_authority_tokens",
				],
				["recency_or_focus_inference", "fabricated_provenance", "caller_selected_authority"],
			],
			[
				[
					"issue_and_revalidate_pane_link_authority",
					"read_one_fresh_ArchboardContext_after_approval",
				],
				["caller_supplied_context", "duplicate_context_source", "fallback_context"],
			],
			[
				[
					"issue_canonical_OperationId",
					"validate_current_unconsumed_OperationId",
					"serialize_for_owned_wire_fields",
				],
				["cast_from_other_identity", "caller_supplied_id", "second_minting_site"],
			],
			[
				[
					"call_cancellation_and_turn_interruption",
					"browser_child_and_host_disconnect_settlement",
					"exact_wait_owner_registration_and_release",
				],
				["retained_authority_after_terminal_state", "duplicate_settlement", "orphaned_wait_owner"],
			],
		],
	);
	exact("ownership", root.ownership, {
		authoredPolicy: "TASK-143.01.19",
		operationIdentity: "TASK-143.01.20",
		browserContract: "TASK-143.01.21",
		headlessPortsAndDispatcher: "TASK-143.05.04",
		gateway: "TASK-143.01.10",
		ui: "TASK-143.03.07",
		composition: "TASK-143.01.14",
		systemOwner: "TASK-143.01.15",
		browserOwner: "TASK-143.03.13",
		excludedBroker: "src/runtime/codex-approvals",
	});
}

export function validatePolicy(value: JsonRecord): void {
	const root = record(value, "dynamic approval policy");
	fields("dynamic approval policy", root, [
		"schema",
		"request",
		"decision",
		"revalidation",
		"operationIds",
		"dispatcher",
		"waitThreads",
		"ports",
		"ownership",
	]);
	exact("policy schema", root.schema, 1);
	validateRequest(root);
	validateDecision(root);
	validateExecution(root);
	validateDispatcherAndWait(root);
	validatePortsAndOwnership(root);
}

export function clonePolicy(): JsonRecord {
	return structuredClone(policy);
}
