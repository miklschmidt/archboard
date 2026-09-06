class CanonicalJsonError extends TypeError {
	/**
	 *
	 */
	constructor(message: string) {
		super(message);
		this.name = "CanonicalJsonError";
	}
}

/**
 *
 */
function parseJsonStructure(source: string): void {
	let cursor = 0;

	/**
	 *
	 */
	const fail = (message: string): never => {
		throw new CanonicalJsonError(`${message} at byte ${cursor}.`);
	};
	/**
	 *
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
	 *
	 */
	const parseString = (): string => {
		if (source[cursor] !== '"') {
			return fail("Expected a JSON string");
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
				try {
					return JSON.parse(source.slice(start, cursor)) as string;
				} catch (error) {
					throw new CanonicalJsonError(
						`Invalid JSON string at byte ${start}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
			cursor++;
		}
		return fail("Unterminated JSON string");
	};
	/**
	 *
	 */
	const parseValue = (): void => {
		skipWhitespace();
		const character = source[cursor];
		if (character === "{") {
			cursor++;
			skipWhitespace();
			const keys = new Set<string>();
			if (source[cursor] === "}") {
				cursor++;
				return;
			}
			while (cursor < source.length) {
				const key = parseString();
				if (keys.has(key)) {
					return fail(`Duplicate JSON object key ${JSON.stringify(key)}`);
				}
				keys.add(key);
				skipWhitespace();
				if (source[cursor] !== ":") {
					return fail("Expected a JSON object colon");
				}
				cursor++;
				parseValue();
				skipWhitespace();
				if (source[cursor] === "}") {
					cursor++;
					return;
				}
				if (source[cursor] !== ",") {
					return fail("Expected a JSON object comma");
				}
				cursor++;
				skipWhitespace();
			}
			return fail("Unterminated JSON object");
		}
		if (character === "[") {
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
					return fail("Expected a JSON array comma");
				}
				cursor++;
				skipWhitespace();
			}
			return fail("Unterminated JSON array");
		}
		if (character === '"') {
			parseString();
			return;
		}
		const literal = source
			.slice(cursor)
			.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];
		if (!literal) {
			return fail("Expected a JSON value");
		}
		cursor += literal.length;
	};

	parseValue();
	skipWhitespace();
	if (cursor !== source.length) {
		fail("Unexpected JSON bytes");
	}
}

/**
 *
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
