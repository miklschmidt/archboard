// What a request says about the board it is for, and the two shapes every
// route reads a body through.
//
// Small on purpose. A request names a board, and whether that board exists is
// the semantic store's question, not this file's: every route asks the store
// and answers with the store's own refusal, so there is one account of "no
// such board" rather than one per route.

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
 * One string field of a request's body.
 * @param req The request.
 * @param key The field.
 * @returns The value, or undefined when it is absent or not a string.
 */
function bodyString(req: Request, key: string): string | undefined {
	const value = bodyOf(req)[key];
	return typeof value === "string" ? value : undefined;
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

/**
 * The board a request names: `?board=` first, then the body's `board`.
 * @param req The request.
 * @returns The board as the caller spelled it, or undefined when it named none.
 */
function boardOfRequest(req: Request): string | undefined {
	return queryString(req, "board") ?? bodyString(req, "board");
}

/**
 * A thrown value as the message a route answers with.
 * @param error The thrown value.
 * @returns Its message, or the value's string form when it is not an Error.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { boardOfRequest, bodyOf, bodyString, isRecord, messageOf, queryString };
