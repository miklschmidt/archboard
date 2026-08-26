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

/** Schema-v1 obstacle identity: exact-sort, escape backslash/comma only, then comma-join. */
export function obstacleIdentity(values: readonly string[]): string {
	const encoded = values
		.toSorted(compareIdentity)
		.map((value) => value.replaceAll("\\", "\\\\").replaceAll(",", "\\,"))
		.join(",");
	return `obstacle:${encoded}`;
}
