const VISIBLE_TEXT_LIMIT = 4_096;
const DETAIL_TEXT_LIMIT = 16_384;
const VALUE_STRING_LIMIT = 2_048;
const VALUE_ARRAY_LIMIT = 32;
const VALUE_KEY_LIMIT = 48;
const VALUE_DEPTH_LIMIT = 6;

export interface BoundedText {
	readonly text: string;
	readonly omitted: number;
}

export function boundedText(value: unknown, limit = VISIBLE_TEXT_LIMIT): BoundedText {
	const source = typeof value === "string" ? value : "";
	if (source.length <= limit) return { text: source, omitted: 0 };
	return { text: source.slice(0, limit), omitted: source.length - limit };
}

function inertValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
	if (typeof value === "bigint") return `${value.toString()}n`;
	if (typeof value === "string") {
		const bounded = boundedText(value, VALUE_STRING_LIMIT);
		return bounded.omitted === 0
			? bounded.text
			: `${bounded.text}\n[${bounded.omitted} characters omitted]`;
	}
	if (typeof value === "undefined") return "[undefined]";
	if (typeof value === "symbol" || typeof value === "function") return `[${typeof value}]`;
	if (depth >= VALUE_DEPTH_LIMIT) return "[depth limit]";
	if (seen.has(value)) return "[circular]";
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const entries = value
				.slice(0, VALUE_ARRAY_LIMIT)
				.map((entry) => inertValue(entry, depth + 1, seen));
			if (value.length > VALUE_ARRAY_LIMIT)
				entries.push(`[${value.length - VALUE_ARRAY_LIMIT} entries omitted]`);
			return entries;
		}
		const entries = Object.entries(value as Record<string, unknown>).toSorted(([left], [right]) =>
			left.localeCompare(right),
		);
		const kept = entries
			.slice(0, VALUE_KEY_LIMIT)
			.map(([key, entry]) => [key, inertValue(entry, depth + 1, seen)]);
		if (entries.length > VALUE_KEY_LIMIT)
			kept.push(["[omitted]", `${entries.length - VALUE_KEY_LIMIT} properties`]);
		return Object.fromEntries(kept);
	} finally {
		seen.delete(value);
	}
}

export function boundedDetails(value: unknown): BoundedText {
	let serialized: string;
	try {
		serialized = JSON.stringify(inertValue(value, 0, new WeakSet()), null, 2);
	} catch {
		serialized = "[Details could not be serialized.]";
	}
	return boundedText(serialized, DETAIL_TEXT_LIMIT);
}

export function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function textField(value: unknown, key: string): string {
	const field = record(value)?.[key];
	return typeof field === "string" ? field : "";
}

export function stringList(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

export function safeHttpUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
	} catch {
		return null;
	}
}
