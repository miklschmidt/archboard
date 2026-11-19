// The two fields a route reads a vault from: the query string and the JSON body.

import type { Request } from "express";

/** A decoded body, as far as a route can see before checking its shape. */
type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Whether a decoded value is a plain object.
 * @param value Any decoded value.
 * @returns True for an object that is not an array or null.
 */
function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A request's JSON body as a record, empty when it carried none.
 * @param req The request.
 * @returns The body.
 */
function bodyOf(req: Request): JsonRecord {
	return isRecord(req.body) ? req.body : {};
}

/**
 * One string field of a request's query string.
 * @param req The request.
 * @param key The field.
 * @returns The value, or undefined when it is absent or repeated.
 */
function queryString(req: Request, key: string): string | undefined {
	const value = req.query[key];
	return typeof value === "string" ? value : undefined;
}

export { bodyOf, queryString };
