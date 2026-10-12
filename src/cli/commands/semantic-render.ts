// Drawing a semantic board to stdout or a file: one variant, optionally through one of
// the board's shared views, with its faces embedded so the file outlives the
// server that drew it (ADR 0023: the renderer owns every coordinate).

import { z } from "zod";
import {
	LayoutEngineSchema,
	OfferedViewSchema,
	RenderedVariantSchema,
	StandaloneThemeSchema,
} from "@/shared/semantic-board/index";
import { renderSemanticBoardOnServer } from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { PendingArtifactSchema } from "@/cli/command-contract/schemas";
import {
	DRAWN_AGAINST,
	SelectorSchema,
	UNNAMED_VARIANT,
	drawnAgainst,
	exportRenderRequest,
	TITLE_OPTION,
	TitleOptionSchema,
	LEGEND_OPTIONS,
	LEGEND_ONLY_REFUSAL,
	LegendInputSchema,
	legendStated,
} from "@/cli/commands/lib/semantic-input";
import { serverRefusal } from "@/cli/command-contract/common";

const RenderInputSchema = z
	.object({
		name: z.string(),
		variant: SelectorSchema.optional(),
		view: SelectorSchema.optional(),
		theme: StandaloneThemeSchema.default("light"),
		layout: LayoutEngineSchema.optional(),
		noComparison: z.boolean().default(false),
		title: TitleOptionSchema,
		...LegendInputSchema,
		out: z.string().optional(),
	})
	.refine(legendStated, LEGEND_ONLY_REFUSAL);

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
	/**
	 * The variant this picture is drawn against, or null when comparison is disabled or there is nothing
	 * to read it against — it is the current variant, or a first draft on a
	 * board with none — and it is therefore drawn plain.
	 *
	 * By default, every other variant is drawn as the comparison with the board's
	 * current one (on a board with none, with the one it came from) —
	 * added, removed and changed subjects marked, removed ones still on the page
	 * — and that is the picture a reader gets. The receipt says so, because
	 * nothing else does: the file is an SVG, and an author who asked for one
	 * variant has no other way to learn that two are in the picture.
	 */
	comparedWith: RenderedVariantSchema.nullable(),
	/** The view that was drawn, or null when the whole variant was. */
	view: OfferedViewSchema.nullable(),
	file: z.string(),
	width: z.number(),
	height: z.number(),
});

const semanticRenderContract = defineCommand({
	path: ["semantic", "render"],
	shared: ["url"],
	summary: "Draw a semantic board as SVG",
	description:
		"Draws a semantic board at one variant, optionally through a board-owned named view. Layout, typography and " +
		"routing belong to the renderer. Without --out, stdout carries the SVG, including its accessibility metadata. " +
		"Use --no-comparison to hide comparison marks and removed subjects. " +
		"Use semantic rasterize --clipboard for PNG and HTML clipboard output.",
	examples: [
		"archboard semantic render pipeline --out pipeline.svg --theme dark",
		'archboard semantic render pipeline --variant "Queued ingest" --no-comparison --out proposal.svg',
		"archboard semantic rasterize pipeline --clipboard",
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
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.svg",
			description:
				"Write the SVG to this file and print a JSON receipt. Without this option, print the SVG to stdout.",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: `Which variant to draw, by id or name; ${UNNAMED_VARIANT}. ${DRAWN_AGAINST}`,
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
			key: "noComparison",
			spellings: ["--no-comparison"],
			value: "none",
			description:
				"Hide comparison marks and removed subjects; draw the selected variant without standing decoration",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: StandaloneThemeSchema.options,
			default: "light",
			description:
				"Which ground to draw on; auto carries both and follows the reader's colour scheme, as an image, a background or inline",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			placeholder: "engine",
			choices: LayoutEngineSchema.options,
			description: "Which layout engine lays the architecture out; the default one when absent",
		},
		TITLE_OPTION,
		...LEGEND_OPTIONS,
	],
	input: { ingress: RenderInputSchema },
	result: z.union([
		SemanticRenderResultSchema,
		z.instanceof(Uint8Array<ArrayBufferLike>).meta({
			description: "The standalone SVG as UTF-8 bytes.",
		}),
	]),
	output: {
		cases: [
			{
				id: "stdout",
				when: { key: "out", present: false },
				mode: "raw",
				description: "The standalone SVG, with embedded fonts and its accessibility metadata",
			},
			{
				id: "file",
				when: { key: "out", present: true },
				mode: "file-receipt",
				description: "The SVG that was written",
				artifact: PendingArtifactSchema,
			},
		],
		/**
		 * Choose image bytes or a file receipt.
		 * @param input The requested destination.
		 * @returns The output case's id.
		 */
		select: (input) => (input.out === undefined ? "stdout" : "file"),
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
	 * @returns The SVG bytes or the file receipt.
	 * @throws {CliUsageError} When the board has nothing on it.
	 */
	async handler(input, context) {
		await context.require("server", "semantic render");
		const drawn = await renderSemanticBoardOnServer(input.name, exportRenderRequest(input));
		if ("empty" in drawn) {
			throw new CliUsageError(
				`Semantic board "${drawn.board}" has nothing on it yet, so there is nothing to draw.`,
			);
		}
		if (input.out === undefined) return { result: Buffer.from(drawn.svg, "utf8") };
		const file = context.resolvePath(input.out);
		return {
			result: {
				success: true as const,
				board: drawn.board,
				version: drawn.version,
				variant: drawn.variant,
				comparedWith: drawnAgainst(drawn, input.noComparison),
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
