import { describe, expect, test } from "bun:test";
import {
	canonical,
	canonicalOperationFields,
	canonicalRootFields,
	canonicalThreadLinkFields,
	cloneCanonical,
	cloneManifest,
	evidenceRows,
	linkPolicy,
	linkPolicyFields,
	manifest,
	manifestRootFields,
	operationPolicy,
	operationPolicyFields,
	producerRows,
	reasonNullStates,
	reasonRequiredStates,
	reasonRows,
	record,
	records,
	strings,
	threadLinkStates,
	transitionRows,
	tupleRows,
	union,
	validateCanonicalContext,
	validateManifest,
	validateThreadLinkPair,
	type JsonRecord,
} from "./support/codex-additional-context-policy.js";
import {
	expectObjectSurfaceAttacks,
	expectOrderedSetAttacks,
	expectRowCollectionAttacks,
	expectRowFieldAttacks,
	type Selector,
	type Values,
} from "./support/codex-additional-context-mutations.js";

type RowCase = readonly [
	(root: JsonRecord) => JsonRecord[],
	readonly JsonRecord[],
	(row: JsonRecord) => string,
	JsonRecord,
	string,
];
function arrayValues(select: (root: JsonRecord) => unknown): Values {
	return {
		get: (root) => [...strings(select(root), "ordered values")],
		set: (root, values) => {
			const target = strings(select(root), "ordered values");
			target.splice(0, target.length, ...values);
		},
	};
}

function unionValues(select: Selector, field: string, label: string): Values {
	return {
		get: (root) => union(select(root)[field], label),
		set: (root, values) => {
			select(root)[field] = values.join("|");
		},
	};
}

const canonicalLink = (root: JsonRecord): JsonRecord =>
	record(root.threadLink, "canonical threadLink");
const canonicalOperation = (root: JsonRecord): JsonRecord =>
	record(root.operation, "canonical operation");

const reasons = (root: JsonRecord): JsonRecord[] =>
	records(linkPolicy(root).reasonPrecedence, "reasons");
const producers = (root: JsonRecord): JsonRecord[] =>
	records(operationPolicy(root).producers, "producers");
const tuples = (root: JsonRecord): JsonRecord[] =>
	records(operationPolicy(root).tupleStates, "tuple states");
const transitions = (root: JsonRecord): JsonRecord[] =>
	records(operationPolicy(root).outcomeTransitions, "transitions");
const evidence = (root: JsonRecord): JsonRecord[] =>
	records(operationPolicy(root).turnEvidence, "turn evidence");
const evidenceKey = (row: JsonRecord): string =>
	`${String(row.event)}:${String(row.status ?? "-")}`;
const rowCases: readonly RowCase[] = [
	[
		reasons,
		reasonRows,
		(row) => String(row.reason),
		{ reason: "unreviewed_reason", condition: "unreviewed_condition" },
		"threadLink reasons",
	],
	[
		producers,
		producerRows,
		(row) => String(row.kind),
		{ kind: "unreviewed_operation" },
		"operation producers",
	],
	[tuples, tupleRows, (row) => String(row.state), { state: "unreviewed_state" }, "tuple states"],
	[
		transitions,
		transitionRows,
		(row) => `${String(row.from)}:${String(row.event)}`,
		{ from: "unreviewed", event: "unreviewed" },
		"outcome transitions",
	],
	[evidence, evidenceRows, evidenceKey, { event: "unreviewed" }, "turn evidence"],
];

describe("Codex additional-context authored policy", () => {
	test("matches the canonical schema, manifest, and every thread-link pair", () => {
		expect(() => validateManifest(manifest)).not.toThrow();
		expect(() => validateCanonicalContext(canonical)).not.toThrow();
		for (const state of reasonNullStates) {
			expect(() => validateThreadLinkPair(state, null)).not.toThrow();
			for (const { reason } of reasonRows) {
				expect(() => validateThreadLinkPair(state, reason)).toThrow(
					`threadLink state ${state} requires null reason`,
				);
			}
		}
		for (const state of reasonRequiredStates) {
			expect(() => validateThreadLinkPair(state, null)).toThrow(
				`threadLink state ${state} requires a non-null reason`,
			);
			for (const { reason } of reasonRows) {
				expect(() => validateThreadLinkPair(state, reason)).not.toThrow();
			}
		}
		expect(() => validateThreadLinkPair("unknown", null)).toThrow(
			"threadLink state has unknown unknown",
		);
		expect(() => validateThreadLinkPair("inspect_only", "unknown")).toThrow(
			"threadLink reason has unknown unknown",
		);
	});

	test("rejects every canonical object and union drift", () => {
		expectObjectSurfaceAttacks(
			cloneCanonical,
			(root) => root,
			validateCanonicalContext,
			"canonical root fields",
			canonicalRootFields,
		);
		expectObjectSurfaceAttacks(
			cloneCanonical,
			(root) => record(root.threadLink, "canonical threadLink"),
			validateCanonicalContext,
			"canonical threadLink fields",
			canonicalThreadLinkFields,
		);
		expectObjectSurfaceAttacks(
			cloneCanonical,
			(root) => record(root.operation, "canonical operation"),
			validateCanonicalContext,
			"canonical operation fields",
			canonicalOperationFields,
		);
		const schema = cloneCanonical();
		schema.schema = 2;
		expect(() => validateCanonicalContext(schema)).toThrow("canonical schema changed");
		const id = cloneCanonical();
		record(id.operation, "canonical operation").id = "<wrong>";
		expect(() => validateCanonicalContext(id)).toThrow("canonical operation.id changed");

		for (const [field, label, expected] of [
			["state", "canonical state union", threadLinkStates],
			["reason", "canonical reason union", [...reasonRows.map((row) => row.reason), "null"]],
		] as const) {
			expectOrderedSetAttacks(
				cloneCanonical,
				unionValues(canonicalLink, field, label),
				validateCanonicalContext,
				label,
				expected,
			);
		}
		for (const [field, label, expected] of [
			["kind", "canonical kind union", [...producerRows.map((row) => row.kind), "null"]],
			["rpc", "canonical rpc union", ["turn/start", "turn/steer", "null"]],
			[
				"outcome",
				"canonical outcome union",
				["delivered", "not_delivered", "outcome_unknown", "null"],
			],
		] as const) {
			expectOrderedSetAttacks(
				cloneCanonical,
				unionValues(canonicalOperation, field, label),
				validateCanonicalContext,
				label,
				expected,
			);
		}
	});

	test("rejects every manifest object and ordered-set drift", () => {
		expectObjectSurfaceAttacks(
			cloneManifest,
			(root) => root,
			validateManifest,
			"manifest fields",
			manifestRootFields,
		);
		expectObjectSurfaceAttacks(
			cloneManifest,
			linkPolicy,
			validateManifest,
			"threadLink policy fields",
			linkPolicyFields,
		);
		expectObjectSurfaceAttacks(
			cloneManifest,
			operationPolicy,
			validateManifest,
			"operation policy fields",
			operationPolicyFields,
		);
		const manifestSchema = cloneManifest();
		manifestSchema.schema = 2;
		expect(() => validateManifest(manifestSchema)).toThrow("manifest schema changed");
		const classificationTarget = cloneManifest();
		linkPolicy(classificationTarget).classificationTarget = "recent_thread";
		expect(() => validateManifest(classificationTarget)).toThrow("classification target changed");
		for (const [field, label, expected] of [
			[
				"exhaustBeforePrecedence",
				"classification exhaustion",
				["thread/list", "thread/loaded/list"],
			],
			[
				"classificationFailures",
				"classification failures",
				["repeated_cursor", "transport_failure", "list_exhaustion_failure"],
			],
			["reasonNullStates", "reason-null states", reasonNullStates],
			["reasonRequiredStates", "reason-required states", reasonRequiredStates],
			["nonExecutableStatuses", "non-executable statuses", ["systemError"]],
		] as const) {
			expectOrderedSetAttacks(
				cloneManifest,
				arrayValues((root) => linkPolicy(root)[field]),
				validateManifest,
				label,
				expected,
			);
		}
		for (const [field, label, expected] of [
			["fieldOrder", "operation field order", ["id", "kind", "rpc", "outcome"]],
			[
				"excludedBoundaries",
				"excluded boundaries",
				["interrupt", "queue", "semantic_injection", "callback_injection", "realtime_transport"],
			],
			[
				"callbackEvents",
				"callback events",
				[
					"accepted",
					"queued",
					"started",
					"progress",
					"attention",
					"completed",
					"failed",
					"outcome_unknown",
				],
			],
			["forbiddenFields", "forbidden fields", ["phase", "status", "event", "source"]],
		] as const) {
			expectOrderedSetAttacks(
				cloneManifest,
				arrayValues((root) => operationPolicy(root)[field]),
				validateManifest,
				label,
				expected,
			);
		}
	});

	test("rejects every row, row-field, and tuple-state drift", () => {
		for (const [select, expected, key, unknown, label] of rowCases) {
			expectRowCollectionAttacks(select, expected, key, unknown, label);
			expectRowFieldAttacks(select, expected, key, label);
		}
		for (const [index, row] of tupleRows.entries()) {
			for (const field of ["id", "kind", "rpc", "outcome"]) {
				const changed = cloneManifest();
				tuples(changed)[index]![field] = "wrong_nullability";
				expect(() => validateManifest(changed)).toThrow(
					`tuple states ${row.state}.${field} changed`,
				);
			}
		}
	});

	test("rejects every producer and evidence RPC-set drift", () => {
		for (const [index, row] of producerRows.entries()) {
			for (const field of ["rpcs", "omitWhen"] as const) {
				expectOrderedSetAttacks(
					cloneManifest,
					arrayValues((root) => producers(root)[index]![field]),
					validateManifest,
					`operation producers ${row.kind}.${field}`,
					row[field],
				);
			}
			const source = cloneManifest();
			producers(source)[index]!.operationIdSource = "wrong_source";
			expect(() => validateManifest(source)).toThrow(
				`operation producers ${row.kind}.operationIdSource changed`,
			);
		}
		for (const [index, row] of evidenceRows.entries()) {
			expectOrderedSetAttacks(
				cloneManifest,
				arrayValues((root) => evidence(root)[index]!.rpcs),
				validateManifest,
				`turn evidence ${evidenceKey(row)}.rpcs`,
				row.rpcs,
			);
		}
		const startedAsSteer = cloneManifest();
		evidence(startedAsSteer)[0]!.rpcs = ["turn/start", "turn/steer"];
		expect(() => validateManifest(startedAsSteer)).toThrow(
			"turn evidence turn/started:-.rpcs has extra turn/steer",
		);
		for (const index of [2, 3, 4]) {
			const missingSteer = cloneManifest();
			evidence(missingSteer)[index]!.rpcs = ["turn/start"];
			expect(() => validateManifest(missingSteer)).toThrow(
				`turn evidence ${evidenceKey(evidenceRows[index]!)}.rpcs is missing turn/steer`,
			);
		}
	});

	test("rejects lifecycle downgrade, premature clear, retry, and inference", () => {
		for (const index of [2, 3, 4]) {
			const downgraded = cloneManifest();
			evidence(downgraded)[index]!.outcome = "not_delivered";
			expect(() => validateManifest(downgraded)).toThrow(
				`turn evidence ${evidenceKey(evidenceRows[index]!)}.outcome changed`,
			);
		}
		expectObjectSurfaceAttacks(
			cloneManifest,
			(root) => record(operationPolicy(root).terminal, "terminal policy"),
			validateManifest,
			"terminal policy fields",
			["emit", "clear", "clearFields"],
		);
		expectObjectSurfaceAttacks(
			cloneManifest,
			(root) => record(operationPolicy(root).threadStartOutcomeUnknown, "thread/start uncertainty"),
			validateManifest,
			"thread/start uncertainty fields",
			["linkState", "reason", "inferFromRecency"],
		);
		expectOrderedSetAttacks(
			cloneManifest,
			arrayValues((root) => record(operationPolicy(root).terminal, "terminal").clearFields),
			validateManifest,
			"terminal policy.clearFields",
			["id", "kind", "rpc", "outcome"],
		);
		for (const [field, value] of [
			["emit", "repeated"],
			["clear", "before_terminal_callback_or_event"],
		] as const) {
			const changed = cloneManifest();
			record(operationPolicy(changed).terminal, "terminal")[field] = value;
			expect(() => validateManifest(changed)).toThrow(`terminal policy.${field} changed`);
		}
		for (const [field, value] of [
			["linkState", "executable"],
			["reason", "unknown_reason"],
		] as const) {
			const changed = cloneManifest();
			record(operationPolicy(changed).threadStartOutcomeUnknown, "uncertainty")[field] = value;
			expect(() => validateManifest(changed)).toThrow(`thread/start uncertainty.${field} changed`);
		}
		const retried = cloneManifest();
		operationPolicy(retried).retryAfterOutcomeUnknown = true;
		expect(() => validateManifest(retried)).toThrow("retry after outcome_unknown changed");
		const inferredLink = cloneManifest();
		linkPolicy(inferredLink).inferThreadFromRecency = true;
		expect(() => validateManifest(inferredLink)).toThrow("threadLink recency inference changed");
		const inferredStart = cloneManifest();
		record(
			operationPolicy(inferredStart).threadStartOutcomeUnknown,
			"uncertainty",
		).inferFromRecency = true;
		expect(() => validateManifest(inferredStart)).toThrow(
			"thread/start uncertainty.inferFromRecency changed",
		);
	});

	test("rejects classifier failure promotion and producer omission drift", () => {
		for (const failure of ["repeated_cursor", "transport_failure", "list_exhaustion_failure"]) {
			const stabilized = cloneManifest();
			reasons(stabilized).push({ reason: failure, condition: "classification_failed" });
			expect(() => validateManifest(stabilized)).toThrow(`threadLink reasons has extra ${failure}`);
		}
		for (const kind of ["create_thread_initial_turn", "fork_thread_initial_turn"]) {
			const changed = cloneManifest();
			const producer = producers(changed).find((row) => row.kind === kind)!;
			producer.operationIdSource = "outer_operation_id";
			expect(() => validateManifest(changed)).toThrow(
				`operation producers ${kind}.operationIdSource changed`,
			);
		}
		const promptlessFork = cloneManifest();
		producers(promptlessFork).find((row) => row.kind === "fork_thread_initial_turn")!.omitWhen = [];
		expect(() => validateManifest(promptlessFork)).toThrow(
			"operation producers fork_thread_initial_turn.omitWhen is missing prompt_absent",
		);
		const queuedDelegate = cloneManifest();
		producers(queuedDelegate).find((row) => row.kind === "delegate_to_workhorse")!.omitWhen = [];
		expect(() => validateManifest(queuedDelegate)).toThrow(
			"operation producers delegate_to_workhorse.omitWhen is missing queued",
		);
	});
});
