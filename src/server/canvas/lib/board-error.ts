import { z } from "zod";
import { BoardRequiredError, BoardResolutionError } from "@/runtime/engine/board-target";
import { BoardMutationError } from "@/runtime/engine/board-write";
import { BoardHeldError } from "@/runtime/engine/board-lock";
import { BoardWriteConflictError } from "@/runtime/engine/board-io";
import { RenderGeometryError } from "@/runtime/engine/geometry";
import { NativeElementValidationError } from "@/runtime/engine/native-element";
import { BoardRendererError } from "@/server/board-rendering";

/**
 * The message a thrown value carries, read through an object wrapper so a
 * thrown string or number answers too.
 * @param error Whatever a route threw.
 * @returns The message, or undefined for a value that carries none.
 */
function errorMessage(error: unknown): unknown {
	if (error === null || error === undefined) {
		throw new TypeError("A board error must be a non-nullish value");
	}
	return Reflect.get(new Object(error), "message");
}

/** The refusals that carry their own status, and every other typed failure's. */
const STATUS_BY_ERROR: readonly [new (...args: never[]) => unknown, number | "own"][] = [
	[z.ZodError, 400],
	[BoardRequiredError, "own"],
	[BoardResolutionError, "own"],
	[BoardMutationError, "own"],
	[BoardRendererError, 503],
	[RenderGeometryError, 400],
	[NativeElementValidationError, 400],
	[BoardWriteConflictError, 409],
	[BoardHeldError, 409],
];

// A failure that carries no type still says, in words, that the caller named
// something that does not exist or is not addressable. That is a bad request
// rather than a fault of the canvas, and this is what tells the two apart.
const CALLER_MISTAKE =
	/is not open|Invalid board name|Invalid variant|Invalid level|No vault configured|outside the vault|No pane called|matches \d+ panes|No pane is open|needs a pane/u;

/**
 * The HTTP status a board failure answers with.
 * @param error Whatever a route threw.
 * @returns The status.
 */
function boardErrorStatus(error: unknown): number {
	for (const [constructor, status] of STATUS_BY_ERROR) {
		if (!(error instanceof constructor)) {
			continue;
		}
		if (status !== "own") {
			return status;
		}
		const own: unknown = Reflect.get(new Object(error), "status");
		return typeof own === "number" ? own : 500;
	}
	return CALLER_MISTAKE.test(String(errorMessage(error))) ? 400 : 500;
}

/**
 * What a failure says, with a schema refusal's several issues joined into one
 * sentence.
 * @param error Whatever a route threw.
 * @returns The message.
 */
function boardErrorMessage(error: unknown): unknown {
	if (!(error instanceof z.ZodError)) {
		return errorMessage(error);
	}
	return error.issues.map((issue) => issue.message).join("; ");
}

/**
 * The extra fields a board-addressing failure adds to its answer.
 * @param error Whatever a route threw.
 * @returns The fields, or null when this is not one of those failures.
 */
function addressingErrorDetail(error: unknown): Record<string, unknown> | null {
	if (error instanceof BoardRequiredError) {
		return { code: error.code, available: error.available };
	}
	if (error instanceof BoardResolutionError) {
		return {
			code: error.code,
			board: error.board,
			reason: error.reason,
			...(error.files.length > 0 ? { files: error.files } : {}),
		};
	}
	return null;
}

/**
 * The extra fields a failure to write adds to its answer: the conflict a
 * checked write found, or who is holding the board.
 * @param error Whatever a route threw.
 * @returns The fields, or null when this is not one of those failures.
 */
function writeErrorDetail(error: unknown): Record<string, unknown> | null {
	if (error instanceof BoardWriteConflictError) {
		return { conflict: error.conflict };
	}
	if (error instanceof BoardHeldError) {
		return { code: error.code, board: error.board, holder: error.holder, waitedMs: error.waitedMs };
	}
	if (error instanceof BoardRendererError) {
		return { code: error.code };
	}
	if (error instanceof BoardMutationError && error.code) {
		return { code: error.code };
	}
	return null;
}

/**
 * What a typed failure adds to its answer beyond the message: the code, and
 * whatever the caller needs in order to act on it.
 * @param error Whatever a route threw.
 * @returns The extra fields, or none for an untyped failure.
 */
function boardErrorDetail(error: unknown): Record<string, unknown> {
	return addressingErrorDetail(error) ?? writeErrorDetail(error) ?? {};
}

/**
 * The body a board failure answers with.
 * @param error Whatever a route threw.
 * @returns The response body.
 */
function boardErrorBody(error: unknown): Record<string, unknown> {
	return { success: false, error: boardErrorMessage(error), ...boardErrorDetail(error) };
}

export { boardErrorBody, boardErrorStatus };
