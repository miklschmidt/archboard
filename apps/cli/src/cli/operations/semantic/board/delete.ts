// Deleting a board (ADR 0057, TASK-526.06).
//
// The whole note goes, every variant with it, through the same write boundary
// as every other write: the lease, the doing line and the version it was read
// at. It is refused while a node on another board of the vault opens the
// board. The answer lists the embeds the board tracked, so the person knows
// which pictures now show a board that is gone; each one's embeds check says
// so in its own repository. The browser offers no delete.

import { z } from "zod";
import { BoardDiscardAnswerSchema, BoardOpenedByAnswerSchema } from "@archboard/board/commands";
import { discardSemanticBoardOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "#cli/protocol/contract/refusals.ts";
import {
	editedVersion,
	expectVersionRefusal,
} from "#cli/operations/semantic/input/semantic-input.ts";

const DeleteInputSchema = z.object({ name: z.string() });

/** The delete's answer: the board that went, the version it was at, and the embeds it tracked. */
const DeleteResultSchema = BoardDiscardAnswerSchema.shape.discarded;
type DeleteResult = z.infer<typeof DeleteResultSchema>;

/**
 * A delete refused because other boards open the board, with each node that
 * does named after its reason, so the person knows which drill-down to change.
 * @param error What the delete threw.
 * @returns The same error, naming each node when that is why it was refused.
 */
function namingEachOpener(error: unknown): unknown {
	if (!(error instanceof Error) || !("answer" in error)) return error;
	const refused = BoardOpenedByAnswerSchema.safeParse(error.answer);
	if (!refused.success) return error;
	error.message = [
		error.message,
		...refused.data.openedBy.map(
			(one) => `  node ${one.node} of "${one.board}" (variant ${one.variant}) opens it`,
		),
	].join("\n");
	return error;
}

/**
 * What a delete is worth saying out loud: which board went, and each embed
 * that now shows a board that is gone.
 * @param deleted The answer.
 * @returns The lines to print.
 */
function deletedLines(deleted: DeleteResult): string[] {
	return [
		`Semantic board "${deleted.board}" was deleted at version ${deleted.version}.`,
		...deleted.trackedEmbeds.map(
			(embed) =>
				`  ${embed.repo} ${embed.path} showed it: its embeds check now reports the board missing.`,
		),
	];
}

const semanticDeleteContract = defineCommand({
	path: ["semantic", "delete"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Delete a board, with every variant",
	description: [
		"Deletes the whole board in the vault that this command finds. The note goes with every variant, and the board's name and former names are free for a new board. It takes the board's lease, as every write does, and states the version it read.",
		"",
		"It is refused:",
		"- BOARD_HELD: while somebody else holds the board.",
		"- BOARD_OPENED_BY: while a node on a current or draft variant of another board in the vault opens the board. The refusal names each node, to remove or point elsewhere first.",
		"",
		"After the delete:",
		"- The answer lists the embeds that the board tracked. The embeds check of each one then reports the board as missing.",
		"- Every pane that showed the board is told that it is gone.",
		"- This writer's claim on the board ends.",
		"",
		"A board in another repository's vault that opens the board cannot be seen from here. That vault's own check names the link once the board is gone.",
	].join("\n"),
	examples: [
		'archboard semantic delete "Old ingest" --expect-version 14 --doing "deleting the board of the ingest that was removed"',
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name, as it is now or as it was",
		},
	],
	input: { ingress: DeleteInputSchema },
	result: DeleteResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The board that went, the version it was at and the embeds it tracked",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the delete.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["local-read", "server-state-write"],
	refusals: [
		serverRefusal,
		doingRefusal,
		expectVersionRefusal,
		boardHeldRefusal,
		boardVersionRefusal,
		claimRevokedRefusal,
		{
			code: "BOARD_OPENED_BY",
			exit: 5,
			stream: "stderr",
			description: "A node on another board of the vault opens the board; the refusal names each.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/discard",
			cardinality: "one",
			description: "Delete the board",
		},
	],
	/**
	 * Delete the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board that went.
	 */
	async handler(input, context) {
		await context.require("server", "semantic delete");
		const version = editedVersion(input.name);
		const result = await discardSemanticBoardOnServer(input.name, version).catch(
			(error: unknown) => {
				throw namingEachOpener(error);
			},
		);
		return { result, diagnostics: deletedLines(result) };
	},
});

export { semanticDeleteContract };
