import type { ChildEpoch, ChildId } from "../../../shared/codex-workbench-identity/index.js";
import { CodexDynamicToolsError } from "./contract.js";

export type DynamicCursorDirection = "asc" | "desc" | "event";

export interface DynamicCursorBinding {
	readonly schema: 1;
	readonly child: string;
	readonly epoch: string;
	readonly method: string;
	readonly direction: DynamicCursorDirection;
	readonly query: string;
	readonly cursor: string | null;
	readonly sequence: number;
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: object): boolean {
	return (
		Reflect.ownKeys(value).every(
			(key) => typeof key === "string" && (CURSOR_KEYS as readonly string[]).includes(key),
		) && CURSOR_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key))
	);
}

function failure(message: string, cause?: unknown): CodexDynamicToolsError {
	return new CodexDynamicToolsError("invalid_call", message, cause);
}

function base64urlEncode(value: string): string {
	return Buffer.from(value, "utf8")
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

function base64urlDecode(value: string): string {
	if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw failure("The cursor is not a valid opaque token.");
	if (value.length % 4 === 1) throw failure("The cursor is not a valid opaque token.");
	try {
		const padded =
			value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
		const bytes = Buffer.from(padded, "base64");
		const canonical = bytes
			.toString("base64")
			.replaceAll("+", "-")
			.replaceAll("/", "_")
			.replace(/=+$/u, "");
		if (canonical !== value) throw failure("The cursor is not a canonical opaque token.");
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		if (error instanceof CodexDynamicToolsError) throw error;
		throw failure("The cursor is not valid UTF-8.", error);
	}
}

function canonicalQuery(query: unknown): string {
	let encoded: string | undefined;
	try {
		encoded = JSON.stringify(query);
	} catch (error) {
		throw failure("The cursor query is not JSON-serializable.", error);
	}
	if (encoded === undefined || encoded.length === 0)
		throw failure("The cursor query must be a JSON value.");
	return encoded;
}

function validateBinding(value: unknown): DynamicCursorBinding {
	if (!isRecord(value) || !exactKeys(value)) throw failure("The cursor envelope is not exact.");
	if (
		value["schema"] !== 1 ||
		typeof value["child"] !== "string" ||
		value["child"].length === 0 ||
		typeof value["epoch"] !== "string" ||
		value["epoch"].length === 0 ||
		typeof value["method"] !== "string" ||
		value["method"].length === 0 ||
		(value["direction"] !== "asc" && value["direction"] !== "desc" && value["direction"] !== "event") ||
		typeof value["query"] !== "string" ||
		value["query"].length === 0 ||
		(value["cursor"] !== null && typeof value["cursor"] !== "string") ||
		(typeof value["cursor"] === "string" && value["cursor"].length === 0) ||
		typeof value["sequence"] !== "number" ||
		!Number.isSafeInteger(value["sequence"]) ||
		value["sequence"] < 0
	)
		throw failure("The cursor envelope contains invalid binding fields.");
	const sequence = value["sequence"];
	if (typeof sequence !== "number") throw failure("The cursor sequence is not a number.");
	return Object.freeze({
		schema: 1,
		child: value["child"],
		epoch: value["epoch"],
		method: value["method"],
		direction: value["direction"],
		query: value["query"],
		cursor: value["cursor"],
		sequence,
	});
}

export function encodeDynamicCursor(
	input: Omit<DynamicCursorBinding, "schema" | "query"> & {
		readonly query: unknown;
	},
): string {
	if (
		typeof input.child !== "string" ||
		input.child.length === 0 ||
		typeof input.epoch !== "string" ||
		input.epoch.length === 0 ||
		typeof input.method !== "string" ||
		input.method.length === 0 ||
		(input.direction !== "asc" && input.direction !== "desc" && input.direction !== "event") ||
		(input.cursor !== null && (typeof input.cursor !== "string" || input.cursor.length === 0)) ||
		!Number.isSafeInteger(input.sequence) ||
		input.sequence < 0
	)
		throw failure("The cursor binding contains invalid fields.");
	const binding: DynamicCursorBinding = Object.freeze({
		schema: 1,
		child: input.child,
		epoch: input.epoch,
		method: input.method,
		direction: input.direction,
		query: (() => {
			const query = canonicalQuery(input.query);
			if (Buffer.byteLength(query, "utf8") > 16_384)
				throw failure("The cursor query is too large.");
			return query;
		})(),
		cursor: input.cursor,
		sequence: input.sequence,
	});
	const encoded = base64urlEncode(JSON.stringify(binding));
	if (Buffer.byteLength(encoded, "utf8") > 1_024)
		throw failure("The cursor exceeds the reviewed size bound.");
	return encoded;
}

export function decodeDynamicCursor(value: string): DynamicCursorBinding {
	if (typeof value !== "string" || value.length === 0 || value.length > 1_024)
		throw failure("The cursor must be a bounded non-empty string.");
	const json = base64urlDecode(value);
	let parsed: unknown;
	try {
		parsed = JSON.parse(json) as unknown;
	} catch (error) {
		throw failure("The cursor envelope is not JSON.", error);
	}
	const binding = validateBinding(parsed);
	if (JSON.stringify(binding) !== json) throw failure("The cursor envelope is not canonical JSON.");
	let parsedQuery: unknown;
	try {
		parsedQuery = JSON.parse(binding.query) as unknown;
	} catch (error) {
		throw failure("The cursor query is not canonical JSON.", error);
	}
	if (JSON.stringify(parsedQuery) !== binding.query)
		throw failure("The cursor query is not canonical JSON.");
	return binding;
}

export function cursorQuery(value: unknown): string {
	return canonicalQuery(value);
}

export function unwrapDynamicCursor(
	value: string | undefined,
	expected: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
		readonly method: string;
		readonly direction: DynamicCursorDirection;
		readonly query: unknown;
	},
): { readonly cursor: string | null; readonly sequence: number } {
	if (value === undefined) return { cursor: null, sequence: 0 };
	const binding = decodeDynamicCursor(value);
	if (
		binding.child !== expected.child ||
		binding.epoch !== expected.epoch ||
		binding.method !== expected.method ||
		binding.direction !== expected.direction ||
		binding.query !== canonicalQuery(expected.query)
	)
		throw failure("The cursor is bound to another child epoch, method, direction, or query.");
	return Object.freeze({ cursor: binding.cursor, sequence: binding.sequence });
}
