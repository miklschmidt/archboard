import type { EpochExecutionProof, EpochOperationRecord } from "../../codex-epoch/index.js";
import type { ThreadLinkEpochProof } from "../../codex-thread-link/index.js";
import type { CoordinatorCallback, CoordinatorCallbackCorrelation } from "./contract.js";

export const CALLBACK_MAX_UTF8_BYTES = 32_768;
export const CALLBACK_MAX_STRING_UTF8_BYTES = 8_192;
export const CALLBACK_MAX_ARRAY_ENTRIES = 128;
export const CALLBACK_MAX_ID_UTF8_BYTES = 1_024;
export const CALLBACK_MAX_SELECTION_ID_UTF8_BYTES = 64;
const CALLBACK_SCHEMA = 1;
const encoder = new TextEncoder();

function requireExactKeys(value: object, expected: readonly string[]): void {
	const actual = Object.keys(value).toSorted();
	const keys = [...expected].toSorted();
	if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
		throw new TypeError("Callback object does not match its closed schema.");
	}
}

function requireAllowedKeys(value: object, allowed: readonly string[]): void {
	if (Object.keys(value).some((key) => !allowed.includes(key))) {
		throw new TypeError("Callback object contains an unknown key.");
	}
}

function utf8(value: string): number {
	return encoder.encode(value).byteLength;
}

function requireString(value: string | null): string | null {
	if (value !== null && (value.length === 0 || utf8(value) > CALLBACK_MAX_STRING_UTF8_BYTES)) {
		throw new TypeError("Callback string exceeds its UTF-8 limit.");
	}
	return value;
}

function requireId(value: string | null): string | null {
	const checked = requireString(value);
	if (checked !== null && utf8(checked) > CALLBACK_MAX_ID_UTF8_BYTES) {
		throw new TypeError("Callback ID exceeds its UTF-8 limit.");
	}
	return checked;
}

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

function callbackDocument(callback: CoordinatorCallback) {
	if (callback.kind === "operation") {
		requireExactKeys(callback, [
			"kind",
			"type",
			"operation",
			"queueOperation",
			"rpc",
			"outcome",
			"correlation",
			"queuedSubmissionIds",
			"detail",
		]);
		if (
			![
				"accepted",
				"queued",
				"started",
				"progress",
				"attention",
				"completed",
				"failed",
				"outcome_unknown",
			].includes(callback.type)
		) {
			throw new TypeError("Unknown operation callback discriminant.");
		}
		if (
			!["delegate_to_workhorse", "manage_workhorse_queue", "steer_workhorse"].includes(
				callback.operation,
			)
		) {
			throw new TypeError("Unknown callback operation.");
		}
		const expectedOutcome =
			callback.type === "accepted"
				? "pending"
				: callback.type === "outcome_unknown"
					? "outcome_unknown"
					: callback.type === "failed"
						? callback.outcome
						: "delivered";
		if (callback.outcome !== expectedOutcome) {
			throw new TypeError("Operation callback discriminant and outcome do not match.");
		}
		if (callback.operation === "manage_workhorse_queue") {
			const expectedRpc = queueRpc(callback.queueOperation);
			if (expectedRpc === null || callback.rpc !== expectedRpc) {
				throw new TypeError("Operation callback queue tuple does not match.");
			}
		} else if (callback.queueOperation !== null) {
			throw new TypeError("Non-queue callback has a queue operation.");
		}
		if (callback.operation === "delegate_to_workhorse" && callback.rpc !== "turn/start") {
			throw new TypeError("Delegate callback RPC does not match.");
		}
		if (callback.operation === "steer_workhorse" && callback.rpc !== "turn/steer") {
			throw new TypeError("Steer callback RPC does not match.");
		}
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

export function encodeCoordinatorCallback(callback: CoordinatorCallback): string {
	const text = canonicalJson(callbackDocument(callback));
	if (utf8(text) > CALLBACK_MAX_UTF8_BYTES) {
		throw new TypeError("Callback exceeds its UTF-8 message limit.");
	}
	return text;
}
