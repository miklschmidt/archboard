// Giving a board, or one variant of it, a better name (TASK-281, ADR 0036).
//
// A rename goes through the same write boundary as everything else — the same
// lease, the same expected version, one atomic write, one version advance — and
// changes nothing but a name. The old name is kept, so every drill-down, saved
// pane address and command that named it goes on opening it.

import { z } from "zod";
import { BoardRenameInputSchema } from "@archboard/board/commands";
import { renameSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
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
	SelectorSchema,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	describedWrite,
	SemanticBoardResultSchema,
	writeResult,
} from "#cli/operations/semantic/input/write-answer.ts";

const RenameInputSchema = z.object({
	name: z.string(),
	to: SelectorSchema,
	variant: SelectorSchema.optional(),
});

const semanticRenameContract = defineCommand({
	path: ["semantic", "rename"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Give a board, or one of its variants, another name",
	description: [
		"Renames the board, or with --variant one variant of it, and changes nothing else. Every id, every variant with its lifecycle and ancestry, and every record of adoption, shelving and reconciliation stay as they were.",
		"",
		"The old name:",
		"- The command keeps the old name as a former name. It goes on opening the board or variant.",
		"- A drill-down on another board, a saved pane address or a command that named it still reaches it.",
		"- Panes that show it move to the new name.",
		"- A board's file is renamed with it.",
		"",
		"A board name follows the usual rules. Case does not make two boards, and `@` is reserved for the variant. A change of case alone keeps every address as it is.",
		"",
		"Refusals:",
		"- A name that another board carries or used to carry.",
		"- A variant name that another variant of the board answers to.",
		"- A name that is already the one the board or variant has.",
	].join("\n"),
	examples: [
		'archboard semantic rename "Canvas server" --to "Archboard server" --expect-version 14 --doing "naming the board for the server it describes"',
		'archboard semantic rename "Archboard server" --variant readable-layout --to "Readable layout" --expect-version 15 --doing "giving the proposal a readable name"',
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
			placeholder: "name",
			required: true,
			description: "The name it goes by from now on",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: "Rename this variant, by id or name, instead of the board",
		},
	],
	input: { ingress: RenameInputSchema },
	result: SemanticBoardResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The board as it now stands, under the name it has now",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the board.
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
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/rename",
			cardinality: "one",
			description: "Rename the board or the variant",
		},
	],
	/**
	 * Rename the board or the variant.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic rename");
		editedVersion(input.name);
		const renaming = context.parse(BoardRenameInputSchema, {
			to: input.to,
			...(input.variant === undefined ? {} : { variant: input.variant }),
		});
		const written = await renameSemanticBoardOnServer(input.name, renaming);
		return { result: writeResult(written), diagnostics: describedWrite(written) };
	},
});

export { semanticRenameContract };
