// Moving a board to another repository's vault (ADR 0051, TASK-472.15).
//
// The board in the vault this command finds moves into the vault found from
// `--to <dir>`, as `-C` finds one. The whole note moves with every variant,
// former name and subject id, and every drill-down the move changes is
// rewritten to name a repository identity. The server writes the target note
// first, then the rewritten drill-downs, and deletes the source note last; a
// move that stopped part way is finished by running it again.

import { z } from "zod";
import { BoardMoveAnswerSchema, MoveEndSchema } from "@/shared/semantic-board/index";
import { moveSemanticBoardOnServer } from "@/runtime/semantic-board-client/index";
import { defineCommand } from "@/cli/command-contract/contract";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "@/cli/command-contract/common";
import { AnsweredVaultSchema } from "@/cli/command-contract/schemas";
import { findVaultOf } from "@/cli/command-routing/index";
import { SelectorSchema } from "@/cli/commands/lib/semantic-input";

const MoveInputSchema = z.object({ name: z.string(), to: SelectorSchema });

/** The move's answer; the target says when this command registered what holds it. */
const MoveResultSchema = BoardMoveAnswerSchema.extend({
	to: MoveEndSchema.extend({ registered: AnsweredVaultSchema.shape.registered }),
});
type MoveResult = z.infer<typeof MoveResultSchema>;

/**
 * One end of a move, in words: its repository, or the untracked vault.
 * @param end The end.
 * @returns The words.
 */
function endWords(end: MoveResult["from"]): string {
	return end.repository ?? `the untracked vault ${end.vault}`;
}

/**
 * What a move is worth saying out loud: where the board went, and every
 * drill-down it rewrote.
 * @param moved The answer.
 * @returns The lines to print.
 */
function movedLines(moved: MoveResult): string[] {
	return [
		`Semantic board "${moved.board.name}" moved from ${endWords(moved.from)} to ${endWords(moved.to)}, ` +
			`and is now at version ${moved.version} in ${moved.to.vault}.`,
		...moved.rewritten.map(
			(one) =>
				`  rewrote node ${one.node} of "${one.board}" (variant ${one.variant}): it opens ` +
				`"${one.drillDown.board}" of ${one.drillDown.repo ?? "its own vault"}`,
		),
	];
}

const semanticMoveContract = defineCommand({
	path: ["semantic", "move"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Move a board, with every variant, into another repository's vault",
	description:
		"Moves the whole board in the vault this command finds into the vault found from --to, as -C " +
		"finds one: every variant, every former name and every subject id stay as they are, and the " +
		"board keeps its name. A drill-down whose meaning the move changes is rewritten to name a " +
		"repository identity: one in the source vault that opens the board then names the target's " +
		"repository, and one on the board that opens a board of the source vault then names the " +
		"source's repository. The answer lists every drill-down it rewrote. The move holds the board " +
		"in the source vault and its name in the target vault, writes the target note first, then the " +
		"rewritten drill-downs, and deletes the source note last. A move that stopped part way leaves " +
		"the board in both vaults, and running the same move again finishes it. Each repository " +
		"commits its own half. It is refused between two checkouts of one repository, while somebody " +
		"else holds the board or its name in the target vault, when the target vault has a board or a " +
		"former name that the board's names answer to, and when it needs a drill-down into an " +
		"untracked vault, which has no identity to name. A stated --expect-version is checked.",
	examples: [
		'archboard semantic move Payments --to ../payments --doing "moving the board into the repository it describes"',
		'archboard -C ~/meta semantic move Payments --to ~/payments --expect-version 14 --doing "moving the board into the repository it describes"',
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name, as it is now or as it was",
		},
		{
			kind: "option",
			key: "to",
			spellings: ["--to"],
			value: "required",
			placeholder: "dir",
			required: true,
			description: "A directory whose vault the board moves to, found as -C finds one",
		},
	],
	input: { ingress: MoveInputSchema },
	result: MoveResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description:
					"The board in its new vault, both ends of the move and every rewritten drill-down",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the move.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["local-read", "server-state-write"],
	refusals: [
		serverRefusal,
		doingRefusal,
		boardHeldRefusal,
		boardVersionRefusal,
		claimRevokedRefusal,
		{
			code: "MOVE_SAME_REPOSITORY",
			exit: 2,
			stream: "stderr",
			description: "--to names the board's own vault or another checkout of its repository.",
		},
		{
			code: "MOVE_NEEDS_IDENTITY",
			exit: 2,
			stream: "stderr",
			description: "The move needs a drill-down into an untracked vault, which has no identity.",
		},
		{
			code: "BOARD_EXISTS",
			exit: 5,
			stream: "stderr",
			description:
				"The target vault has a board or a former name that the board's names answer to.",
		},
		{
			code: "MOVE_STOPPED",
			exit: 5,
			stream: "stderr",
			description:
				"The move wrote the target note and stopped before the source note went; run it again.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/move",
			cardinality: "one",
			description: "Move the board",
		},
	],
	/**
	 * Move the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The move's answer.
	 */
	async handler(input, context) {
		await context.require("server", "semantic move");
		const target = await findVaultOf(input.to);
		const moved = await moveSemanticBoardOnServer(input.name, target.path);
		const result: MoveResult = {
			...moved,
			to: {
				...moved.to,
				...(target.registered === undefined ? {} : { registered: target.registered }),
			},
		};
		return { result, diagnostics: movedLines(result) };
	},
});

export { semanticMoveContract };
