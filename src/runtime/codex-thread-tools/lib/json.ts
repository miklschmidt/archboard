/** A refusal from the strict JSON scanner, distinct so callers can label it themselves. */
class CanonicalJsonError extends TypeError {
	/**
	 * Build the refusal.
	 * @param message - What the scanner refused, including the byte offset.
	 */
	constructor(message: string) {
		super(message);
		this.name = "CanonicalJsonError";
	}
}

/**
 * Decode one already-delimited JSON string, refusing an invalid escape by naming where the string
 * began rather than where the escape is.
 * @param quoted - The text from the opening quote to the closing quote.
 * @param start - The byte the string began at.
 * @returns The decoded string.
 * @throws {CanonicalJsonError} When the delimited text is not a valid JSON string.
 */
function decodeQuotedString(quoted: string, start: number): string {
	try {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the text runs from an opening quote to its matching closing quote, so JSON.parse of it is a string by construction; JSON.parse itself is typed as any
		return JSON.parse(quoted) as string;
	} catch (error) {
		throw new CanonicalJsonError(
			`Invalid JSON string at byte ${start}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Scan JSON text the way `JSON.parse` will not: it refuses duplicate object keys and trailing
 * bytes. Both are accepted by the built-in parser but would make a tool's text mean one thing to
 * Archboard and another to whatever else reads it, so they are refused before parsing.
 * @param source - The JSON text.
 * @throws {CanonicalJsonError} When the text is not strict, unambiguous JSON.
 */
function parseJsonStructure(source: string): void {
	let cursor = 0;

	/**
	 * Refuse the scan at the current byte.
	 * @param message - What was expected.
	 * @throws {CanonicalJsonError} Always.
	 */
	const fail = (message: string): never => {
		throw new CanonicalJsonError(`${message} at byte ${cursor}.`);
	};
	/**
	 * Advance past the whitespace JSON allows between tokens.
	 */
	const skipWhitespace = (): void => {
		while (
			source[cursor] === " " ||
			source[cursor] === "\n" ||
			source[cursor] === "\r" ||
			source[cursor] === "\t"
		) {
			cursor++;
		}
	};
	/**
	 * Scan one JSON string and return its decoded value, which object-key scanning needs in order
	 * to detect a duplicate key.
	 * @returns The decoded string.
	 */
	const parseString = (): string => {
		if (source[cursor] !== '"') {
			fail("Expected a JSON string");
		}
		const start = cursor;
		cursor++;
		while (cursor < source.length) {
			const character = source[cursor];
			if (character === "\\") {
				cursor += 2;
				continue;
			}
			if (character === '"') {
				cursor++;
				return decodeQuotedString(source.slice(start, cursor), start);
			}
			cursor++;
		}
		return fail("Unterminated JSON string");
	};

	/**
	 * Scan one object member: its key, the colon, and its value.
	 * @param keys - The keys already seen in this object, added to in place.
	 */
	const parseMember = (keys: Set<string>): void => {
		const key = parseString();
		if (keys.has(key)) {
			fail(`Duplicate JSON object key ${JSON.stringify(key)}`);
		}
		keys.add(key);
		skipWhitespace();
		if (source[cursor] !== ":") {
			fail("Expected a JSON object colon");
		}
		cursor++;
		parseValue();
		skipWhitespace();
	};

	/**
	 * Scan one object, refusing a repeated key: two keys that differ only by repetition would make
	 * the object mean different things to different parsers.
	 */
	const parseObject = (): void => {
		cursor++;
		skipWhitespace();
		const keys = new Set<string>();
		if (source[cursor] === "}") {
			cursor++;
			return;
		}
		while (cursor < source.length) {
			parseMember(keys);
			if (source[cursor] === "}") {
				cursor++;
				return;
			}
			if (source[cursor] !== ",") {
				fail("Expected a JSON object comma");
			}
			cursor++;
			skipWhitespace();
		}
		fail("Unterminated JSON object");
	};

	/**
	 * Scan one array.
	 */
	const parseArray = (): void => {
		cursor++;
		skipWhitespace();
		if (source[cursor] === "]") {
			cursor++;
			return;
		}
		while (cursor < source.length) {
			parseValue();
			skipWhitespace();
			if (source[cursor] === "]") {
				cursor++;
				return;
			}
			if (source[cursor] !== ",") {
				fail("Expected a JSON array comma");
			}
			cursor++;
			skipWhitespace();
		}
		fail("Unterminated JSON array");
	};

	/**
	 * Scan one literal: a number, `true`, `false` or `null`, in exactly the spellings JSON allows.
	 */
	const parseLiteral = (): void => {
		const literal = source
			.slice(cursor)
			.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];
		if (literal === undefined) {
			fail("Expected a JSON value");
			return;
		}
		cursor += literal.length;
	};

	/**
	 * Scan one JSON value of any kind.
	 */
	const parseValue = (): void => {
		skipWhitespace();
		const character = source[cursor];
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
		parseLiteral();
	};

	parseValue();
	skipWhitespace();
	if (cursor !== source.length) {
		fail("Unexpected JSON bytes");
	}
}

/**
 * Parse JSON text strictly: the same value `JSON.parse` would produce, but only for text the
 * scanner accepts, and with every refusal labelled by what was being read.
 * @param source - The JSON text.
 * @param label - What is being parsed, for the refusal message.
 * @returns The parsed value.
 * @throws {TypeError} When the text is not strict JSON.
 */
function parseStrictJson(source: string, label: string): unknown {
	try {
		parseJsonStructure(source);
		return JSON.parse(source) as unknown;
	} catch (error) {
		if (error instanceof CanonicalJsonError) {
			throw new TypeError(`Invalid ${label}: ${error.message}`, { cause: error });
		}
		throw new TypeError(
			`Invalid ${label}: ${error instanceof Error ? error.message : String(error)}`,
			{
				cause: error,
			},
		);
	}
}

export { CanonicalJsonError, parseStrictJson };
