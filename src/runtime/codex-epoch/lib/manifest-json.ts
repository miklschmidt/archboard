export function assertNoDuplicateKeys(raw: string): void {
	let index = 0;
	parseValue();
	skipWhitespace();
	if (index !== raw.length) {
		throw new Error("trailing JSON data");
	}

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
		if (raw.startsWith("true", index)) {
			index += 4;
			return;
		}
		if (raw.startsWith("false", index)) {
			index += 5;
			return;
		}
		if (raw.startsWith("null", index)) {
			index += 4;
			return;
		}
		const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(raw.slice(index));
		if (number === null) {
			throw new Error(`invalid JSON at byte ${index}`);
		}
		index += number[0].length;
	}

	function parseObject(): void {
		index += 1;
		skipWhitespace();
		const keys = new Set<string>();
		if (raw[index] === "}") {
			index += 1;
			return;
		}
		while (true) {
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
			skipWhitespace();
			if (raw[index] === "}") {
				index += 1;
				return;
			}
			if (raw[index] !== ",") {
				throw new Error(`missing comma at byte ${index}`);
			}
			index += 1;
		}
	}

	function parseArray(): void {
		index += 1;
		skipWhitespace();
		if (raw[index] === "]") {
			index += 1;
			return;
		}
		while (true) {
			parseValue();
			skipWhitespace();
			if (raw[index] === "]") {
				index += 1;
				return;
			}
			if (raw[index] !== ",") {
				throw new Error(`missing array comma at byte ${index}`);
			}
			index += 1;
		}
	}

	function parseString(): string {
		if (raw[index] !== '"') {
			throw new Error(`expected string at byte ${index}`);
		}
		const start = index;
		index += 1;
		while (index < raw.length) {
			const character = raw[index];
			if (character === '"') {
				index += 1;
				return JSON.parse(raw.slice(start, index)) as string;
			}
			if (character === "\\") {
				index += 1;
				if (index >= raw.length) {
					throw new Error("unterminated string escape");
				}
				if (raw[index] === "u") {
					if (!/^[0-9a-f]{4}$/iu.test(raw.slice(index + 1, index + 5))) {
						throw new Error("invalid unicode escape");
					}
					index += 5;
				} else {
					index += 1;
				}
				continue;
			}
			if (character !== undefined && character < " ") {
				throw new Error("control character in string");
			}
			index += 1;
		}
		throw new Error("unterminated string");
	}

	function skipWhitespace(): void {
		while (/\s/u.test(raw[index] ?? "")) {
			index += 1;
		}
	}
}
