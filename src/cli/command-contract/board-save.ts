import { z } from "zod";
import { boardConflictOf, saveBoard } from "../../runtime/engine/canvas-client.js";
import { MAX_PANES } from "../../runtime/engine/panes.js";
import { defineCommand } from "./contract.js";
import {
	BoardAddressSchema,
	BoardWriteConflictSchema,
	HoldReportSchema,
	PaneRefSchema,
} from "./schemas.js";

export const BoardSaveInputSchema = z.object({ tokens: z.array(z.string()).default([]) });
export type BoardSaveInput = z.infer<typeof BoardSaveInputSchema>;

export const BoardSaveStageSchema = z.array(z.string()).transform((tokens, context) => {
	const result: { as?: string; variant?: string; level?: string; force?: true } = {};
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		if (!token.startsWith("--")) continue;
		let name = token.slice(2);
		let inline: string | undefined;
		const equals = name.indexOf("=");
		if (equals !== -1) {
			inline = name.slice(equals + 1);
			name = name.slice(0, equals);
		}
		if (name === "force") {
			if (inline !== undefined) {
				context.addIssue({ code: "custom", message: "Flag --force does not take a value" });
				return z.NEVER;
			}
			result.force = true;
			continue;
		}
		if (name !== "as" && name !== "variant" && name !== "level") {
			context.addIssue({ code: "custom", message: `Unknown flag --${name}` });
			return z.NEVER;
		}
		const value = inline ?? tokens[index + 1];
		if (value === undefined) {
			context.addIssue({ code: "custom", message: `Flag --${name} requires a value` });
			return z.NEVER;
		}
		if (inline === undefined) index += 1;
		result[name] = value;
	}
	return result;
});
export type BoardSaveStage = z.infer<typeof BoardSaveStageSchema>;

const BoardSavePanesSchema = z.looseObject({
	moved: z.array(PaneRefSchema),
	kept: z.array(PaneRefSchema),
	onScreen: z
		.array(z.looseObject({ paneId: z.string(), place: z.string(), board: z.string() }))
		.optional(),
});

export const BoardSaveSuccessResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	identity: BoardAddressSchema,
	saveKind: z.enum(["same-board", "named", "branch"]).optional(),
	savedFrom: z.string().optional(),
	file: z.string().optional(),
	panes: BoardSavePanesSchema.optional(),
	held: HoldReportSchema.optional(),
});
export type BoardSaveSuccessResult = z.infer<typeof BoardSaveSuccessResultSchema>;

export const BoardSaveConflictResultSchema = z.object({
	success: z.literal(false),
	conflict: BoardWriteConflictSchema,
	held: HoldReportSchema.optional(),
});
export type BoardSaveConflictResult = z.infer<typeof BoardSaveConflictResultSchema>;

export const BoardSaveResultSchema = z.union([
	BoardSaveSuccessResultSchema,
	BoardSaveConflictResultSchema,
]);
export type BoardSaveResult = z.infer<typeof BoardSaveResultSchema>;

const paneSpec = (place: string, index: number): string =>
	place.includes(" ") ? String(index + 1) : place;

function listPanes(refs: Array<{ place: string }>): string {
	const places = refs.map((ref) => (ref.place === "the only pane" ? "only" : ref.place));
	const noun = places.length === 1 ? "pane" : "panes";
	if (places.length === 1) return `the ${places[0]} ${noun}`;
	return `the ${places.slice(0, -1).join(", ")} and ${places[places.length - 1]} ${noun}`;
}

function howToShowBranch(
	branch: string,
	onScreen: Array<{ place: string; board: string }>,
): string {
	if (onScreen.length === 0) {
		return (
			"No pane is open, so nothing is showing either board. Open the canvas in a browser, " +
			`then \`pane open --board ${branch}\`.`
		);
	}
	if (onScreen.length < MAX_PANES) {
		return (
			`Put it beside ${onScreen.length === 1 ? "that one" : "those"} with ` +
			`\`pane open --board ${branch}\`, which makes a pane rather than taking one.`
		);
	}
	const cost = onScreen
		.map(
			(pane, index) =>
				`\`board open ${branch} --pane ${paneSpec(pane.place, index)}\` replaces "${pane.board}"`,
		)
		.join(", ");
	return `The screen is full, so putting it up takes a board off: ${cost}.`;
}

function successDiagnostics(result: Awaited<ReturnType<typeof saveBoard>>): string[] {
	const diagnostics: string[] = [];
	const moved = result.panes?.moved ?? [];
	const kept = result.panes?.kept ?? [];
	if (moved.length) {
		diagnostics.push(
			`"${result.board}" is now showing in ${listPanes(moved)}, which held the board it was saved from.`,
		);
	} else if (result.saveKind === "branch") {
		diagnostics.push(
			`Branched "${result.savedFrom}" to "${result.board}". ` +
				(kept.length
					? `Nothing moved: ${listPanes(kept)} still ${kept.length > 1 ? "hold" : "holds"} ` +
						`"${result.savedFrom}", and the branch is not showing anywhere. `
					: `No pane was holding "${result.savedFrom}", and the branch is not showing anywhere either. `) +
				howToShowBranch(result.board, result.panes?.onScreen ?? []),
		);
	}
	const ended = result.resolvedHold;
	if (ended) {
		const held = `${ended.writes} change${ended.writes === 1 ? "" : "s"}`;
		diagnostics.push(
			ended.outcome === "overwrite"
				? `"${ended.board}" is saving again, with the ${held} that were held on the canvas. ` +
						`Whatever ${result.file} held before is gone.`
				: `The ${held} that were held are in ${result.file}, and it is what the panes now show. ` +
						`"${ended.board}" is saving again and holds the version the other editor wrote.`,
		);
	}
	if (result.forced) {
		diagnostics.push(`Overwrote ${result.file} on your say-so; whatever that note held is gone.`);
	} else if (result.overwrote) {
		diagnostics.push(
			"Saved after checking the note had not changed on disk. archboard cannot see an unsaved copy " +
				"held in Obsidian, so keep a board open in one editor at a time.",
		);
	}
	return diagnostics;
}

export const boardSaveContract = defineCommand({
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
	prerequisites: ["server", "board"],
	effects: ["local-read", "write"],
	refusals: [
		{ code: "BOARD_REQUIRED", exit: 2, stream: "stderr", description: "No board was named." },
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached or started.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/boards/save",
			cardinality: "one",
			description: "One board-note save attempt",
		},
	],
	async handler(input, context) {
		await context.require("server", "Saving a board");
		const options = context.parse(BoardSaveStageSchema, input.tokens);
		try {
			const result = await saveBoard({
				...(options.as ? { name: options.as } : {}),
				...(options.variant ? { variant: options.variant } : {}),
				...(options.level ? { level: options.level } : {}),
				...(options.force ? { force: true } : {}),
			});
			return {
				result: result as unknown as BoardSaveSuccessResult,
				diagnostics: successDiagnostics(result),
			};
		} catch (error) {
			const conflict = boardConflictOf(error);
			if (!conflict) throw error;
			return {
				result: {
					success: false,
					conflict,
				} as unknown as BoardSaveConflictResult,
				outcome: "board-conflict" as const,
				diagnostics: [conflict.message],
			};
		}
	},
});
