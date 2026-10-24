const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
const UNICODE_ESCAPE = /^[0-9a-f]{4}$/iu;
const WHITESPACE = /\s/u;
const LITERALS: readonly string[] = Object.freeze(["true", "false", "null"]);

/**
 * Refuse a raw control character, which JSON allows only in escaped form.
 * @param character - The character at the cursor, or undefined at the end of the text.
 */
function rejectControlCharacter(character: string | undefined): void {
	if (character !== undefined && character < " ") {
		throw new Error("control character in string");
	}
}

/**
 * Decode a complete quoted JSON string.
 * @param quoted - The text from the opening quote through the closing one.
 * @returns The string it denotes.
 */
function decodeQuoted(quoted: string): string {
	// The argument is a complete quoted JSON string, so parsing it yields a string.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a quoted JSON string parses to a string
	return JSON.parse(quoted) as string;
}

/**
 * Walk a JSON text and refuse any object that repeats a key. JSON.parse keeps only the last
 * value for a repeated key, so a manifest could otherwise say one thing to the parser and
 * another to a reader; the epoch manifest must mean exactly one thing.
 * @param raw - The manifest text.
 */
export function assertNoDuplicateKeys(raw: string): void {
	let index = 0;

	/** Skip the whitespace JSON allows between tokens. */
	const skipWhitespace = (): void => {
		while (WHITESPACE.test(raw[index] ?? "")) {
			index += 1;
		}
	};

	/**
	 * Consume the keyword literal at the cursor, or the number that must be there instead.
	 */
	const parseLiteralOrNumber = (): void => {
		const literal = LITERALS.find((candidate) => raw.startsWith(candidate, index));
		if (literal !== undefined) {
			index += literal.length;
			return;
		}
		const number = NUMBER.exec(raw.slice(index));
		if (number === null) {
			throw new Error(`invalid JSON at byte ${index}`);
		}
		index += number[0].length;
	};

	/** Consume the escape sequence that follows a backslash at the cursor. */
	const parseEscape = (): void => {
		index += 1;
		if (index >= raw.length) {
			throw new Error("unterminated string escape");
		}
		if (raw[index] !== "u") {
			index += 1;
			return;
		}
		if (!UNICODE_ESCAPE.test(raw.slice(index + 1, index + 5))) {
			throw new Error("invalid unicode escape");
		}
		index += 5;
	};

	/**
	 * Consume the quoted string at the cursor.
	 * @returns The decoded string, which is a key when the caller is reading an object.
	 */
	const parseString = (): string => {
		if (raw[index] !== '"') {
			throw new Error(`expected string at byte ${index}`);
		}
		const start = index;
		index += 1;
		while (index < raw.length) {
			const character = raw[index];
			if (character === '"') {
				index += 1;
				return decodeQuoted(raw.slice(start, index));
			}
			if (character === "\\") {
				parseEscape();
				continue;
			}
			rejectControlCharacter(character);
			index += 1;
		}
		throw new Error("unterminated string");
	};

	/**
	 * Consume the delimiter after a member or element.
	 * @param close - The character that closes this container.
	 * @param what - What is being read, for the failure message.
	 * @returns True when the container closed, false when another item follows.
	 */
	const parseDelimiter = (close: "}" | "]", what: string): boolean => {
		skipWhitespace();
		if (raw[index] === close) {
			index += 1;
			return true;
		}
		if (raw[index] !== ",") {
			throw new Error(`missing ${what} at byte ${index}`);
		}
		index += 1;
		return false;
	};

	/**
	 * Consume one object member, refusing a key the object already carries.
	 * @param keys - The keys read so far from this object.
	 */
	const parseMember = (keys: Set<string>): void => {
		skipWhitespace();
		const key = parseString();
		if (keys.has(key)) {
			throw new Error(`duplicate object key ${key}`);
		}
		keys.add(key);
		skipWhitespace();
		if (raw[index] !== ":") {
			throw new Error(`missing colon at byte ${index}`);
		}
		index += 1;
		parseValue();
	};

	/** Consume the object whose opening brace is at the cursor. */
	const parseObject = (): void => {
		index += 1;
		skipWhitespace();
		const keys = new Set<string>();
		if (raw[index] === "}") {
			index += 1;
			return;
		}
		for (;;) {
			parseMember(keys);
			if (parseDelimiter("}", "comma")) return;
		}
	};

	/** Consume the array whose opening bracket is at the cursor. */
	const parseArray = (): void => {
		index += 1;
		skipWhitespace();
		if (raw[index] === "]") {
			index += 1;
			return;
		}
		for (;;) {
			parseValue();
			if (parseDelimiter("]", "array comma")) return;
		}
	};

	/** Consume the value at the cursor, whatever kind it is. */
	function parseValue(): void {
		skipWhitespace();
		const character = raw[index];
		if (character === "{") {
			parseObject();
			return;
		}
		if (character === "[") {
			parseArray();
			return;
		}
		if (character === '"') {
			parseString();
			return;
		}
		parseLiteralOrNumber();
	}

	parseValue();
	skipWhitespace();
	if (index !== raw.length) {
		throw new Error("trailing JSON data");
	}
}
