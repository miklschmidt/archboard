export type PathSegment = string | number;

export interface NotificationUnionChallenge {
	readonly name: string;
	readonly mutate: (params: unknown) => unknown;
}

export function replaceAt(
	value: unknown,
	path: readonly PathSegment[],
	replacement: unknown,
): unknown {
	if (!path.length) return replacement;
	const [head, ...tail] = path;
	if (Array.isArray(value)) {
		if (typeof head !== "number" || head < 0 || head >= value.length)
			throw new Error(`Union challenge path does not address an array member: ${String(head)}`);
		return value.map((entry, index) =>
			index === head ? replaceAt(entry, tail, replacement) : entry,
		);
	}
	if (!value || typeof value !== "object")
		throw new Error(`Union challenge path crossed a non-object at ${String(head)}`);
	const record = value as Record<string, unknown>;
	return { ...record, [String(head)]: replaceAt(record[String(head)], tail, replacement) };
}

export function future(name: string, ...path: PathSegment[]): NotificationUnionChallenge {
	return { name, mutate: (params) => replaceAt(params, path, "futureUnionMember") };
}

export function replace(
	name: string,
	path: readonly PathSegment[],
	replacement: unknown,
): NotificationUnionChallenge {
	return { name, mutate: (params) => replaceAt(params, path, replacement) };
}
