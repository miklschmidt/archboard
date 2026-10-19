// The contract of moving a board to another repository's vault (ADR 0051):
// what the call states, and what it answers. The store's result is built from
// these types, the route answers with them, and the client parses them, so
// the three cannot drift apart.

import { z } from "zod";
import { SemanticBoardSchema } from "#shared/schemas/board-document.ts";
import { DrillDownSchema } from "#shared/schemas/content.ts";

/**
 * Where a board moves: the target vault's own directory on this machine, as a
 * call names its vault (ADR 0049). A path, because the call is made at run
 * time on this machine; nothing written to a note holds it.
 */
const BoardMoveInputSchema = z.object({ to: z.string().min(1) }).strict();

/** One end of a move: a vault, and the repository identity of its checkout. */
const MoveEndSchema = z.object({
	vault: z.string(),
	/** The identity of the vault's checkout, or null for an untracked vault. */
	repository: z.string().nullable(),
});
type MoveEnd = z.infer<typeof MoveEndSchema>;

/** One drill-down a move rewrote, where it is and what it now says. */
const MovedDrillDownSchema = z.object({
	/** The vault of the board that carries it, after the move. */
	vault: z.string(),
	/** The name of the board that carries it. */
	board: z.string(),
	/** The id of the variant that carries it. */
	variant: z.string(),
	/** The id of the node that carries it. */
	node: z.string(),
	/** The drill-down as it now reads. */
	drillDown: DrillDownSchema,
});
type MovedDrillDown = z.infer<typeof MovedDrillDownSchema>;

/**
 * The choice of checkout a finished move made: a target in a known checkout
 * that was not the chosen one of its repository becomes the chosen one, as an
 * agent's show makes it (ADR 0050), so the app reads the board where it is now.
 */
const MoveChoiceSchema = z.object({
	repository: z.string(),
	/** The checkout chosen now: the target's. */
	checkout: z.string(),
	/** The checkout chosen before, or null when the repository had none chosen. */
	replaced: z.string().nullable(),
});

/**
 * What a move answers with: the board as it now stands in the target vault,
 * both ends of the move, every drill-down it rewrote, and the choice of
 * checkout it made, only when it changed one.
 */
const BoardMoveAnswerSchema = z.object({
	success: z.literal(true),
	board: SemanticBoardSchema,
	version: z.int(),
	from: MoveEndSchema,
	to: MoveEndSchema,
	rewritten: z.array(MovedDrillDownSchema),
	chose: MoveChoiceSchema.optional(),
});
type BoardMoveAnswer = z.infer<typeof BoardMoveAnswerSchema>;

/**
 * What a move would do now, asked before a person moves a board: the version
 * the move is to state, both ends, and every drill-down it would rewrite, each
 * as it would read. Nothing is held or written to answer it.
 */
const BoardMovePreviewSchema = z.object({
	success: z.literal(true),
	version: z.int(),
	from: MoveEndSchema,
	to: MoveEndSchema,
	rewritten: z.array(MovedDrillDownSchema),
});
type BoardMovePreview = z.infer<typeof BoardMovePreviewSchema>;

export {
	BoardMoveAnswerSchema,
	type BoardMoveAnswer,
	BoardMoveInputSchema,
	BoardMovePreviewSchema,
	type BoardMovePreview,
	MoveEndSchema,
	type MoveEnd,
	MovedDrillDownSchema,
	type MovedDrillDown,
};
