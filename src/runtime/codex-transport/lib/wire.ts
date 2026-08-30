import { ProtocolDecodeError } from "../../codex-protocol/index.js";
import { CodexTransportUsageError, CodexTransportWriteError } from "./errors.js";
import { CODEX_TRANSPORT_MAX_FRAME_BYTES } from "./limits.js";

export type WireId = string | number;

export function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isWireId(value: unknown): value is WireId {
	return (
		(typeof value === "string" && value.length > 0) ||
		(typeof value === "number" && Number.isSafeInteger(value))
	);
}

export function wireKey(value: WireId): string {
	return `${typeof value}:${String(value)}`;
}

export function isInList<T extends string>(list: readonly T[], value: string): value is T {
	return (list as readonly string[]).includes(value);
}

export function boundedText(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 256 ||
		value.trim() !== value ||
		value.includes("\0")
	)
		throw new CodexTransportUsageError(`${field} must be a non-empty bounded string`);
}

export function jsonLine(value: unknown, field: string): Buffer {
	let encoded: string | undefined;
	try {
		encoded = JSON.stringify(value);
	} catch (error) {
		throw new CodexTransportUsageError(`${field} is not JSON serializable: ${String(error)}`);
	}
	if (encoded === undefined)
		throw new CodexTransportUsageError(`${field} must be a JSON value, not undefined`);
	const frame = Buffer.from(`${encoded}\n`, "utf8");
	if (frame.byteLength - 1 > CODEX_TRANSPORT_MAX_FRAME_BYTES)
		throw new CodexTransportWriteError(
			"frame-too-large",
			`${field} exceeds ${CODEX_TRANSPORT_MAX_FRAME_BYTES} bytes`,
		);
	return frame;
}

export function isDisabledCapabilityError(error: unknown): error is ProtocolDecodeError {
	if (!(error instanceof ProtocolDecodeError)) return false;
	return error.issues.some(
		(issue) =>
			isRecord(issue) &&
			Array.isArray(issue.path) &&
			issue.path.length === 1 &&
			issue.path[0] === "method" &&
			issue.message === "capability was explicitly disabled by Archboard",
	);
}

export function responseKind(value: Record<string, unknown>): "result" | "error" | "malformed" {
	const result = hasOwn(value, "result");
	const error = hasOwn(value, "error");
	if (result && !error) return "result";
	if (error && !result) return "error";
	return "malformed";
}
