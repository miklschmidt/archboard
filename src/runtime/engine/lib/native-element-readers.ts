// The refusal an unreadable element raises, and the readers every part of one
// is checked with.
//
// Every reader takes the same four things beside its value: the context the
// caller is in, the element's id and type where they are known, and the path
// within the element. Together they make the one sentence a refusal says,
// which is what makes an unreadable board a message rather than a stack
// trace.

import { isRecord } from "@/runtime/engine/lib/unknown-record";

class NativeElementValidationError extends Error {
	public readonly status = 400;

	/**
	 * A refusal a route answers with rather than failing on.
	 * @param message What was wrong, and where.
	 */
	public constructor(message: string) {
		super(message);
		this.name = "NativeElementValidationError";
	}
}

/**
 * Refuse the element, naming where it stopped being one.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the trouble is.
 * @throws {NativeElementValidationError} Always.
 */
function fail(
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): never {
	throw new NativeElementValidationError(
		`${context}: invalid element${id ? ` ${id}` : ""}${type ? ` (${type})` : ""} at ${path}`,
	);
}

/**
 * The value as a record of fields, refusing anything else — an array
 * included, because an element and its parts are objects with names.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The record.
 */
function recordAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): Record<string, unknown> {
	if (!isRecord(value) || Array.isArray(value)) {
		fail(context, id, type, path);
	}
	return value;
}

/**
 * The value as a number a renderer can use, refusing NaN and Infinity.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The number.
 */
function finite(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		fail(context, id, type, path);
	}
	return value;
}

/**
 * The value as one point of a path.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The point.
 */
function point(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number] {
	if (!Array.isArray(value) || value.length !== 2) {
		fail(context, id, type, path);
	}
	return [
		finite(value[0], context, id, type, `${path}[0]`),
		finite(value[1], context, id, type, `${path}[1]`),
	];
}

/**
 * The value as a point, or null where the element has none.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The point, or null.
 */
function nullablePoint(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number] | null {
	return value === null ? null : point(value, context, id, type, path);
}

/**
 * The value as a path of at least `minimum` points.
 * @param value The value.
 * @param minimum How many points the element's type needs.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The points.
 */
function points(
	value: unknown,
	minimum: number,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number][] {
	if (!Array.isArray(value) || value.length < minimum) {
		fail(context, id, type, path);
	}
	return value.map((candidate, index) => point(candidate, context, id, type, `${path}[${index}]`));
}

/**
 * The value as text.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The text.
 */
function stringAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): string {
	if (typeof value !== "string") {
		fail(context, id, type, path);
	}
	return value;
}

/**
 * The value as a flag.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The flag.
 */
function booleanAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): boolean {
	if (typeof value !== "boolean") {
		fail(context, id, type, path);
	}
	return value;
}

/**
 * The value as a flag, or null where the element leaves it unsaid.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @param path Where in the element the value is.
 * @returns The flag, or null.
 */
function nullableBooleanAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): boolean | null {
	return value === null ? null : booleanAt(value, context, id, type, path);
}

/**
 * The value as text, or null where the element has none.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id, where it has a readable one.
 * @param type The element's type, where it has a readable one.
 * @param path Where in the element the value is.
 * @returns The text, or null.
 */
function nullableStringAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): string | null {
	return value === null ? null : stringAt(value, context, id, type, path);
}

export {
	NativeElementValidationError,
	booleanAt,
	fail,
	finite,
	nullableBooleanAt,
	nullablePoint,
	nullableStringAt,
	point,
	points,
	recordAt,
	stringAt,
};
