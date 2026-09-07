import type { ChildEpoch, ChildId } from "@/shared/codex-workbench-identity";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/errors";
import { encodeJsonText } from "@/runtime/codex-dynamic-tools/lib/text-bounds";
import {
	hasExactKeys,
	isNonEmptyString,
	isRecord,
} from "@/runtime/codex-dynamic-tools/lib/value-shape";

type DynamicCursorDirection = "asc" | "desc" | "event";

interface DynamicCursorBinding {
	readonly schema: 1;
	readonly child: string;
	readonly epoch: string;
	readonly method: string;
	readonly direction: DynamicCursorDirection;
	readonly query: string;
	readonly cursor: string | null;
	readonly sequence: number;
}

interface DynamicCursorIdentity {
	readonly child: string;
	readonly epoch: string;
	readonly method: string;
}

interface DynamicCursorPosition {
	readonly direction: DynamicCursorDirection;
	readonly query: string;
	readonly cursor: string | null;
	readonly sequence: number;
}

interface ExpectedCursorBinding {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly method: string;
	readonly direction: DynamicCursorDirection;
	readonly query: unknown;
}

const CURSOR_KEYS = Object.freeze([
	"schema",
	"child",
	"epoch",
	"method",
	"direction",
	"query",
	"cursor",
	"sequence",
] as const);
const CURSOR_QUERY_MAX_UTF8_BYTES = 16_384;
const CURSOR_MAX_UTF8_BYTES = 1_024;

/**
 * Build the refusal for an invalid cursor; cursors are caller input, so every
 * failure is an invalid call.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The refusal error.
 */
function failure(message: string, cause?: unknown): CodexDynamicToolsError {
	return new CodexDynamicToolsError("invalid_call", message, cause);
}

/**
 * Whether a value is one of the three cursor directions.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a cursor direction.
 */
function isCursorDirection(value: unknown): value is DynamicCursorDirection {
	return value === "asc" || value === "desc" || value === "event";
}

/**
 * Whether a value is a legal inner cursor: null or a non-empty string.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a legal inner cursor.
 */
function isCursorValue(value: unknown): value is string | null {
	return value === null || isNonEmptyString(value);
}

/**
 * Whether a value is a legal event sequence: a non-negative safe integer.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a legal sequence.
 */
function isSequence(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Encode text as unpadded base64url, the opaque form a cursor takes on the wire.
 * @param value UTF-8 text to encode.
 * @returns The base64url token.
 */
function base64urlEncode(value: string): string {
	return Buffer.from(value, "utf8")
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

/**
 * Decode an unpadded base64url token, refusing non-canonical encodings and
 * bytes that are not valid UTF-8.
 * @param value Opaque token from the caller.
 * @returns The decoded text.
 */
function base64urlDecode(value: string): string {
	if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
		throw failure("The cursor is not a valid opaque token.");
	}
	try {
		const padded =
			value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
		const bytes = Buffer.from(padded, "base64");
		if (canonicalToken(bytes) !== value) {
			throw failure("The cursor is not a canonical opaque token.");
		}
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) {
			throw error;
		}
		throw failure("The cursor is not valid UTF-8.", error);
	}
}

/**
 * Re-encode decoded bytes as the unpadded base64url token they came from.
 * @param bytes Decoded token bytes.
 * @returns The canonical token for those bytes.
 */
function canonicalToken(bytes: Buffer): string {
	return bytes.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/**
 * Serialize a query as canonical JSON so equal queries produce equal cursors.
 * @param query Query value bound into the cursor.
 * @returns The JSON text.
 */
function canonicalQuery(query: unknown): string {
	let encoded: string | undefined;
	try {
		encoded = encodeJsonText(query);
	} catch (error) {
		throw failure("The cursor query is not JSON-serializable.", error);
	}
	if (encoded === undefined || encoded.length === 0) {
		throw failure("The cursor query must be a JSON value.");
	}
	return encoded;
}

/**
 * Read the child, epoch and method that bind a cursor to one paging context.
 * @param value Exact cursor record.
 * @returns The binding identity.
 */
function bindingIdentity(value: Readonly<Record<string, unknown>>): DynamicCursorIdentity {
	const { child, epoch, method } = value;
	if (!isNonEmptyString(child) || !isNonEmptyString(epoch) || !isNonEmptyString(method)) {
		throw failure("The cursor envelope contains invalid binding fields.");
	}
	return { child, epoch, method };
}

/**
 * Read the direction, query, inner cursor and sequence of a cursor record.
 * @param value Exact cursor record.
 * @returns The binding position.
 */
function bindingPosition(value: Readonly<Record<string, unknown>>): DynamicCursorPosition {
	const { direction, query, cursor, sequence } = value;
	if (
		!isCursorDirection(direction) ||
		!isNonEmptyString(query) ||
		!isCursorValue(cursor) ||
		!isSequence(sequence)
	) {
		throw failure("The cursor envelope contains invalid binding fields.");
	}
	return { direction, query, cursor, sequence };
}

/**
 * Validate a decoded cursor envelope field by field.
 * @param value Decoded JSON value of unknown shape.
 * @returns The frozen, validated binding.
 */
function validateBinding(value: unknown): DynamicCursorBinding {
	if (!isRecord(value) || !hasExactKeys(value, CURSOR_KEYS)) {
		throw failure("The cursor envelope is not exact.");
	}
	if (value["schema"] !== 1) {
		throw failure("The cursor envelope contains invalid binding fields.");
	}
	return Object.freeze({ schema: 1, ...bindingIdentity(value), ...bindingPosition(value) });
}

/**
 * Refuse an identity whose fields are not non-empty strings, even when the
 * static type promised them.
 * @param input Identity fields supplied by the caller.
 */
function assertBindingIdentity(input: DynamicCursorIdentity): void {
	if (
		!isNonEmptyString(input.child) ||
		!isNonEmptyString(input.epoch) ||
		!isNonEmptyString(input.method)
	) {
		throw failure("The cursor binding contains invalid fields.");
	}
}

/**
 * Refuse a position whose direction, inner cursor or sequence is malformed.
 * @param input Position fields supplied by the caller.
 */
function assertBindingPosition(input: Omit<DynamicCursorPosition, "query">): void {
	if (
		!isCursorDirection(input.direction) ||
		!isCursorValue(input.cursor) ||
		!isSequence(input.sequence)
	) {
		throw failure("The cursor binding contains invalid fields.");
	}
}

/**
 * Serialize a query for a cursor and refuse one over the reviewed size bound.
 * @param query Query value bound into the cursor.
 * @returns The bounded canonical JSON text.
 */
function boundedQuery(query: unknown): string {
	const encoded = canonicalQuery(query);
	if (Buffer.byteLength(encoded, "utf8") > CURSOR_QUERY_MAX_UTF8_BYTES) {
		throw failure("The cursor query is too large.");
	}
	return encoded;
}

/**
 * Encode a paging position as an opaque cursor bound to one child epoch,
 * method, direction and query, so it cannot be replayed elsewhere.
 * @param input Binding fields; the query may be any JSON value.
 * @returns The opaque cursor token.
 */
function encodeDynamicCursor(
	input: Omit<DynamicCursorBinding, "schema" | "query"> & {
		readonly query: unknown;
	},
): string {
	assertBindingIdentity(input);
	assertBindingPosition(input);
	const binding: DynamicCursorBinding = Object.freeze({
		schema: 1,
		child: input.child,
		epoch: input.epoch,
		method: input.method,
		direction: input.direction,
		query: boundedQuery(input.query),
		cursor: input.cursor,
		sequence: input.sequence,
	});
	const encoded = base64urlEncode(JSON.stringify(binding));
	if (Buffer.byteLength(encoded, "utf8") > CURSOR_MAX_UTF8_BYTES) {
		throw failure("The cursor exceeds the reviewed size bound.");
	}
	return encoded;
}

/**
 * Parse JSON text from inside a cursor, naming the failure.
 * @param text JSON text.
 * @param message Refusal message when parsing fails.
 * @returns The parsed value.
 */
function parseCursorJson(text: string, message: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		throw failure(message, error);
	}
}

/**
 * Decode and validate an opaque cursor, refusing any envelope or query that is
 * not canonical JSON.
 * @param value Opaque cursor token from the caller.
 * @returns The validated binding.
 */
function decodeDynamicCursor(value: string): DynamicCursorBinding {
	if (typeof value !== "string" || value.length === 0 || value.length > CURSOR_MAX_UTF8_BYTES) {
		throw failure("The cursor must be a bounded non-empty string.");
	}
	const json = base64urlDecode(value);
	const binding = validateBinding(parseCursorJson(json, "The cursor envelope is not JSON."));
	if (JSON.stringify(binding) !== json) {
		throw failure("The cursor envelope is not canonical JSON.");
	}
	const parsedQuery = parseCursorJson(binding.query, "The cursor query is not canonical JSON.");
	if (JSON.stringify(parsedQuery) !== binding.query) {
		throw failure("The cursor query is not canonical JSON.");
	}
	return binding;
}

/**
 * Serialize a query the way cursors bind it.
 * @param value Query value.
 * @returns The canonical JSON text.
 */
function cursorQuery(value: unknown): string {
	return canonicalQuery(value);
}

/**
 * Whether a decoded binding names the paging context the caller is in.
 * @param binding Decoded cursor binding.
 * @param expected The caller's child epoch, method, direction and query.
 * @returns Whether every binding field matches.
 */
function bindingMatches(binding: DynamicCursorBinding, expected: ExpectedCursorBinding): boolean {
	return (
		binding.child === expected.child &&
		binding.epoch === expected.epoch &&
		binding.method === expected.method &&
		binding.direction === expected.direction &&
		binding.query === canonicalQuery(expected.query)
	);
}

/**
 * Recover the inner cursor and sequence from an optional caller cursor,
 * refusing one bound to another context.
 * @param value Opaque cursor token, or undefined for the first page.
 * @param expected The caller's child epoch, method, direction and query.
 * @returns The inner cursor and the last delivered sequence.
 */
function unwrapDynamicCursor(
	value: string | undefined,
	expected: ExpectedCursorBinding,
): { readonly cursor: string | null; readonly sequence: number } {
	if (value === undefined) {
		return { cursor: null, sequence: 0 };
	}
	const binding = decodeDynamicCursor(value);
	if (!bindingMatches(binding, expected)) {
		throw failure("The cursor is bound to another child epoch, method, direction, or query.");
	}
	return Object.freeze({ cursor: binding.cursor, sequence: binding.sequence });
}

export {
	type DynamicCursorDirection,
	type DynamicCursorBinding,
	encodeDynamicCursor,
	decodeDynamicCursor,
	cursorQuery,
	unwrapDynamicCursor,
};
