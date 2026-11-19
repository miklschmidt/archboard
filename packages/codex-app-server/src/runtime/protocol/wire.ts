export type WireId = string | number;

type JsonFrameDecodeFailureKind = "malformed-json" | "duplicate-key";

/** A stdout line that is not one strict JSON value, with the top-level correlation it managed to read. */
export class JsonFrameDecodeError extends Error {
	override readonly name = "JsonFrameDecodeError";
	readonly kind: JsonFrameDecodeFailureKind;
	readonly wireId: WireId | undefined;
	readonly methodPresent: boolean;

	/**
	 * Records why the frame was refused and what the parser learned about it first.
	 * @param kind Whether the text was malformed or repeated an object key.
	 * @param wireId The top-level id, when one was read before the failure.
	 * @param methodPresent Whether a top-level method key was seen, which marks a reverse request.
	 */
	constructor(kind: JsonFrameDecodeFailureKind, wireId?: WireId, methodPresent = false) {
		super(kind === "duplicate-key" ? "JSON object contains a duplicate key" : "invalid JSON frame");
		this.kind = kind;
		this.wireId = wireId;
		this.methodPresent = methodPresent;
	}
}

/**
 * Whether a value is a plain JSON object rather than null, an array or a scalar.
 * @param value The value to inspect.
 * @returns True when the value can be read as a string-keyed record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether a value is a JSON-RPC id the transport accepts: a non-empty string or a safe integer.
 * @param value The candidate id.
 * @returns True when the value can key a pending request.
 */
export function isWireId(value: unknown): value is WireId {
	return (
		(typeof value === "string" && value.length > 0) ||
		(typeof value === "number" && Number.isSafeInteger(value))
	);
}

/**
 * The map key for a wire id, keeping the string "1" and the number 1 distinct.
 * @param value The wire id.
 * @returns A key unique to the id's type and text.
 */
export function wireKey(value: WireId): string {
	return `${typeof value}:${String(value)}`;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
	'"': '"',
	"\\": "\\",
	"/": "/",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
});

/**
 * A strict JSON reader that refuses duplicate object keys, which JSON.parse would silently
 * collapse, and remembers the top-level id and method so a refused frame can still be answered.
 */
class StrictJsonParser {
	private index = 0;
	private topLevelId: WireId | undefined;
	private topLevelMethodPresent = false;
	private duplicateKeyDetected = false;

	/**
	 * Prepares to read one complete JSON text.
	 * @param text The frame text without its trailing newline.
	 */
	constructor(private readonly text: string) {}

	/**
	 * Reads the whole text as one JSON value.
	 * @returns The decoded value.
	 */
	parse(): unknown {
		this.skipWhitespace();
		const value = this.parseValue(0);
		this.skipWhitespace();
		if (this.index !== this.text.length) throw new JsonFrameDecodeError("malformed-json");
		if (this.duplicateKeyDetected)
			throw new JsonFrameDecodeError("duplicate-key", this.topLevelId, this.topLevelMethodPresent);
		return value;
	}

	/**
	 * Reads the value starting at the cursor, dispatching on its first character.
	 * @param depth How many objects and arrays enclose the value; zero at the top level.
	 * @returns The decoded value.
	 */
	private parseValue(depth: number): unknown {
		const character = this.text[this.index];
		if (character === "{") return this.parseObject(depth);
		if (character === "[") return this.parseArray(depth);
		if (character === '"') return this.parseString();
		if (character === "-" || this.isDigit(character)) return this.parseNumber();
		return this.parseLiteral();
	}

	/**
	 * Reads one of the three JSON keyword literals.
	 * @returns The literal's value.
	 */
	private parseLiteral(): boolean | null {
		if (this.take("true")) return true;
		if (this.take("false")) return false;
		if (this.take("null")) return null;
		throw new JsonFrameDecodeError("malformed-json");
	}

	/**
	 * Reads an object whose opening brace is at the cursor.
	 * @param depth The nesting depth of the object itself.
	 * @returns The decoded members; a repeated key keeps its first value.
	 */
	private parseObject(depth: number): Record<string, unknown> {
		this.index++;
		const object: Record<string, unknown> = {};
		const keys = new Set<string>();
		this.skipWhitespace();
		if (this.take("}")) return object;
		for (;;) {
			this.parseMember(object, keys, depth);
			this.skipWhitespace();
			if (this.take("}")) return object;
			this.expect(",");
		}
	}

	/**
	 * Reads one key-value member into the object being built.
	 * @param object The object receiving the member.
	 * @param keys The keys already seen on this object, for duplicate detection.
	 * @param depth The nesting depth of the enclosing object.
	 */
	private parseMember(object: Record<string, unknown>, keys: Set<string>, depth: number): void {
		this.skipWhitespace();
		if (this.text[this.index] !== '"') throw new JsonFrameDecodeError("malformed-json");
		const key = this.parseString();
		const duplicate = keys.has(key);
		if (duplicate) this.duplicateKeyDetected = true;
		keys.add(key);
		this.skipWhitespace();
		this.expect(":");
		this.skipWhitespace();
		const value = this.parseValue(depth + 1);
		if (!duplicate)
			Object.defineProperty(object, key, {
				configurable: true,
				enumerable: true,
				value,
				writable: true,
			});
		if (depth === 0) this.noteTopLevelMember(key, value);
	}

	/**
	 * Remembers the top-level id and method so a later refusal can still name the frame.
	 * @param key The member key.
	 * @param value The member value.
	 */
	private noteTopLevelMember(key: string, value: unknown): void {
		if (key === "id" && isWireId(value)) this.topLevelId = value;
		if (key === "method") this.topLevelMethodPresent = true;
	}

	/**
	 * Reads an array whose opening bracket is at the cursor.
	 * @param depth The nesting depth of the array itself.
	 * @returns The decoded items.
	 */
	private parseArray(depth: number): unknown[] {
		this.index++;
		const array: unknown[] = [];
		this.skipWhitespace();
		if (this.take("]")) return array;
		for (;;) {
			this.skipWhitespace();
			array.push(this.parseValue(depth + 1));
			this.skipWhitespace();
			if (this.take("]")) return array;
			this.expect(",");
		}
	}

	/**
	 * Reads a quoted string, decoding escapes and refusing raw control characters.
	 * @returns The decoded string.
	 */
	private parseString(): string {
		this.expect('"');
		let result = "";
		while (this.index < this.text.length) {
			const character = this.text[this.index++]!;
			if (character === '"') return result;
			if (character === "\\") {
				result += this.parseEscape();
				continue;
			}
			if (character < " ") throw new JsonFrameDecodeError("malformed-json");
			result += character;
		}
		throw new JsonFrameDecodeError("malformed-json");
	}

	/**
	 * Decodes the escape sequence that follows a backslash already consumed.
	 * @returns The character the escape stands for.
	 */
	private parseEscape(): string {
		const escape = this.text[this.index++];
		if (escape === undefined) throw new JsonFrameDecodeError("malformed-json");
		if (escape === "u") return this.parseUnicodeEscape();
		const decoded = SIMPLE_ESCAPES[escape];
		if (decoded === undefined) throw new JsonFrameDecodeError("malformed-json");
		return decoded;
	}

	/**
	 * Decodes the four hex digits of a \u escape at the cursor.
	 * @returns The UTF-16 code unit they name.
	 */
	private parseUnicodeEscape(): string {
		const hex = this.text.slice(this.index, this.index + 4);
		if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new JsonFrameDecodeError("malformed-json");
		this.index += 4;
		return String.fromCharCode(Number.parseInt(hex, 16));
	}

	/**
	 * Reads a JSON number in its strict grammar: no leading zeros, plus or hex forms.
	 * @returns The finite number.
	 */
	private parseNumber(): number {
		const start = this.index;
		this.take("-");
		this.parseIntegerDigits();
		if (this.take(".")) this.expectDigits();
		this.parseExponent();
		const value = Number(this.text.slice(start, this.index));
		if (!Number.isFinite(value)) throw new JsonFrameDecodeError("malformed-json");
		return value;
	}

	/** Reads the integer part: a lone zero or a run of digits that does not start with zero. */
	private parseIntegerDigits(): void {
		if (!this.take("0")) {
			this.expectDigits();
			return;
		}
		if (this.isDigit(this.text[this.index])) throw new JsonFrameDecodeError("malformed-json");
	}

	/** Reads an optional exponent part with its sign. */
	private parseExponent(): void {
		if (this.text[this.index] !== "e" && this.text[this.index] !== "E") return;
		this.index++;
		if (!this.take("+") && this.text[this.index] === "-") this.index++;
		this.expectDigits();
	}

	/** Consumes at least one digit or refuses the frame. */
	private expectDigits(): void {
		if (!this.takeDigits()) throw new JsonFrameDecodeError("malformed-json");
	}

	/**
	 * Consumes a run of digits.
	 * @returns True when at least one digit was consumed.
	 */
	private takeDigits(): boolean {
		const start = this.index;
		while (this.isDigit(this.text[this.index])) this.index++;
		return this.index > start;
	}

	/**
	 * Whether a character is an ASCII digit.
	 * @param value The character, or undefined at the end of the text.
	 * @returns True for 0 through 9.
	 */
	private isDigit(value: string | undefined): boolean {
		return value !== undefined && value >= "0" && value <= "9";
	}

	/**
	 * Consumes the expected token or refuses the frame.
	 * @param expected The token that must appear at the cursor.
	 */
	private expect(expected: string): void {
		if (!this.take(expected)) throw new JsonFrameDecodeError("malformed-json");
	}

	/**
	 * Consumes the token when it appears at the cursor.
	 * @param expected The token to look for.
	 * @returns True when the token was consumed.
	 */
	private take(expected: string): boolean {
		if (!this.text.startsWith(expected, this.index)) return false;
		this.index += expected.length;
		return true;
	}

	/** Skips the four JSON whitespace characters. */
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

/**
 * Decodes one frame of JSON text strictly, refusing duplicate keys.
 * @param text The frame text.
 * @returns The decoded value.
 */
export function parseJsonText(text: string): unknown {
	return new StrictJsonParser(text).parse();
}
