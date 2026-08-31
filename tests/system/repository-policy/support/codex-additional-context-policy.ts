import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type JsonRecord = Record<string, unknown>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const contract = fs.readFileSync(
	path.join(repoRoot, "docs/design/codex-workbench-authored-contracts.md"),
	"utf8",
);

function jsonFenceAfter(anchor: string): unknown {
	const anchorOffset = contract.indexOf(anchor);
	if (anchorOffset < 0) throw new Error(`Contract anchor is missing: ${anchor}`);
	const start = contract.indexOf("```json\n", anchorOffset);
	if (start < 0) throw new Error(`JSON fence is missing after: ${anchor}`);
	const bodyStart = start + "```json\n".length;
	const end = contract.indexOf("\n```", bodyStart);
	if (end < 0) throw new Error(`JSON fence is unterminated after: ${anchor}`);
	return JSON.parse(contract.slice(bodyStart, end)) as unknown;
}

export function record(value: unknown, label: string): JsonRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as JsonRecord;
}

export function records(value: unknown, label: string): JsonRecord[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
	for (const [index, entry] of value.entries()) record(entry, `${label}[${index}]`);
	return value as JsonRecord[];
}

export function strings(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new Error(`${label} must be a string array`);
	}
	return value as string[];
}

export function union(value: unknown, label: string): string[] {
	if (typeof value !== "string") throw new Error(`${label} must be a pipe-separated string`);
	return value.split("|");
}

function sameJson(actual: unknown, expected: unknown, label: string): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${label} changed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
		);
	}
}

export function validateOrderedValues(
	label: string,
	actual: string[],
	expected: readonly string[],
): void {
	const duplicate = actual.find((value, index) => actual.indexOf(value) !== index);
	if (duplicate !== undefined) throw new Error(`${label} has duplicate ${duplicate}`);
	for (const value of expected) {
		if (!actual.includes(value)) throw new Error(`${label} is missing ${value}`);
	}
	for (const value of actual) {
		if (!expected.includes(value)) throw new Error(`${label} has extra ${value}`);
	}
	for (const [index, value] of expected.entries()) {
		if (actual[index] !== value) {
			throw new Error(
				`${label} reordered ${value}: expected index ${index}, received ${actual[index]}`,
			);
		}
	}
}

function exactObject(label: string, actual: JsonRecord, expected: JsonRecord): void {
	validateOrderedValues(`${label} fields`, Object.keys(actual), Object.keys(expected));
	for (const [field, expectedValue] of Object.entries(expected)) {
		const actualValue = actual[field];
		if (Array.isArray(expectedValue) && expectedValue.every((entry) => typeof entry === "string")) {
			validateOrderedValues(
				`${label}.${field}`,
				strings(actualValue, `${label}.${field}`),
				expectedValue,
			);
			continue;
		}
		sameJson(actualValue, expectedValue, `${label}.${field}`);
	}
}

function exactRows(
	label: string,
	actual: JsonRecord[],
	expected: readonly JsonRecord[],
	key: (row: JsonRecord) => string,
): void {
	const actualKeys = actual.map(key);
	const expectedKeys = expected.map(key);
	const duplicate = actualKeys.find((value, index) => actualKeys.indexOf(value) !== index);
	if (duplicate !== undefined) throw new Error(`${label} has duplicate ${duplicate}`);
	for (const value of expectedKeys) {
		if (!actualKeys.includes(value)) throw new Error(`${label} is missing ${value}`);
	}
	for (const value of actualKeys) {
		if (!expectedKeys.includes(value)) throw new Error(`${label} has extra ${value}`);
	}
	for (const [index, value] of expectedKeys.entries()) {
		if (actualKeys[index] !== value) {
			throw new Error(
				`${label} reordered ${value}: expected index ${index}, received ${actualKeys[index]}`,
			);
		}
		exactObject(`${label} ${value}`, actual[index]!, expected[index]!);
	}
}

export const manifestRootFields = ["schema", "threadLink", "operation"] as const;
export const linkPolicyFields = [
	"classificationTarget",
	"exhaustBeforePrecedence",
	"classificationFailures",
	"reasonNullStates",
	"reasonRequiredStates",
	"nonExecutableStatuses",
	"reasonPrecedence",
	"inferThreadFromRecency",
] as const;
export const operationPolicyFields = [
	"fieldOrder",
	"producers",
	"tupleStates",
	"outcomeTransitions",
	"turnEvidence",
	"terminal",
	"retryAfterOutcomeUnknown",
	"threadStartOutcomeUnknown",
	"excludedBoundaries",
	"callbackEvents",
	"forbiddenFields",
] as const;
export const canonicalRootFields = [
	"schema",
	"paneId",
	"board",
	"threadLink",
	"child",
	"workhorse",
	"coordinator",
	"semantic",
	"focus",
	"selection",
	"claim",
	"ambiguity",
	"operation",
] as const;
export const canonicalThreadLinkFields = ["state", "reason"] as const;
export const canonicalOperationFields = ["id", "kind", "rpc", "outcome"] as const;
export const reasonNullStates = ["unbound", "executable"] as const;
export const reasonRequiredStates = ["inspect_only"] as const;
export const threadLinkStates = [...reasonNullStates, ...reasonRequiredStates] as const;

export const reasonRows = [
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

export const producerRows = [
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

export const tupleRows = [
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

export const transitionRows = [
	{ from: "null", event: "rpc_settled_successfully", to: "delivered" },
	{ from: "null", event: "pre_effect_request_rejected", to: "not_delivered" },
	{ from: "null", event: "settlement_lost", to: "outcome_unknown" },
	{ from: "outcome_unknown", event: "exact_positive_correlation", to: "delivered" },
] as const;

export const evidenceRows = [
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

export const manifest = record(
	jsonFenceAfter("### Additional-context policy manifest"),
	"manifest",
);
export const canonical = record(
	jsonFenceAfter("`<canonical-json>` is compact JSON"),
	"canonical context",
);

export function validateManifest(value: unknown): void {
	const root = record(value, "manifest");
	validateOrderedValues("manifest fields", Object.keys(root), manifestRootFields);
	sameJson(root.schema, 1, "manifest schema");
	const link = record(root.threadLink, "threadLink policy");
	validateOrderedValues("threadLink policy fields", Object.keys(link), linkPolicyFields);
	sameJson(link.classificationTarget, "target_thread_id", "classification target");
	validateOrderedValues(
		"classification exhaustion",
		strings(link.exhaustBeforePrecedence, "exhaustion"),
		["thread/list", "thread/loaded/list"],
	);
	validateOrderedValues(
		"classification failures",
		strings(link.classificationFailures, "failures"),
		["repeated_cursor", "transport_failure", "list_exhaustion_failure"],
	);
	validateOrderedValues(
		"reason-null states",
		strings(link.reasonNullStates, "reason-null states"),
		reasonNullStates,
	);
	validateOrderedValues(
		"reason-required states",
		strings(link.reasonRequiredStates, "required states"),
		reasonRequiredStates,
	);
	validateOrderedValues(
		"non-executable statuses",
		strings(link.nonExecutableStatuses, "non-executable statuses"),
		["systemError"],
	);
	exactRows("threadLink reasons", records(link.reasonPrecedence, "reasons"), reasonRows, (row) =>
		String(row.reason),
	);
	sameJson(link.inferThreadFromRecency, false, "threadLink recency inference");

	const operation = record(root.operation, "operation policy");
	validateOrderedValues("operation policy fields", Object.keys(operation), operationPolicyFields);
	validateOrderedValues("operation field order", strings(operation.fieldOrder, "field order"), [
		"id",
		"kind",
		"rpc",
		"outcome",
	]);
	exactRows("operation producers", records(operation.producers, "producers"), producerRows, (row) =>
		String(row.kind),
	);
	exactRows("tuple states", records(operation.tupleStates, "tuple states"), tupleRows, (row) =>
		String(row.state),
	);
	exactRows(
		"outcome transitions",
		records(operation.outcomeTransitions, "outcome transitions"),
		transitionRows,
		(row) => `${String(row.from)}:${String(row.event)}`,
	);
	exactRows(
		"turn evidence",
		records(operation.turnEvidence, "turn evidence"),
		evidenceRows,
		(row) => `${String(row.event)}:${String(row.status ?? "-")}`,
	);
	exactObject("terminal policy", record(operation.terminal, "terminal policy"), {
		emit: "once",
		clear: "after_terminal_callback_or_event",
		clearFields: ["id", "kind", "rpc", "outcome"],
	});
	sameJson(operation.retryAfterOutcomeUnknown, false, "retry after outcome_unknown");
	exactObject(
		"thread/start uncertainty",
		record(operation.threadStartOutcomeUnknown, "thread/start uncertainty"),
		{
			linkState: "inspect_only",
			reason: "thread_start_outcome_unknown",
			inferFromRecency: false,
		},
	);
	validateOrderedValues(
		"excluded boundaries",
		strings(operation.excludedBoundaries, "excluded boundaries"),
		["interrupt", "queue", "semantic_injection", "callback_injection", "realtime_transport"],
	);
	validateOrderedValues("callback events", strings(operation.callbackEvents, "callback events"), [
		"accepted",
		"queued",
		"started",
		"progress",
		"attention",
		"completed",
		"failed",
		"outcome_unknown",
	]);
	validateOrderedValues(
		"forbidden fields",
		strings(operation.forbiddenFields, "forbidden fields"),
		["phase", "status", "event", "source"],
	);
}

export function validateCanonicalContext(value: unknown): void {
	const root = record(value, "canonical context");
	validateOrderedValues("canonical root fields", Object.keys(root), canonicalRootFields);
	sameJson(root.schema, 1, "canonical schema");
	const link = record(root.threadLink, "canonical threadLink");
	const operation = record(root.operation, "canonical operation");
	validateOrderedValues(
		"canonical threadLink fields",
		Object.keys(link),
		canonicalThreadLinkFields,
	);
	validateOrderedValues(
		"canonical operation fields",
		Object.keys(operation),
		canonicalOperationFields,
	);
	validateOrderedValues(
		"canonical state union",
		union(link.state, "canonical state union"),
		threadLinkStates,
	);
	validateOrderedValues("canonical reason union", union(link.reason, "canonical reason union"), [
		...reasonRows.map((row) => row.reason),
		"null",
	]);
	sameJson(operation.id, "<opaque-or-null>", "canonical operation.id");
	validateOrderedValues("canonical kind union", union(operation.kind, "canonical kind union"), [
		...producerRows.map((row) => row.kind),
		"null",
	]);
	validateOrderedValues("canonical rpc union", union(operation.rpc, "canonical rpc union"), [
		"turn/start",
		"turn/steer",
		"null",
	]);
	validateOrderedValues(
		"canonical outcome union",
		union(operation.outcome, "canonical outcome union"),
		["delivered", "not_delivered", "outcome_unknown", "null"],
	);
}

export function validateThreadLinkPair(state: unknown, reason: unknown): void {
	if (typeof state !== "string" || !(threadLinkStates as readonly string[]).includes(state)) {
		throw new Error(`threadLink state has unknown ${String(state)}`);
	}
	if ((reasonNullStates as readonly string[]).includes(state)) {
		if (reason !== null) throw new Error(`threadLink state ${state} requires null reason`);
		return;
	}
	if (reason === null) throw new Error(`threadLink state ${state} requires a non-null reason`);
	if (typeof reason !== "string" || !reasonRows.some((row) => row.reason === reason)) {
		throw new Error(`threadLink reason has unknown ${String(reason)}`);
	}
}

export function cloneManifest(): JsonRecord {
	return structuredClone(manifest);
}

export function cloneCanonical(): JsonRecord {
	return structuredClone(canonical);
}

export function linkPolicy(root: JsonRecord): JsonRecord {
	return record(root.threadLink, "threadLink policy");
}

export function operationPolicy(root: JsonRecord): JsonRecord {
	return record(root.operation, "operation policy");
}
