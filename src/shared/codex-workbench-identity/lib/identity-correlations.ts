// Correlations: closed records that tie several identities to one child epoch,
// and the checks that make a decoded record trustworthy (every field present,
// nothing extra, everything issued here, nothing stale).

import {
	fail,
	parseEpochValue,
	parseValue,
	type ChildEpoch,
	type ChildId,
	type DynamicToolCallId,
	type IdentityDomain,
	type IdentityValue,
	type JsonRpcRequestId,
	type ThreadId,
	type TurnId,
} from "@/shared/codex-workbench-identity/lib/identity-values";

const TEXT_LIMIT = 256;

interface WireRequestCorrelation {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId;
}

interface LogicalToolCallCorrelation {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: string;
	readonly tool: string;
	readonly manifestHash: string;
}

interface WireRequestCorrelationInput {
	readonly requestId: JsonRpcRequestId;
}

interface LogicalToolCallCorrelationInput {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: string;
	readonly tool: string;
	readonly manifestHash: string;
}

const CORRELATION_KEYS = ["child", "epoch", "requestId"] as const;
const TOOL_CORRELATION_KEYS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const;

/**
 * Stable identity for one logical dynamic-tool call across wire retries and owners.
 * @param call - The correlation to key.
 * @returns A JSON array of every field, in declaration order, as one string.
 */
function logicalToolCallKey(call: LogicalToolCallCorrelation): string {
	return JSON.stringify([
		call.child,
		call.epoch,
		call.threadId,
		call.turnId,
		call.callId,
		call.namespace,
		call.tool,
		call.manifestHash,
	]);
}

/**
 * Tells whether a value is a non-array object, so its keys can be read.
 * @param value - The untrusted value.
 * @returns True for a plain record shape.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Refuses a record that carries any key, string or symbol, outside `keys`.
 * @param record - The record to inspect.
 * @param keys - The only keys allowed.
 * @throws {IdentityValidationError} As `extra-field` when another key is present.
 */
function assertOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): void {
	for (const key of Reflect.ownKeys(record)) {
		if (typeof key !== "string" || !keys.includes(key)) {
			fail("extra-field", "An identity correlation contains an unexpected field.");
		}
	}
}

/**
 * Refuses a record missing any of `keys` as an own property.
 * @param record - The record to inspect.
 * @param keys - The keys that must all be present.
 * @throws {IdentityValidationError} As `invalid-shape` naming the first missing key.
 */
function assertAllKeys(record: Record<string, unknown>, keys: readonly string[]): void {
	for (const key of keys) {
		if (!Object.prototype.hasOwnProperty.call(record, key)) {
			fail("invalid-shape", `Missing correlation field "${key}".`);
		}
	}
}

/**
 * Narrows an untrusted value to a record with exactly the given keys.
 * @param value - The untrusted value.
 * @param keys - The complete key set the record must have.
 * @returns The value as a record.
 * @throws {IdentityValidationError} When it is not a record or its key set differs.
 */
function requireRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (!isRecord(value)) {
		return fail("invalid-shape", "An identity correlation must be a record.");
	}
	assertOnlyKeys(value, keys);
	assertAllKeys(value, keys);
	return value;
}

/**
 * Validates a bounded text field of a correlation: non-empty, trimmed, short,
 * and free of NUL.
 * @param value - The untrusted value.
 * @param field - The field name, for the error message.
 * @returns The text unchanged.
 * @throws {IdentityValidationError} As `invalid-field` when the text is unacceptable.
 */
function assertText(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.trim() !== value ||
		value.length > TEXT_LIMIT
	) {
		return fail("invalid-field", `${field} must be a non-empty bounded string.`);
	}
	if (value.includes("\0")) {
		return fail("invalid-field", `${field} must not contain NUL.`);
	}
	return value;
}

/**
 * Refuses a correlation that names another child or an earlier epoch.
 * @param child - The child the correlation names.
 * @param epoch - The epoch the correlation names.
 * @param currentChild - This session's child.
 * @param currentEpoch - This session's epoch.
 * @throws {IdentityValidationError} As `wrong-child` or `stale-epoch`.
 */
function assertCurrent(
	child: ChildId,
	epoch: ChildEpoch,
	currentChild: ChildId,
	currentEpoch: ChildEpoch,
): void {
	if (child !== currentChild) {
		fail("wrong-child", "The correlation belongs to another child.");
	}
	if (epoch !== currentEpoch) {
		fail("stale-epoch", "The correlation belongs to a stale child epoch.");
	}
}

/**
 * Refuses an identity this session never issued, whatever its shape.
 * @param value - The branded identity.
 * @param domain - Its domain.
 * @param issued - The issuance ledger, by domain.
 * @throws {IdentityValidationError} As `unissued` when the ledger lacks it.
 */
function assertIssued<Domain extends IdentityDomain>(
	value: IdentityValue<Domain>,
	domain: Domain,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): void {
	if (!issued.get(domain)?.has(value)) {
		fail("unissued", `The ${domain} identity was not issued by this workbench session.`, domain);
	}
}

/**
 * Decodes a wire request correlation and proves every part of it current
 * and issued here.
 * @param value - The untrusted record.
 * @param childId - This session's child.
 * @param epoch - This session's epoch.
 * @param issued - The issuance ledger, by domain.
 * @returns The frozen correlation.
 * @throws {IdentityValidationError} When any field is malformed, foreign, stale or unissued.
 */
function parseWireRequestCorrelationValue(
	value: unknown,
	childId: ChildId,
	epoch: ChildEpoch,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): WireRequestCorrelation {
	const record = requireRecord(value, CORRELATION_KEYS);
	const child = parseValue(record["child"], "child");
	const parsedEpoch = parseEpochValue(record["epoch"], child);
	const requestId = parseValue(record["requestId"], "json-rpc-request");
	assertCurrent(child, parsedEpoch, childId, epoch);
	assertIssued(child, "child", issued);
	assertIssued(parsedEpoch, "epoch", issued);
	assertIssued(requestId, "json-rpc-request", issued);
	return Object.freeze({ child, epoch: parsedEpoch, requestId });
}

/**
 * Decodes a logical tool-call correlation and proves every identity in it
 * current and issued here, and every text field bounded.
 * @param value - The untrusted record.
 * @param childId - This session's child.
 * @param epoch - This session's epoch.
 * @param issued - The issuance ledger, by domain.
 * @returns The frozen correlation.
 * @throws {IdentityValidationError} When any field is malformed, foreign, stale or unissued.
 */
function parseLogicalToolCallCorrelationValue(
	value: unknown,
	childId: ChildId,
	epoch: ChildEpoch,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): LogicalToolCallCorrelation {
	const record = requireRecord(value, TOOL_CORRELATION_KEYS);
	const child = parseValue(record["child"], "child");
	const parsedEpoch = parseEpochValue(record["epoch"], child);
	const threadId = parseValue(record["threadId"], "thread");
	const turnId = parseValue(record["turnId"], "turn");
	const callId = parseValue(record["callId"], "dynamic-tool-call");
	assertCurrent(child, parsedEpoch, childId, epoch);
	assertIssued(child, "child", issued);
	assertIssued(parsedEpoch, "epoch", issued);
	assertIssued(threadId, "thread", issued);
	assertIssued(turnId, "turn", issued);
	assertIssued(callId, "dynamic-tool-call", issued);
	return Object.freeze({
		child,
		epoch: parsedEpoch,
		threadId,
		turnId,
		callId,
		namespace: assertText(record["namespace"], "namespace"),
		tool: assertText(record["tool"], "tool"),
		manifestHash: assertText(record["manifestHash"], "manifestHash"),
	});
}

export {
	type WireRequestCorrelation,
	type LogicalToolCallCorrelation,
	type WireRequestCorrelationInput,
	type LogicalToolCallCorrelationInput,
	logicalToolCallKey,
	assertText,
	assertCurrent,
	assertIssued,
	parseWireRequestCorrelationValue,
	parseLogicalToolCallCorrelationValue,
};
