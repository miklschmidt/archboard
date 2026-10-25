// Moving a board to another repository's vault (ADR 0051, TASK-472.15).
//
// The board in the vault this command finds moves into the vault found from
// `--to <dir>`, as `-C` finds one. The whole note moves with every variant,
// former name and subject id, and every drill-down the move changes is
// rewritten to name a repository identity. The server writes the target note
// first, then the rewritten drill-downs, and deletes the source note last; a
// move that stopped part way is finished by running it again.

import { z } from "zod";
import {
	BoardMoveAnswerSchema,
	MoveEndSchema,
	MovedDrillDownSchema,
} from "@archboard/board/commands";
import { moveSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "#cli/protocol/contract/refusals.ts";
import { AnsweredVaultSchema } from "#cli/protocol/contract/schemas.ts";
import { findVaultOf } from "#cli/operations/invocation/addressed-vault.ts";
import {
	editedVersion,
	expectVersionRefusal,
	SelectorSchema,
} from "#cli/operations/semantic/input/semantic-input.ts";

type MovedDrillDown = z.infer<typeof MovedDrillDownSchema>;

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
 * One rewritten drill-down, in words.
 * @param one The drill-down.
 * @returns The line.
 */
function rewrittenLine(one: MovedDrillDown): string {
	return (
		`  rewrote node ${one.node} of "${one.board}" (variant ${one.variant}): it opens ` +
		`"${one.drillDown.board}" of ${one.drillDown.repo ?? "its own vault"}`
	);
}

/**
 * The line that says a move chose the target's checkout, which the agent tells the user.
 * @param moved The answer.
 * @returns The line, or none when the move changed no choice.
 */
function choiceLines(moved: MoveResult): string[] {
	const { chose } = moved;
	if (chose === undefined) return [];
	const instead = chose.replaced === null ? "" : ` in place of ${chose.replaced}`;
	return [
		`This machine now reads ${chose.checkout} for ${chose.repository}${instead}: every pane of it reads this checkout. Tell the user.`,
	];
}

/**
 * What a move is worth saying out loud: where the board went, every
 * drill-down it rewrote, and the choice of checkout it made.
 * @param moved The answer.
 * @returns The lines to print.
 */
function movedLines(moved: MoveResult): string[] {
	return [
		`Semantic board "${moved.board.name}" moved from ${endWords(moved.from)} to ${endWords(moved.to)}, ` +
			`and is now at version ${moved.version} in ${moved.to.vault}.`,
		...moved.rewritten.map(rewrittenLine),
		...choiceLines(moved),
	];
}

/** What a move that stopped part way answers with, beside its reason. */
const StoppedMoveSchema = z.object({
	code: z.literal("MOVE_STOPPED"),
	rewritten: z.array(MovedDrillDownSchema),
});

/**
 * A move that stopped part way, with every drill-down it rewrote before it
 * stopped named after its reason. Run again, the move rewrites only what is
 * left, so its answer cannot name these.
 * @param error What the move threw.
 * @returns The same error, saying what was rewritten when the move stopped.
 */
function sayingWhatWasRewritten(error: unknown): unknown {
	if (!(error instanceof Error) || !("answer" in error)) return error;
	const stopped = StoppedMoveSchema.safeParse(error.answer);
	if (!stopped.success) return error;
	error.message = [error.message, ...stopped.data.rewritten.map(rewrittenLine)].join("\n");
	return error;
}

const semanticMoveContract = defineCommand({
	path: ["semantic", "move"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Move a board, with every variant, into another repository's vault",
	description:
		"Moves the whole board in the vault this command finds into the vault found from --to, as -C " +
		"finds one: every variant, every former name and every subject id stay as they are, and the " +
		"board keeps its name. Every drill-down whose meaning the move changes is rewritten, on every " +
		"variant: one in the source vault that opens the board then names the target's repository; " +
		"one on the board that opens another board of the source vault then names the source's " +
		"repository; and one in the target vault, the board's own included, that opens the board " +
		"through the source's repository then names no repository. The answer lists every drill-down " +
		"it rewrote. The move holds the board in the source vault and its name in the target vault, " +
		"writes the target vault first, then the rewritten drill-downs of the source vault, and " +
		"deletes the source note last. A move that stopped part way leaves the board in both vaults " +
		"and lists the drill-downs it rewrote already, and running the same move again finishes it. " +
		"Each repository commits its own half. It is refused between two checkouts of one " +
		"repository, while somebody else holds the board or its name in the target vault, when the " +
		"target vault has a board or a " +
		"former name that the board's names answer to, and when it needs a drill-down into an " +
		"untracked vault, which has no identity to name. A pane that showed the board shows it in " +
		"its new repository. When --to is a known checkout that is not the chosen one of its " +
		"repository, a finished move makes it the chosen one for the whole machine, as an agent's " +
		"browser show does, and the answer's chose names the checkout it replaced. The move ends this writer's claim on the board; claim it again in the " +
		"target vault to go on.",
	examples: [
		'archboard semantic move Payments --to ../payments --expect-version 14 --doing "moving the board into the repository it describes"',
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
		expectVersionRefusal,
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
				"The target vault has a board or a former name that the board's names answer to, or a " +
				"copy of the board written there since an earlier run of the move.",
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
		editedVersion(input.name);
		const target = await findVaultOf(input.to, "--to");
		const moved = await moveSemanticBoardOnServer(input.name, target.path).catch(
			(error: unknown) => {
				throw sayingWhatWasRewritten(error);
			},
		);
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

export { sayingWhatWasRewritten, semanticMoveContract };
