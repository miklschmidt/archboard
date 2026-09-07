// A board write the canvas turned away, and how a caller recognises one.
//
// A refusal is a result, not a fault: it carries the board as the canvas
// holds it and the version the writer should have been working from, so the
// CLI can answer without reading the board again.

import { isRecord } from "@/runtime/engine/lib/unknown-record";
import type { ServerElement } from "@/runtime/engine/types";

interface BoardRefusal {
	success: false;
	code: string;
	error: string;
	document: ServerElement[];
	version: number | null;
	[key: string]: unknown;
}

const BOARD_REFUSAL_CODES = new Set(["BOARD_HELD", "BOARD_VERSION_CONFLICT", "CLAIM_REVOKED"]);

/**
 * Whether an answer is a refused board write, which is decided by the shape
 * the write boundary promises rather than by the code it carries.
 * @param data Anything the canvas answered with.
 * @returns True when the answer is a refusal.
 */
function isBoardRefusal(data: unknown): data is BoardRefusal {
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
 * Whether a value is a board version: a number, or null for a board whose
 * note carries none.
 * @param value The value.
 * @returns True when it is one.
 */
function isVersion(value: unknown): boolean {
	return typeof value === "number" || value === null;
}

export { type BoardRefusal, BOARD_REFUSAL_CODES, isBoardRefusal };
