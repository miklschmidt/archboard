/** Exact ECMAScript UTF-16 code-unit order, independent of locale and ICU data. */
export function compareIdentity(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Lexicographic structural order without delimiter-encoding caller-controlled strings. */
export function compareIdentityLists(a: readonly string[], b: readonly string[]): number {
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const compared = compareIdentity(a[index]!, b[index]!);
		if (compared) return compared;
	}
	return a.length - b.length;
}

/** Schema-v1 obstacle identity from schema-validated canonical constituent ids. */
export function obstacleIdentity(values: readonly string[]): string {
	let encoded = "obstacle:";
	for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
		if (valueIndex > 0) encoded += ",";
		const value = values[valueIndex]!;
		for (let index = 0; index < value.length; index += 1) {
			const codeUnit = value[index]!;
			if (codeUnit === "\\" || codeUnit === ",") encoded += "\\";
			encoded += codeUnit;
		}
	}
	return encoded;
}
