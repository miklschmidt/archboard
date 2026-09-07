import { z } from "zod";
import { boardConflictOf, saveBoard } from "@/runtime/engine/canvas-client";
import { defineCommand } from "@/cli/command-contract/contract";
import {
	BoardAddressSchema,
	BoardWriteConflictSchema,
	HoldReportSchema,
} from "@/cli/command-contract/schemas";
import { boardWriteRefusals } from "@/cli/command-contract/lib/common";

const BoardSaveInputSchema = z.object({ tokens: z.array(z.string()).default([]) });
type BoardSaveInput = z.infer<typeof BoardSaveInputSchema>;

/** What a save may be told: where to save it, and whether to overwrite. */
interface BoardSaveOptions {
	as?: string;
	variant?: string;
	level?: string;
	force?: true;
}

/** The flags that name where the save goes; every one of them takes a value. */
const VALUED_SAVE_FLAGS = ["as", "variant", "level"] as const;

/** One `--flag` token, split from any value written inline after an equals sign. */
interface SaveFlagToken {
	name: string;
	inline: string | undefined;
}

/**
 * Splits a `--flag` or `--flag=value` token into its name and inline value.
 * @param token - The token, its leading dashes included.
 * @returns The flag's name and the value written with it, if any.
 */
function saveFlagToken(token: string): SaveFlagToken {
	const body = token.slice(2);
	const equals = body.indexOf("=");
	return equals === -1
		? { name: body, inline: undefined }
		: { name: body.slice(0, equals), inline: body.slice(equals + 1) };
}

/**
 * Tells whether a flag name is one of the valued save flags.
 * @param name - The flag's name, without its dashes.
 * @returns True when the flag names where the save goes.
 */
function isValuedSaveFlag(name: string): name is (typeof VALUED_SAVE_FLAGS)[number] {
	return VALUED_SAVE_FLAGS.some((flag) => flag === name);
}

/**
 * How many further tokens a flag took: the one after it, unless its value was
 * written inline after an equals sign.
 * @param flag - The flag as it was written.
 * @returns 1 when the flag took the next token, 0 when it did not.
 */
function consumedTokens(flag: SaveFlagToken): number {
	return flag.inline === undefined ? 1 : 0;
}

/**
 * Applies `--force` to the options being built.
 * @param result - The options being built.
 * @param flag - The flag as it was written.
 * @returns How many further tokens it took, or why it is refused.
 */
function applyForceFlag(
	result: BoardSaveOptions,
	flag: SaveFlagToken,
): { consumed: number } | { error: string } {
	if (flag.inline !== undefined) {
		return { error: "Flag --force does not take a value" };
	}
	result.force = true;
	return { consumed: 0 };
}

/**
 * Applies one flag to the options being built.
 * @param result - The options being built.
 * @param flag - The flag as it was written.
 * @param next - The token after it, which a valued flag takes when it carried no inline value.
 * @returns How many further tokens it took, or why it is refused.
 */
function applySaveFlag(
	result: BoardSaveOptions,
	flag: SaveFlagToken,
	next: string | undefined,
): { consumed: number } | { error: string } {
	if (flag.name === "force") {
		return applyForceFlag(result, flag);
	}
	if (!isValuedSaveFlag(flag.name)) {
		return { error: `Unknown flag --${flag.name}` };
	}
	const value = flag.inline ?? next;
	if (value === undefined) {
		return { error: `Flag --${flag.name} requires a value` };
	}
	result[flag.name] = value;
	return { consumed: consumedTokens(flag) };
}

/**
 * Reads what a save was told from the tokens the person wrote. The stage owns
 * its own parsing because `board save` passes its tail through untouched, so
 * these flags never reach the declared parameter grammar.
 * @param tokens - The tokens after `board save`.
 * @param context - Where a refusal is recorded.
 * @returns The save options, or Zod's refusal marker.
 */
function parseBoardSaveTokens(
	tokens: readonly string[],
	context: z.RefinementCtx,
): BoardSaveOptions | typeof z.NEVER {
	const result: BoardSaveOptions = {};
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		if (!token.startsWith("--")) {
			continue;
		}
		const applied = applySaveFlag(result, saveFlagToken(token), tokens[index + 1]);
		if ("error" in applied) {
			context.addIssue({ code: "custom", message: applied.error });
			return z.NEVER;
		}
		index += applied.consumed;
	}
	return result;
}

const BoardSaveStageSchema = z.array(z.string()).transform(parseBoardSaveTokens);
type BoardSaveStage = z.infer<typeof BoardSaveStageSchema>;

const BoardSaveSuccessResultSchema = z.looseObject({
	success: z.literal(true),
	board: z.string(),
	identity: BoardAddressSchema,
	saveKind: z.enum(["same-board", "named", "branch"]).optional(),
	savedFrom: z.string().optional(),
	file: z.string().optional(),
	held: HoldReportSchema.optional(),
});
type BoardSaveSuccessResult = z.infer<typeof BoardSaveSuccessResultSchema>;

const BoardSaveConflictResultSchema = z.object({
	success: z.literal(false),
	conflict: BoardWriteConflictSchema,
	held: HoldReportSchema.optional(),
});
type BoardSaveConflictResult = z.infer<typeof BoardSaveConflictResultSchema>;

const BoardSaveResultSchema = z.union([
	BoardSaveSuccessResultSchema,
	BoardSaveConflictResultSchema,
]);
type BoardSaveResult = z.infer<typeof BoardSaveResultSchema>;

type BoardSaveOutcome = Awaited<ReturnType<typeof saveBoard>>;

/**
 * Says that a branch was written without moving any pane, because a person who
 * branched a board will otherwise look for it on the canvas and not find it.
 * @param result - What the save did.
 * @returns The line to say, or null when this was not a branch.
 */
function branchDiagnostic(result: BoardSaveOutcome): string | null {
	if (result.saveKind !== "branch") {
		return null;
	}
	return (
		`Branched "${result.savedFrom}" to "${result.board}" without changing the browser. ` +
		`Show it deliberately with \`browser show ${result.board} --pane <spec>\`.`
	);
}

/**
 * Says where the changes that were held on the canvas ended up, and that the
 * board is saving again.
 * @param result - What the save did.
 * @returns The line to say, or null when no hold was resolved.
 */
function resolvedHoldDiagnostic(result: BoardSaveOutcome): string | null {
	const ended = result.resolvedHold;
	if (!ended) {
		return null;
	}
	const held = `${ended.writes} change${ended.writes === 1 ? "" : "s"}`;
	return ended.outcome === "overwrite"
		? `"${ended.board}" is saving again, with the ${held} that were held on the canvas. ` +
				`Whatever ${result.file} held before is gone.`
		: `The ${held} that were held are in ${result.file}. ` +
				`"${ended.board}" is saving again and the browser display was not changed.`;
}

/**
 * Says what happened to a note that already existed: overwritten because the
 * person said so, or replaced after checking it had not changed on disk.
 * @param result - What the save did.
 * @returns The line to say, or null when nothing was overwritten.
 */
function overwriteDiagnostic(result: BoardSaveOutcome): string | null {
	if (result.forced) {
		return `Overwrote ${result.file} on your say-so; whatever that note held is gone.`;
	}
	if (result.overwrote) {
		return (
			"Saved after checking the note had not changed on disk. archboard cannot see an unsaved copy " +
			"held in Obsidian, so keep a board open in one editor at a time."
		);
	}
	return null;
}

/**
 * Turns the options the person wrote into the save request, leaving out
 * everything they did not say so the server keeps its own defaults.
 * @param options - What the save was told.
 * @returns The request to send.
 */
function saveRequest(options: BoardSaveOptions): Parameters<typeof saveBoard>[0] {
	return {
		...(options.as ? { name: options.as } : {}),
		...(options.variant ? { variant: options.variant } : {}),
		...(options.level ? { level: options.level } : {}),
		...(options.force ? { force: true } : {}),
	};
}

/**
 * Everything a successful save has to tell the person, in the order they need
 * to read it.
 * @param result - What the save did.
 * @returns The diagnostic lines, empty when the save has nothing to add.
 */
function successDiagnostics(result: BoardSaveOutcome): string[] {
	return [
		branchDiagnostic(result),
		resolvedHoldDiagnostic(result),
		overwriteDiagnostic(result),
	].filter((line) => line !== null);
}

const boardSaveContract = defineCommand({
	path: ["board", "save"],
	summary: "Save one named board note without moving proposal panes",
	usage: "board save --board <key> [--as <name>] [--variant v] [--level l] [--force]",
	description: "Writes or branches a board note and returns structured save or conflict state.",
	examples: ["archboard board save --board payments"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "save-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after the server contact to preserve refusal precedence",
		},
	],
	input: {
		ingress: BoardSaveInputSchema,
		stages: [
			{
				name: "save-options",
				when: "after-server",
				description: "Save flags and their legacy last-wins behavior",
				schema: BoardSaveStageSchema,
			},
		],
	},
	result: BoardSaveResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Board save or structured conflict",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		/**
		 * A save publishes the same JSON shape whether it succeeded or hit a conflict.
		 * @returns The only output case's id.
		 */
		select: () => "json",
	},
	outcomes: [
		{
			id: "board-conflict",
			exit: 5,
			description: "The destination note changed and the save was refused.",
			stream: "stdout-and-stderr",
			held: "object-field-and-stderr-note",
			presentation: ["diagnostics", "result", "held-note", "continuation"],
		},
	],
	prerequisites: ["server", "board", "doing"],
	effects: ["local-read", "write"],
	refusals: boardWriteRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/boards/save",
			cardinality: "one",
			description: "One board-note save attempt",
		},
	],
	/**
	 * Saves the board note, and publishes a conflict as a declared outcome
	 * rather than a thrown error, because a note that changed underneath the
	 * save is something the person has to decide about.
	 * @param input - The parsed command input.
	 * @param context - The command context.
	 * @returns The save receipt, or the conflict that refused it.
	 */
	async handler(input, context) {
		await context.require("server", "Saving a board");
		const options = context.parse(BoardSaveStageSchema, input.tokens);
		try {
			const result = await saveBoard(saveRequest(options));
			return {
				result: BoardSaveSuccessResultSchema.parse(result),
				diagnostics: successDiagnostics(result),
			};
		} catch (error) {
			const conflict = boardConflictOf(error);
			if (!conflict) {
				throw error;
			}
			return {
				result: {
					success: false as const,
					conflict: { ...conflict },
				},
				outcome: "board-conflict",
				diagnostics: [conflict.message],
			};
		}
	},
});

export {
	BoardSaveInputSchema,
	type BoardSaveInput,
	BoardSaveStageSchema,
	type BoardSaveStage,
	BoardSaveSuccessResultSchema,
	type BoardSaveSuccessResult,
	BoardSaveConflictResultSchema,
	type BoardSaveConflictResult,
	BoardSaveResultSchema,
	type BoardSaveResult,
	boardSaveContract,
};
