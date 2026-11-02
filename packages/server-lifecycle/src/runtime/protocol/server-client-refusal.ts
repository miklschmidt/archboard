// A model write the Archboard server turned away, and how a caller recognises one.
//
// A refusal is a result, not a fault: it carries the model as the server
// holds it and the version the writer should have been working from, so the
// CLI can answer without reading the model again.

import { isRecord } from "@archboard/diagnostics/unknown-record";

interface ModelRefusal {
	success: false;
	code: string;
	error: string;
	/** The version the model is actually at, so the next write can state it. */
	version: number | null;
	[key: string]: unknown;
}

const MODEL_REFUSAL_CODES = new Set(["MODEL_HELD", "MODEL_VERSION_CONFLICT", "CLAIM_REVOKED"]);

/**
 * Whether an answer is a refused model write, which is decided by the shape
 * the write boundary promises rather than by the code it carries.
 * @param data Anything the server answered with.
 * @returns True when the answer is a refusal.
 */
function isModelRefusal(data: unknown): data is ModelRefusal {
	if (!isRecord(data)) {
		return false;
	}
	return (
		data["success"] === false &&
		typeof data["code"] === "string" &&
		typeof data["error"] === "string" &&
		Array.isArray(data["document"]) &&
		isVersion(data["version"])
	);
}

/**
 * Whether a value is a model version: a number, or null for a model whose
 * note carries none.
 * @param value The value.
 * @returns True when it is one.
 */
function isVersion(value: unknown): boolean {
	return typeof value === "number" || value === null;
}

export { type ModelRefusal, MODEL_REFUSAL_CODES, isModelRefusal };
