import type { EpochExecutionProof, EpochOperationRecord } from "@/runtime/codex-epoch";
import type { ThreadLinkEpochProof } from "@/runtime/codex-thread-link";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

const CALLBACK_MAX_UTF8_BYTES = 32_768;
const CALLBACK_MAX_STRING_UTF8_BYTES = 8_192;
const CALLBACK_MAX_ARRAY_ENTRIES = 128;
const CALLBACK_MAX_ID_UTF8_BYTES = 1_024;
const CALLBACK_MAX_SELECTION_ID_UTF8_BYTES = 64;
const CALLBACK_SCHEMA = 1;
const encoder = new TextEncoder();

/**
 * Refuse an object that does not carry exactly the keys the closed callback schema declares, so a field added upstream cannot travel to the coordinator unreviewed.
 * @param value - The object to check.
 * @param expected - Every key the schema declares.
 */
function requireExactKeys(value: object, expected: readonly string[]): void {
	const actual = Object.keys(value).toSorted();
	const keys = [...expected].toSorted();
	if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
		throw new TypeError("Callback object does not match its closed schema.");
	}
}

/**
 * Refuse an object carrying a key the schema does not allow, where some declared keys are optional.
 * @param value - The object to check.
 * @param allowed - The keys the schema permits.
 */
function requireAllowedKeys(value: object, allowed: readonly string[]): void {
	if (Object.keys(value).some((key) => !allowed.includes(key))) {
		throw new TypeError("Callback object contains an unknown key.");
	}
}

/**
 * The encoded size of a string, which is what every callback limit is measured in.
 * @param value - The string to measure.
 * @returns Its length in UTF-8 bytes.
 */
function utf8(value: string): number {
	return encoder.encode(value).byteLength;
}

/**
 * Refuse an empty or oversized string; a present field is never the empty string in an encoded callback.
 * @param value - The string, or null when the field is absent.
 * @returns The same value.
 * @throws {TypeError} When the string is empty or exceeds the per-string limit.
 */
function requireString(value: string | null): string | null {
	if (value !== null && (value.length === 0 || utf8(value) > CALLBACK_MAX_STRING_UTF8_BYTES)) {
		throw new TypeError("Callback string exceeds its UTF-8 limit.");
	}
	return value;
}

/**
 * Refuse an identity that exceeds the tighter identity limit.
 * @param value - The identity, or null.
 * @returns The same value.
 * @throws {TypeError} When the identity is empty or too long.
 */
function requireId(value: string | null): string | null {
	const checked = requireString(value);
	if (checked !== null && utf8(checked) > CALLBACK_MAX_ID_UTF8_BYTES) {
		throw new TypeError("Callback ID exceeds its UTF-8 limit.");
	}
	return checked;
}

/**
 * Refuse a list that is too long or holds an empty, null or oversized entry.
 * @param values - The list to check.
 * @param entryBytes - The per-entry byte limit.
 * @returns The checked entries.
 * @throws {TypeError} When the list or one of its entries exceeds its limit.
 */
function requireArray(values: readonly string[], entryBytes: number): readonly string[] {
	if (values.length > CALLBACK_MAX_ARRAY_ENTRIES) {
		throw new TypeError("Callback array exceeds its entry limit.");
	}
	return values.map((value) => {
		const checked = requireString(value);
		if (checked === null) {
			throw new TypeError("Callback array entries cannot be null.");
		}
		if (utf8(checked) > entryBytes) {
			throw new TypeError("Callback array entry exceeds its UTF-8 limit.");
		}
		return checked;
	});
}

/**
 * The wire RPC one queue operation is delivered by; the pair is checked so a callback cannot claim a queue operation its RPC does not match.
 * @param operation - The queue operation named by the callback.
 * @returns The RPC, or null when the operation is not a queue operation.
 */
function queueRpc(operation: unknown): string | null {
	switch (operation) {
		case "add":
			return "thread/queue/add";
		case "update":
			return "thread/queue/update";
		case "delete":
			return "thread/queue/delete";
		case "reorder":
			return "thread/queue/reorder";
		case "start":
			return "thread/queue/start";
		default:
			return null;
	}
}

/**
 * Encode one epoch operation record: the durable proof of what was attempted, with every string checked against its limit.
 * @param record - The epoch record.
 * @returns The encodable record.
 */
function operationRecord(record: EpochOperationRecord) {
	return {
		correlation: {
			childId: record.correlation.childId,
			epoch: record.correlation.epoch,
			operationId: requireString(record.correlation.operationId),
		},
		operation: {
			id: requireString(record.operation.id),
			kind: requireString(record.operation.kind),
			rpc: requireString(record.operation.rpc),
		},
		status: record.status,
		outcome: record.outcome,
		provenance: {
			childId: record.provenance.childId,
			epoch: record.provenance.epoch,
			threadId: requireString(record.provenance.threadId),
			turnId: requireString(record.provenance.turnId),
			threadSource: requireString(record.provenance.threadSource),
			workspaceRoot: requireString(record.provenance.workspaceRoot),
			instructionHash: requireString(record.provenance.instructionHash),
			manifestHash: requireString(record.provenance.manifestHash),
			confirmedAtMs: record.provenance.confirmedAtMs,
		},
		reason: requireString(record.reason),
		createdAtMs: record.createdAtMs,
		updatedAtMs: record.updatedAtMs,
	};
}

/**
 * Encode a thread-link epoch proof, which is either an execution proof carrying a manifest revision or a bare record.
 * @param value - The proof, or null or undefined when there is none.
 * @returns The encodable proof, or null.
 */
function proof(value: ThreadLinkEpochProof | null | undefined) {
	if (value === null || value === undefined) {
		return null;
	}
	if ("record" in value) {
		const execution: EpochExecutionProof = value;
		return {
			manifestRevision: execution.manifestRevision,
			record: operationRecord(execution.record),
		};
	}
	return { manifestRevision: null, record: operationRecord(value) };
}

/**
 * Encode a callback's correlation against the closed schema: it proves the shape of the correlation, the captured link and the voice generation before any of it is serialized.
 * @param value - The callback correlation.
 * @returns The encodable correlation.
 */
function correlation(value: CoordinatorCallbackCorrelation) {
	requireExactKeys(value, [
		"operationId",
		"childId",
		"epoch",
		"coordinatorThreadId",
		"coordinatorTurnId",
		"workhorseThreadId",
		"turnId",
		"queuedSubmissionId",
		"clientUserMessageId",
		"realtimeSessionId",
		"coordinatorCall",
		"workhorseLink",
		"realtimeGeneration",
	]);
	const call = value.coordinatorCall;
	const captured = value.workhorseLink;
	const generation = value.realtimeGeneration;
	requireExactKeys(captured, ["binding", "target"]);
	requireExactKeys(captured.binding, ["paneId", "revision", "link", "cas"]);
	requireAllowedKeys(captured.target, [
		"threadId",
		"childId",
		"epoch",
		"operationId",
		"provenance",
	]);
	if (call !== null) {
		requireExactKeys(call, [
			"child",
			"epoch",
			"threadId",
			"turnId",
			"callId",
			"namespace",
			"tool",
			"manifestHash",
		]);
	}
	if (generation !== null) {
		requireExactKeys(generation, [
			"childId",
			"epoch",
			"coordinatorThreadId",
			"wireSessionId",
			"browserSessionId",
			"browserCorrelationId",
		]);
	}
	return {
		operationId: requireString(value.operationId),
		childId: value.childId,
		epoch: value.epoch,
		coordinatorThreadId: requireString(value.coordinatorThreadId),
		coordinatorTurnId: requireString(value.coordinatorTurnId),
		workhorseThreadId: requireString(value.workhorseThreadId),
		turnId: requireString(value.turnId),
		queuedSubmissionId: requireId(value.queuedSubmissionId),
		clientUserMessageId: requireString(value.clientUserMessageId),
		realtimeSessionId: requireString(value.realtimeSessionId),
		coordinatorCall:
			call === null
				? null
				: {
						child: call.child,
						epoch: call.epoch,
						threadId: requireString(call.threadId),
						turnId: requireString(call.turnId),
						callId: requireString(call.callId),
						namespace: requireString(call.namespace),
						tool: requireString(call.tool),
						manifestHash: requireString(call.manifestHash),
					},
		workhorseLink: {
			paneId: requireString(captured.binding.paneId),
			revision: captured.binding.revision,
			state: captured.binding.link.state,
			threadId: requireString(captured.binding.link.threadId),
			childId: captured.binding.link.childId,
			epoch: captured.binding.link.epoch,
			source: captured.binding.link.source,
			status: captured.binding.link.status,
			loaded: captured.binding.link.loaded,
			canAcceptDirectInput: captured.binding.link.canAcceptDirectInput,
			reason: captured.binding.link.reason,
			target: {
				threadId: requireString(captured.target.threadId),
				childId: captured.target.childId,
				epoch: captured.target.epoch,
				operationId: requireString(captured.target.operationId ?? null),
				provenance: proof(captured.target.provenance),
			},
		},
		realtimeGeneration:
			generation === null
				? null
				: {
						childId: generation.childId,
						epoch: generation.epoch,
						coordinatorThreadId: requireString(generation.coordinatorThreadId),
						wireSessionId: requireString(generation.wireSessionId),
						browserSessionId: requireString(generation.browserSessionId),
						browserCorrelationId: requireString(generation.browserCorrelationId),
					},
	};
}

/** The keys an operation callback carries, exactly. */
const OPERATION_CALLBACK_KEYS: readonly string[] = [
	"kind",
	"type",
	"operation",
	"queueOperation",
	"rpc",
	"outcome",
	"correlation",
	"queuedSubmissionIds",
	"detail",
];

/** The reviewed operation callback discriminants. */
const OPERATION_CALLBACK_TYPES: ReadonlySet<string> = new Set([
	"accepted",
	"queued",
	"started",
	"progress",
	"attention",
	"completed",
	"failed",
	"outcome_unknown",
]);

/** The three workhorse operations a callback may report. */
const CALLBACK_OPERATIONS: ReadonlySet<string> = new Set([
	"delegate_to_workhorse",
	"manage_workhorse_queue",
	"steer_workhorse",
]);

/**
 * Refuse an operation callback whose outcome does not follow from its type: only `failed` chooses
 * its own outcome, and every other type asserts one fixed outcome.
 * @param callback - The operation callback.
 */
function assertOutcomeMatchesType(
	callback: Extract<CoordinatorCallback, { kind: "operation" }>,
): void {
	const expected =
		callback.type === "accepted"
			? "pending"
			: callback.type === "outcome_unknown"
				? "outcome_unknown"
				: callback.type === "failed"
					? callback.outcome
					: "delivered";
	if (callback.outcome !== expected) {
		throw new TypeError("Operation callback discriminant and outcome do not match.");
	}
}

/** The wire RPC each turn-level operation is delivered by. */
const TURN_RPC_BY_OPERATION: Readonly<Record<"delegate_to_workhorse" | "steer_workhorse", string>> =
	Object.freeze({
		delegate_to_workhorse: "turn/start",
		steer_workhorse: "turn/steer",
	});

/**
 * Refuse an operation callback whose wire RPC does not follow from its operation, and a non-queue
 * callback that nevertheless names a queue operation.
 * @param callback - The operation callback.
 */
function assertRpcMatchesOperation(
	callback: Extract<CoordinatorCallback, { kind: "operation" }>,
): void {
	if (callback.operation === "manage_workhorse_queue") {
		if (callback.rpc !== queueRpc(callback.queueOperation)) {
			throw new TypeError("Operation callback queue tuple does not match.");
		}
		return;
	}
	if (callback.queueOperation !== null) {
		throw new TypeError("Non-queue callback has a queue operation.");
	}
	if (callback.rpc !== TURN_RPC_BY_OPERATION[callback.operation]) {
		throw new TypeError("Turn callback RPC does not match its operation.");
	}
}

/**
 * Encode an operation callback as its closed document, refusing anything whose type, outcome,
 * operation and RPC do not agree with each other.
 * @param callback - The normalized operation callback.
 * @returns The encodable document.
 */
function operationCallbackDocument(callback: Extract<CoordinatorCallback, { kind: "operation" }>) {
	requireExactKeys(callback, OPERATION_CALLBACK_KEYS);
	if (!OPERATION_CALLBACK_TYPES.has(callback.type)) {
		throw new TypeError("Unknown operation callback discriminant.");
	}
	if (!CALLBACK_OPERATIONS.has(callback.operation)) {
		throw new TypeError("Unknown callback operation.");
	}
	assertOutcomeMatchesType(callback);
	assertRpcMatchesOperation(callback);
	return {
		schema: CALLBACK_SCHEMA,
		kind: callback.kind,
		type: callback.type,
		operation: callback.operation,
		queueOperation: callback.queueOperation,
		rpc: callback.rpc,
		outcome: callback.outcome,
		correlation: correlation(callback.correlation),
		queuedSubmissionIds: requireArray(callback.queuedSubmissionIds, CALLBACK_MAX_ID_UTF8_BYTES),
		detail: requireString(callback.detail),
	};
}

/**
 * Encode one normalized callback as the closed document that goes on the wire, refusing anything
 * whose fields do not agree with each other.
 * @param callback - The normalized callback.
 * @returns The encodable document.
 */
function callbackDocument(callback: CoordinatorCallback) {
	if (callback.kind === "operation") {
		return operationCallbackDocument(callback);
	}
	requireExactKeys(callback, [
		"kind",
		"type",
		"correlation",
		"threadLinkState",
		"threadLinkReason",
		"semantic",
	]);
	if (!["change", "focus", "selection"].includes(callback.type)) {
		throw new TypeError("Unknown semantic callback discriminant.");
	}
	requireExactKeys(callback.semantic, [
		"feedId",
		"sequence",
		"origin",
		"significance",
		"brief",
		"capturedAtMs",
		"freshUntilMs",
		"paneId",
		"focused",
		"selection",
		"detail",
	]);
	return {
		schema: CALLBACK_SCHEMA,
		kind: callback.kind,
		type: callback.type,
		correlation: correlation(callback.correlation),
		threadLinkState: callback.threadLinkState,
		threadLinkReason: requireString(callback.threadLinkReason),
		semantic: {
			feedId: requireString(callback.semantic.feedId),
			sequence: callback.semantic.sequence,
			origin: callback.semantic.origin,
			significance: callback.semantic.significance,
			brief: requireString(callback.semantic.brief),
			capturedAtMs: callback.semantic.capturedAtMs,
			paneId: requireString(callback.semantic.paneId),
			focused: callback.semantic.focused,
			selection: requireArray(callback.semantic.selection, CALLBACK_MAX_SELECTION_ID_UTF8_BYTES),
			detail: requireString(callback.semantic.detail),
		},
	};
}

/**
 * Serialize a value with object keys in sorted order, so the same callback always produces byte-identical text and can be compared and deduplicated as a string.
 * @param value - The value to serialize.
 * @returns The canonical JSON text.
 */
function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
	return `{${entries
		.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
		.join(",")}}`;
}

/**
 * Encode one callback as the canonical JSON the coordinator receives, refusing anything past the message limit rather than truncating it.
 * @param callback - The normalized callback.
 * @returns The canonical JSON text.
 * @throws {TypeError} When the encoded callback exceeds its UTF-8 message limit.
 */
function encodeCoordinatorCallback(callback: CoordinatorCallback): string {
	const text = canonicalJson(callbackDocument(callback));
	if (utf8(text) > CALLBACK_MAX_UTF8_BYTES) {
		throw new TypeError("Callback exceeds its UTF-8 message limit.");
	}
	return text;
}

export {
	CALLBACK_MAX_UTF8_BYTES,
	CALLBACK_MAX_STRING_UTF8_BYTES,
	CALLBACK_MAX_ARRAY_ENTRIES,
	CALLBACK_MAX_ID_UTF8_BYTES,
	CALLBACK_MAX_SELECTION_ID_UTF8_BYTES,
	encodeCoordinatorCallback,
};
