// Asking the boards of a vault the design questions: which entry points only
// pass one call on, which containers have no hidden part and which have no
// entry point (ADR 0044, ADR 0057).
//
// The survey step of an architecture review reads every board at once, so the
// command reads every current variant of the vault and lists, for each question,
// the boards, containers and parts behind its count. It names the boards it read
// and the boards it skipped. Every result is a question for the reader, never a
// fault: the answer holds counts and names, and no score or verdict.

import { z } from "zod";
import {
	DesignQuestionsReplySchema,
	type DesignQuestionsReply,
} from "@archboard/board/design-questions";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { requestJson } from "@archboard/server-lifecycle/server-client";

const QuestionsInputSchema = z.object({ board: z.array(z.string()).optional() });

const boardMissingRefusal = {
	code: "BOARD_MISSING",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--board names a board the vault does not hold. The refusal lists the boards it holds, and nothing is read.",
};

/**
 * What to say about the answer on standard error, for a person.
 * @param reply The answer.
 * @returns The lines: how many boards were read, each skipped board, and each question's counts.
 */
function described(reply: DesignQuestionsReply): string[] {
	const { passThroughEntryPoints, containersWithNoHiddenPart, containersWithNoEntryPoint } =
		reply.questions;
	return [
		`Read ${reply.boards.length} board${reply.boards.length === 1 ? "" : "s"}, skipped ${reply.skipped.length}.`,
		...reply.skipped.map(
			(skip) =>
				`Skipped ${skip.board}: ${skip.reason === "board-unreadable" ? skip.detail : "it has no current variant"}`,
		),
		`Entry points that pass one call on: ${passThroughEntryPoints.parts} in ${passThroughEntryPoints.containers} containers.`,
		`Containers with no hidden part: ${containersWithNoHiddenPart.containers}.`,
		`Containers with no entry point: ${containersWithNoEntryPoint.containers}.`,
	];
}

const semanticQuestionsContract = defineCommand({
	path: ["semantic", "questions"],
	shared: ["url", "directory"],
	summary: "Ask every board the design questions",
	description:
		"Reads the current variant of every board of the vault and answers three questions, each as a " +
		"list of boards, containers and parts. Which entry points only pass one call on: an entry point " +
		"with no children that sends one relationship, of the same kind as every relationship it receives. " +
		"Which containers have no hidden part: every child is an entry point. Which containers have no " +
		"entry point: no relationship from outside reaches any child. Each question gives the count of " +
		"containers and parts and the results, each naming its board, its container and its parts. The " +
		"interface comes from the relationships a board draws, over the whole variant, as semantic inspect " +
		"--container derives it. Every result is a question for the reader, never a fault: the answer holds " +
		"no score and no verdict. The answer names the boards it read with the variant and version it read, " +
		"and the boards it skipped with the reason: no-current-variant for a board nobody has built, " +
		"board-unreadable for a file that is not a coherent board. A board that was skipped is not a board " +
		"with nothing to ask. A node with no children has no interface and is in no list. --board narrows " +
		"the answer to the boards it names, and may be given more than once. Nothing is written.",
	examples: [
		"archboard semantic questions",
		'archboard semantic questions --board "Command interface"',
		'archboard semantic questions --board "Command interface" --board "Board persistence"',
	],
	parameters: [
		{
			kind: "option",
			key: "board",
			spellings: ["--board"],
			value: "required",
			occurrences: "append",
			placeholder: "name",
			description:
				"Read only this board; repeat it to read several. Without it, every board of the vault is read",
		},
	],
	input: { ingress: QuestionsInputSchema },
	result: DesignQuestionsReplySchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The three design questions, the boards read and the boards skipped",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the questions.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal, boardMissingRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/vault/design-questions",
			cardinality: "one",
			description: "The design questions of the current variant of each board the vault holds",
		},
	],
	/**
	 * Ask the server for the design questions.
	 * @param input The boards to narrow to, if any.
	 * @param context The command context.
	 * @returns The answer and the lines that describe it.
	 */
	async handler(input, context) {
		await context.require("server", "semantic questions");
		const query = new URLSearchParams((input.board ?? []).map((board) => ["board", board]));
		const reply = DesignQuestionsReplySchema.parse(
			await requestJson<unknown>(
				`/api/vault/design-questions${query.size === 0 ? "" : `?${query}`}`,
				{ signal: context.signal },
			),
		);
		return { result: reply, diagnostics: described(reply) };
	},
});

export { semanticQuestionsContract };
