// Reading an untrusted value as a board (ADR 0023): the shape from the one Zod
// schema, then the rules a shape cannot state. Nothing here reads a file, mints
// an id or draws anything.

import { z } from "zod";
import { SemanticBoardSchema, type SemanticBoard } from "#shared/schemas/board-document.ts";
import { checkSemanticBoard, describeIntegrityIssues } from "#shared/rules/coherence/integrity.ts";

/** A document that parsed and is coherent, or the reason it is neither. */
type SemanticBoardParse =
	| { readonly ok: true; readonly board: SemanticBoard }
	| { readonly ok: false; readonly problem: string };

/**
 * Read an untrusted value as a board: the shape first, then the rules the
 * shape cannot state. Both failures come back the same way, because a caller
 * that has to tell them apart is a caller deciding whether to draw something
 * incoherent.
 * @param value Anything at all, typically the contents of a board file.
 * @returns The board, or why it is not one.
 */
function parseSemanticBoard(value: unknown): SemanticBoardParse {
	const parsed = SemanticBoardSchema.safeParse(value);
	if (!parsed.success) {
		return { ok: false, problem: z.prettifyError(parsed.error) };
	}
	const issues = checkSemanticBoard(parsed.data);
	if (issues.length > 0) {
		return { ok: false, problem: describeIntegrityIssues(issues) };
	}
	return { ok: true, board: parsed.data };
}

export { type SemanticBoardParse, parseSemanticBoard };
