import { z } from "zod";
import { HistoricalCorrectionInputSchema } from "@archboard/board/commands";
import {
	HistoricalCorrectionPreviewAnswerSchema,
	HistoricalCorrectionSuggestionsAnswerSchema,
	correctHistoricalBoardOnServer,
	suggestHistoricalCommitsOnServer,
} from "#cli/clients/server/semantic-boards.ts";
import {
	CliUsageError,
	defineCommand,
	type CommandContext,
} from "#cli/protocol/contract/contract.ts";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "#cli/protocol/contract/refusals.ts";
import {
	SemanticBoardResultSchema,
	SelectorSchema,
	describedWrite,
	editedVersion,
	expectVersionRefusal,
	statedJson,
	writeResult,
} from "#cli/operations/semantic/input/semantic-input.ts";

const CorrectInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema,
	input: z.string().optional(),
	apply: z.boolean().default(false),
	suggest: z.boolean().default(false),
});

/**
 * Refuse contradictory suggestion options before contacting the server.
 * @param input The command arguments.
 */
function validateMode(input: z.infer<typeof CorrectInputSchema>): void {
	if (input.suggest && (input.apply || input.input !== undefined)) {
		throw new CliUsageError("--suggest cannot be combined with --apply or --input");
	}
}

/**
 * Read and validate the correction, using the explicitly selected variant.
 * @param input The command arguments.
 * @param context The invocation context.
 * @returns The correction to preview or write.
 */
async function statedCorrection(
	input: z.infer<typeof CorrectInputSchema>,
	context: CommandContext,
) {
	const stated = await statedJson(input, context);
	if (typeof stated !== "object" || stated === null || Array.isArray(stated)) {
		throw new CliUsageError("semantic correct needs a JSON object from --input or standard input");
	}
	return context.parse(HistoricalCorrectionInputSchema, { ...stated, variant: input.variant });
}

const semanticCorrectContract = defineCommand({
	path: ["semantic", "correct"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Preview or apply a correction to a historical variant",
	description:
		"Corrects an already built variant against explicit repository commits. JSON from --input or standard input states reason, revisions and edit. Preview is the default and writes nothing. --apply writes the checked correction. Both require --expect-version. --suggest returns timestamp-based commit guesses for inspection, without JSON or a write.",
	examples: [
		"archboard semantic correct Payments --variant v1 --expect-version 8 --input correction.json",
		'archboard semantic correct Payments --variant v1 --expect-version 8 --input correction.json --apply --doing "correcting the historical dependency"',
		"archboard semantic correct Payments --variant v1 --suggest",
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			required: true,
			description: "The historical variant, by id or name",
		},
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "JSON stating reason, revisions and edit; standard input when absent",
		},
		{
			kind: "option",
			key: "apply",
			spellings: ["--apply"],
			value: "none",
			requiresShared: ["doing"],
			description: "Write the checked correction",
		},
		{
			kind: "option",
			key: "suggest",
			spellings: ["--suggest"],
			value: "none",
			description: "Suggest repository commits near the variant's recorded time",
		},
	],
	input: { ingress: CorrectInputSchema },
	result: z.union([
		SemanticBoardResultSchema,
		HistoricalCorrectionPreviewAnswerSchema,
		HistoricalCorrectionSuggestionsAnswerSchema,
	]),
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The checked candidate, written board or revision guesses",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Select the structured answer.
		 * @returns The output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["local-read", "server-state-write"],
	refusals: [
		serverRefusal,
		doingRefusal,
		expectVersionRefusal,
		boardHeldRefusal,
		boardVersionRefusal,
		claimRevokedRefusal,
		{
			code: "BAD_BOARD_NAME",
			exit: 2,
			stream: "stderr",
			description: "Name the board separately from the variant.",
		},
		{
			code: "NOTHING_TO_CORRECT",
			exit: 2,
			stream: "stderr",
			description: "The correction states no change to historical content.",
		},
		{
			code: "UNKNOWN_VARIANT",
			exit: 2,
			stream: "stderr",
			description: "--variant names no variant of the board.",
		},
		{
			code: "VARIANT_NOT_HISTORICAL",
			exit: 2,
			stream: "stderr",
			description: "The selected variant was never built or is still current.",
		},
		{
			code: "HISTORICAL_EVIDENCE_UNREADABLE",
			exit: 2,
			stream: "stderr",
			description:
				"A repository the correction describes has no stated commit, does not have the stated commit, or cannot be read at it.",
		},
		{
			code: "HISTORICAL_CODE_MISMATCH",
			exit: 2,
			stream: "stderr",
			description:
				"--apply found code warnings against the stated commits. Preview the correction to read them.",
		},
		{
			code: "HISTORICAL_TIME_UNKNOWN",
			exit: 2,
			stream: "stderr",
			description: "--suggest found no recorded time when the variant stopped being current.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/correct-preview",
			cardinality: "conditional",
			description: "Check the candidate without writing",
		},
		{
			method: "POST",
			path: "/api/semantic-boards/correct",
			cardinality: "conditional",
			description: "Write the checked correction with --apply",
		},
		{
			method: "GET",
			path: "/api/semantic-boards/correct-suggest",
			cardinality: "conditional",
			description: "Suggest revisions with --suggest",
		},
	],
	/**
	 * Check, write or suggest revisions for a historical correction.
	 * @param input The command arguments.
	 * @param context The invocation context.
	 * @returns The requested answer.
	 */
	async handler(input, context) {
		validateMode(input);
		await context.require("server", "semantic correct");
		if (input.suggest)
			return { result: await suggestHistoricalCommitsOnServer(input.name, input.variant) };
		editedVersion(input.name);
		const correct = await statedCorrection(input, context);
		const answer = await correctHistoricalBoardOnServer(input.name, correct, input.apply);
		if ("previousVersion" in answer) return { result: answer };
		return { result: writeResult(answer), diagnostics: describedWrite(answer) };
	},
});

export { semanticCorrectContract };
