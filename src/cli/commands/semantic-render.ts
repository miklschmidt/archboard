// Drawing a semantic board to a file: one variant, optionally through one of
// the board's shared views, with its faces embedded so the file outlives the
// canvas that drew it (ADR 0023: the renderer owns every coordinate).

import { z } from "zod";
import { OfferedViewSchema, RenderedVariantSchema } from "@/shared/semantic-board/index";
import { renderSemanticBoardOnCanvas } from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { PendingArtifactSchema } from "@/cli/command-contract/schemas";
import { SelectorSchema } from "@/cli/commands/lib/semantic-input";
import { serverRefusal } from "@/cli/command-contract/common";

const THEMES = ["light", "dark"] as const;

const RenderInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	view: SelectorSchema.optional(),
	theme: z.enum(THEMES).default("light"),
	out: z.string(),
});

const SemanticRenderResultSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	/**
	 * What was drawn, in the shapes the render answer already uses. A receipt
	 * that reduced either of them to a name would be a receipt somebody cannot
	 * act on: names move between variants and are what a person types, ids are
	 * what asks for exactly this picture again.
	 */
	variant: RenderedVariantSchema,
	/** The view that was drawn, or null when the whole variant was. */
	view: OfferedViewSchema.nullable(),
	file: z.string(),
	width: z.number(),
	height: z.number(),
});

const semanticRenderContract = defineCommand({
	path: ["semantic", "render"],
	shared: ["url"],
	summary: "Draw a semantic board to an SVG file",
	description:
		"Draws a semantic board at one variant, optionally through a board-owned named view. Layout, typography and " +
		"routing belong to the renderer; nothing about the picture is authored on the board.",
	examples: ["archboard semantic render pipeline --out pipeline.svg --theme dark"],
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
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.svg",
			required: true,
			description: "Where to write the SVG, with its faces embedded",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: "Which variant to draw, by id or name; the current one when absent",
		},
		{
			kind: "option",
			key: "view",
			spellings: ["--view"],
			value: "required",
			placeholder: "view",
			description: "Which shared board view to draw, by id or name; the whole variant when absent",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: THEMES,
			default: "light",
			description: "Which ground to draw on",
		},
	],
	input: { ingress: RenderInputSchema },
	result: SemanticRenderResultSchema,
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				description: "The SVG that was written",
				artifact: PendingArtifactSchema,
			},
		],
		/**
		 * One answer: the file.
		 * @returns The output case's id.
		 */
		select: () => "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/render",
			cardinality: "one",
			description: "Draw the variant",
		},
	],
	/**
	 * Draw the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The file receipt.
	 * @throws {CliUsageError} When the board has nothing on it.
	 */
	async handler(input, context) {
		await context.require("server", "semantic render");
		const drawn = await renderSemanticBoardOnCanvas(input.name, {
			...(input.variant === undefined ? {} : { variant: input.variant }),
			...(input.view === undefined ? {} : { view: input.view }),
			theme: input.theme,
			// The file outlives the canvas that drew it, so it carries its faces
			// rather than pointing at a server that may not be running.
			fonts: "embedded",
		});
		if ("empty" in drawn) {
			throw new CliUsageError(
				`Semantic board "${drawn.board}" has nothing on it yet, so there is nothing to draw.`,
			);
		}
		const file = context.resolvePath(input.out);
		return {
			result: {
				success: true as const,
				board: drawn.board,
				version: drawn.version,
				variant: drawn.variant,
				view: drawn.view,
				file,
				width: drawn.width,
				height: drawn.height,
			},
			pendingArtifact: { path: file, content: drawn.svg, encoding: "utf8" as const },
		};
	},
});

export { semanticRenderContract };
