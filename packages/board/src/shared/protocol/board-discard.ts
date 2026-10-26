// The contract of deleting a whole board (ADR 0057, TASK-526.06): what the
// delete answers, and each node its refusal for a board that another board
// opens names. The store's result is built from these types, the route answers
// with them, and the client parses them, so the three cannot drift apart.

import { z } from "zod";
import { TrackedEmbedSchema } from "#shared/schemas/board-document.ts";

/** One node on another board of the vault whose drill-down opens the board. */
interface BoardOpener {
	/** The name of the board that carries the node. */
	readonly board: string;
	/** The id of the variant that carries it. */
	readonly variant: string;
	/** The id of the node. */
	readonly node: string;
}

/**
 * What a delete answers with: the board that went, the version it was at, and
 * every embed its board listed, which now show a board that is gone.
 */
const BoardDiscardAnswerSchema = z.object({
	success: z.literal(true),
	discarded: z.object({
		board: z.string(),
		version: z.int(),
		trackedEmbeds: z.array(TrackedEmbedSchema),
	}),
});

export { BoardDiscardAnswerSchema, type BoardOpener };
