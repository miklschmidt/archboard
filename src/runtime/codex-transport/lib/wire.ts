import { ProtocolDecodeError } from "@/runtime/codex-protocol";
import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import {
	CodexTransportUsageError,
	CodexTransportWriteError,
} from "@/runtime/codex-transport/lib/errors";

export type WireId = string | number;

export type JsonFrameDecodeFailureKind = "malformed-json" | "duplicate-key";

export class JsonFrameDecodeError extends Error {
	override readonly name = "JsonFrameDecodeError";
	readonly kind: JsonFrameDecodeFailureKind;
	readonly wireId: WireId | undefined;
	readonly methodPresent: boolean;

	constructor(kind: JsonFrameDecodeFailureKind, wireId?: WireId, methodPresent = false) {
		super(kind === "duplicate-key" ? "JSON object contains a duplicate key" : "invalid JSON frame");
		this.kind = kind;
		this.wireId = wireId;
		this.methodPresent = methodPresent;
	}
}

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

class StrictJsonParser {
	private index = 0;
	private topLevelId: WireId | undefined;
	private topLevelMethodPresent = false;
	private duplicateKeyDetected = false;

	constructor(private readonly text: string) {}

	parse(): unknown {
		this.skipWhitespace();
		const value = this.parseValue(0);
		this.skipWhitespace();
		if (this.index !== this.text.length) throw new JsonFrameDecodeError("malformed-json");
		if (this.duplicateKeyDetected)
			throw new JsonFrameDecodeError("duplicate-key", this.topLevelId, this.topLevelMethodPresent);
		return value;
	}

	private parseValue(depth: number): unknown {
		const character = this.text[this.index];
		if (character === "{") return this.parseObject(depth);
		if (character === "[") return this.parseArray(depth);
		if (character === '"') return this.parseString();
		if (character === "t" && this.take("true")) return true;
		if (character === "f" && this.take("false")) return false;
		if (character === "n" && this.take("null")) return null;
		if (character === "-" || (character !== undefined && character >= "0" && character <= "9"))
			return this.parseNumber();
		throw new JsonFrameDecodeError("malformed-json");
	}

	private parseObject(depth: number): Record<string, unknown> {
		this.index++;
		const object: Record<string, unknown> = {};
		const keys = new Set<string>();
		this.skipWhitespace();
		if (this.take("}")) return object;
		while (true) {
			this.skipWhitespace();
			if (this.text[this.index] !== '"') throw new JsonFrameDecodeError("malformed-json");
			const key = this.parseString();
			const duplicate = keys.has(key);
			if (duplicate) this.duplicateKeyDetected = true;
			keys.add(key);
			this.skipWhitespace();
			if (!this.take(":")) throw new JsonFrameDecodeError("malformed-json");
			this.skipWhitespace();
			const value = this.parseValue(depth + 1);
			if (!duplicate)
				Object.defineProperty(object, key, {
					configurable: true,
					enumerable: true,
					value,
					writable: true,
				});
			if (depth === 0 && key === "id" && isWireId(value)) this.topLevelId = value;
			if (depth === 0 && key === "method") this.topLevelMethodPresent = true;
			this.skipWhitespace();
			if (this.take("}")) return object;
			if (!this.take(",")) throw new JsonFrameDecodeError("malformed-json");
		}
	}

	private parseArray(depth: number): unknown[] {
		this.index++;
		const array: unknown[] = [];
		this.skipWhitespace();
		if (this.take("]")) return array;
		while (true) {
			this.skipWhitespace();
			array.push(this.parseValue(depth + 1));
			this.skipWhitespace();
			if (this.take("]")) return array;
			if (!this.take(",")) throw new JsonFrameDecodeError("malformed-json");
		}
	}

	private parseString(): string {
		if (!this.take('"')) throw new JsonFrameDecodeError("malformed-json");
		let result = "";
		while (this.index < this.text.length) {
			const character = this.text[this.index++]!;
			if (character === '"') return result;
			if (character === "\\") {
				const escape = this.text[this.index++];
				if (escape === undefined) throw new JsonFrameDecodeError("malformed-json");
				if (escape === "u") {
					const hex = this.text.slice(this.index, this.index + 4);
					if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new JsonFrameDecodeError("malformed-json");
					result += String.fromCharCode(Number.parseInt(hex, 16));
					this.index += 4;
				} else {
					const escaped: Record<string, string> = {
						'"': '"',
						"\\": "\\",
						"/": "/",
						b: "\b",
						f: "\f",
						n: "\n",
						r: "\r",
						t: "\t",
					};
					const decoded = escaped[escape];
					if (decoded === undefined) throw new JsonFrameDecodeError("malformed-json");
					result += decoded;
				}
				continue;
			}
			if (character < "\u0020") throw new JsonFrameDecodeError("malformed-json");
			result += character;
		}
		throw new JsonFrameDecodeError("malformed-json");
	}

	private parseNumber(): number {
		const start = this.index;
		this.take("-");
		if (this.take("0")) {
			if (this.isDigit(this.text[this.index])) throw new JsonFrameDecodeError("malformed-json");
		} else {
			if (!this.takeDigits()) throw new JsonFrameDecodeError("malformed-json");
		}
		if (this.take(".")) {
			if (!this.takeDigits()) throw new JsonFrameDecodeError("malformed-json");
		}
		if (this.text[this.index] === "e" || this.text[this.index] === "E") {
			this.index++;
			if (!this.take("+") && this.text[this.index] === "-") this.index++;
			if (!this.takeDigits()) throw new JsonFrameDecodeError("malformed-json");
		}
		const value = Number(this.text.slice(start, this.index));
		if (!Number.isFinite(value)) throw new JsonFrameDecodeError("malformed-json");
		return value;
	}

	private takeDigits(): boolean {
		const start = this.index;
		while (this.isDigit(this.text[this.index])) this.index++;
		return this.index > start;
	}

	private isDigit(value: string | undefined): boolean {
		return value !== undefined && value >= "0" && value <= "9";
	}

	private take(expected: string): boolean {
		if (!this.text.startsWith(expected, this.index)) return false;
		this.index += expected.length;
		return true;
	}

	private skipWhitespace(): void {
		while (
			this.text[this.index] === " " ||
			this.text[this.index] === "\t" ||
			this.text[this.index] === "\r" ||
			this.text[this.index] === "\n"
		)
			this.index++;
	}
}

export function parseJsonText(text: string): unknown {
	return new StrictJsonParser(text).parse();
}

export function isInList<T extends string>(list: readonly T[], value: string): value is T {
	return (list as readonly string[]).includes(value);
}

export function boundedText(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > CODEX_APP_SERVER_CAPACITY.text.maxChars ||
		value.trim() !== value ||
		value.includes("\0")
	)
		throw new CodexTransportUsageError(`${field} must be a non-empty bounded string`);
}

export function jsonLine(
	value: unknown,
	field: string,
	maximumBytes: number = CODEX_APP_SERVER_CAPACITY.frameBytes,
): Buffer {
	let encoded: string | undefined;
	try {
		encoded = JSON.stringify(value);
	} catch {
		throw new CodexTransportUsageError(`${field} is not JSON serializable`);
	}
	if (encoded === undefined)
		throw new CodexTransportUsageError(`${field} must be a JSON value, not undefined`);
	const frameText = `${encoded}\n`;
	const payloadBytes = Buffer.byteLength(encoded, "utf8");
	if (payloadBytes > maximumBytes)
		throw new CodexTransportWriteError("frame-too-large", `${field} exceeds ${maximumBytes} bytes`);
	return Buffer.from(frameText, "utf8");
}

export function isDisabledCapabilityError(error: unknown): error is ProtocolDecodeError {
	if (!(error instanceof ProtocolDecodeError)) return false;
	return error.issues.some(
		(issue) =>
			isRecord(issue) &&
			Array.isArray(issue["path"]) &&
			issue["path"].length === 1 &&
			issue["path"][0] === "method" &&
			issue["message"] === "capability was explicitly disabled by Archboard",
	);
}

export function responseKind(value: Record<string, unknown>): "result" | "error" | "malformed" {
	const result = hasOwn(value, "result");
	const error = hasOwn(value, "error");
	if (result && !error) return "result";
	if (error && !result) return "error";
	return "malformed";
}
