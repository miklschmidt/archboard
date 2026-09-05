// Bounded, inert views of untrusted timeline values: text cut at a visible
// limit, details serialised without cycles or unbounded growth, and links
// admitted only when they are HTTP.

const VISIBLE_TEXT_LIMIT = 4_096;
const DETAIL_TEXT_LIMIT = 16_384;
const VALUE_STRING_LIMIT = 2_048;
const VALUE_ARRAY_LIMIT = 32;
const VALUE_KEY_LIMIT = 48;
const VALUE_DEPTH_LIMIT = 6;

/** Text cut at a limit, with how much was left out. */
interface BoundedText {
	readonly text: string;
	readonly omitted: number;
}

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Cut text at a limit.
 * @param value The value; anything but a string counts as empty.
 * @param limit The character limit.
 * @returns The visible text and the omitted count.
 */
function boundedText(value: unknown, limit = VISIBLE_TEXT_LIMIT): BoundedText {
	const source = typeof value === "string" ? value : "";
	if (source.length <= limit) {
		return { text: source, omitted: 0 };
	}
	return { text: source.slice(0, limit), omitted: source.length - limit };
}

/**
 * A bounded string, noting the omission inline.
 * @param value The string.
 * @returns The string, cut when long.
 */
function inertString(value: string): string {
	const bounded = boundedText(value, VALUE_STRING_LIMIT);
	return bounded.omitted === 0
		? bounded.text
		: `${bounded.text}\n[${bounded.omitted} characters omitted]`;
}

/**
 * A number as an inert JSON value: finite numbers stay, the rest become words.
 * @param value The number.
 * @returns The inert value.
 */
function inertNumber(value: unknown): unknown {
	return typeof value === "number" && Number.isFinite(value) ? value : String(value);
}

/**
 * A string as an inert JSON string.
 * @param value The string.
 * @returns The bounded string.
 */
function inertText(value: unknown): unknown {
	return typeof value === "string" ? inertString(value) : "";
}

/**
 * A `typeof` name as an inert placeholder.
 * @param name The name.
 * @returns A handler that returns the placeholder.
 */
function placeholder(name: string): (value: unknown) => unknown {
	return () => `[${name}]`;
}

/**
 * The value itself.
 * @param value The value.
 * @returns The same value.
 */
function identity(value: unknown): unknown {
	return value;
}

/** How each scalar `typeof` becomes inert; absent for objects. */
const SCALAR_HANDLERS: Readonly<Record<string, ((value: unknown) => unknown) | undefined>> = {
	boolean: identity,
	number: inertNumber,
	bigint: placeholder("bigint"),
	string: inertText,
	undefined: placeholder("undefined"),
	symbol: placeholder("symbol"),
	function: placeholder("function"),
};

/**
 * A scalar as an inert JSON value.
 * @param value The scalar.
 * @returns The inert value, or undefined for a non-scalar.
 */
function inertScalar(value: unknown): unknown {
	if (value === null) {
		return null;
	}
	const handler = SCALAR_HANDLERS[typeof value];
	return handler === undefined ? undefined : handler(value);
}

/**
 * An array as an inert JSON array, bounded in length.
 * @param value The array.
 * @param depth The nesting depth.
 * @param seen The objects on the current path.
 * @returns The inert array.
 */
function inertArray(value: readonly unknown[], depth: number, seen: WeakSet<object>): unknown[] {
	const entries = value
		.slice(0, VALUE_ARRAY_LIMIT)
		.map((entry) => inertValue(entry, depth + 1, seen));
	if (value.length > VALUE_ARRAY_LIMIT) {
		entries.push(`[${value.length - VALUE_ARRAY_LIMIT} entries omitted]`);
	}
	return entries;
}

/**
 * An object as an inert JSON object, bounded in keys and sorted.
 * @param value The object.
 * @param depth The nesting depth.
 * @param seen The objects on the current path.
 * @returns The inert object.
 */
function inertObject(
	value: Record<string, unknown>,
	depth: number,
	seen: WeakSet<object>,
): Record<string, unknown> {
	const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
	const kept = entries
		.slice(0, VALUE_KEY_LIMIT)
		.map(([key, entry]): [string, unknown] => [key, inertValue(entry, depth + 1, seen)]);
	if (entries.length > VALUE_KEY_LIMIT) {
		kept.push(["[omitted]", `${entries.length - VALUE_KEY_LIMIT} properties`]);
	}
	return Object.fromEntries(kept);
}

/**
 * Any value as an inert JSON value: no functions, no cycles, no unbounded growth.
 * @param value The value.
 * @param depth The nesting depth.
 * @param seen The objects on the current path.
 * @returns The inert value.
 */
function inertValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
	const scalar = inertScalar(value);
	if (scalar !== undefined) {
		return scalar;
	}
	if (!Array.isArray(value) && !isRecord(value)) {
		return "[unsupported]";
	}
	return inertContainer(value, depth, seen);
}

/**
 * An array or object as an inert JSON value, refusing depth and cycles.
 * @param value The container.
 * @param depth The nesting depth.
 * @param seen The objects on the current path.
 * @returns The inert value.
 */
function inertContainer(
	value: readonly unknown[] | Record<string, unknown>,
	depth: number,
	seen: WeakSet<object>,
): unknown {
	if (depth >= VALUE_DEPTH_LIMIT) {
		return "[depth limit]";
	}
	if (seen.has(value)) {
		return "[circular]";
	}
	seen.add(value);
	try {
		return isRecord(value) ? inertObject(value, depth, seen) : inertArray(value, depth, seen);
	} finally {
		seen.delete(value);
	}
}

/**
 * A value as bounded, inert JSON text.
 * @param value The value.
 * @returns The text and the omitted count.
 */
function boundedDetails(value: unknown): BoundedText {
	let serialized: string;
	try {
		serialized = JSON.stringify(inertValue(value, 0, new WeakSet()), null, 2);
	} catch {
		serialized = "[Details could not be serialized.]";
	}
	return boundedText(serialized, DETAIL_TEXT_LIMIT);
}

/**
 * A value as a record, or null.
 * @param value The value.
 * @returns The record, or null.
 */
function record(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

/**
 * A string field of a record, or the empty string.
 * @param value The value.
 * @param key The field.
 * @returns The string.
 */
function textField(value: unknown, key: string): string {
	const field = record(value)?.[key];
	return typeof field === "string" ? field : "";
}

/**
 * The strings of an array, or none.
 * @param value The value.
 * @returns The strings.
 */
function stringList(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

/**
 * A link admitted only when it is HTTP or HTTPS.
 * @param value The value.
 * @returns The normalised URL, or null.
 */
function safeHttpUrl(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
	} catch {
		return null;
	}
}

export {
	boundedDetails,
	boundedText,
	isRecord,
	record,
	safeHttpUrl,
	stringList,
	textField,
	type BoundedText,
};
