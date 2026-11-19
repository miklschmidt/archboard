// The shape a route reads a body through, and a thrown value as the message it answers with.

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
 * A thrown value as the message a route answers with.
 * @param error The thrown value.
 * @returns Its message, or the value's string form when it is not an Error.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { bodyOf, isRecord, messageOf };
