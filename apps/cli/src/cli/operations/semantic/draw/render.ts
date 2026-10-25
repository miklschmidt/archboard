// Drawing a semantic board to stdout or a file: one variant, optionally through one of
// the board's shared views, with its faces embedded so the file outlives the
// server that drew it (ADR 0023: the renderer owns every coordinate).

import { z } from "zod";
import {
	LayoutEngineSchema,
	OfferedViewSchema,
	PictureReceiptShape,
	RenderedVariantSchema,
	StandaloneThemeSchema,
} from "@archboard/board/render-reply";
import { renderSemanticBoardOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { refuseNothingDrawn, viewEmptyRefusal } from "#cli/rules/semantic/draw/nothing-drawn.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
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
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	AGAINST_NO_COMPARISON_REFUSAL,
	AGAINST_OPTION,
	againstAgreesWithComparison,
	resolvedAgainst,
} from "#cli/operations/semantic/draw/drawn-against.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { pictureReceipt } from "#cli/rules/semantic/draw/drawn-receipt.ts";

const RenderInputSchema = z
	.object({
		name: z.string(),
		variant: SelectorSchema.optional(),
		view: SelectorSchema.optional(),
		theme: StandaloneThemeSchema.default("light"),
		layout: LayoutEngineSchema.optional(),
		against: SelectorSchema.optional(),
		noComparison: z.boolean().default(false),
		title: TitleOptionSchema,
		...LegendInputSchema,
		out: z.string().optional(),
	})
	.refine(legendStated, LEGEND_ONLY_REFUSAL)
	.refine(againstAgreesWithComparison, AGAINST_NO_COMPARISON_REFUSAL);

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
	 * board with none — and it is therefore drawn plain. With --against it is the variant named.
	 *
	 * By default, every other variant is drawn as the comparison with the board's
	 * current one (on a board with none, with the one it came from) —
	 * added, removed and changed subjects marked, removed ones still on the page
	 * — and that is the picture a reader gets. The receipt says so, because
	 * nothing else does: the file is an SVG, and an author who asked for one
	 * variant has no other way to learn that two are in the picture.
	 */
	comparedWith: RenderedVariantSchema.nullable(),
	/** The view that was drawn, or null when the overview was. */
	view: OfferedViewSchema.nullable(),
	file: z.string(),
	width: z.number(),
	height: z.number(),
	...PictureReceiptShape,
});

const semanticRenderContract = defineCommand({
	path: ["semantic", "render"],
	shared: ["url", "directory"],
	summary: "Draw a semantic board as SVG",
	description:
		"Draws a semantic board at one variant, optionally through a board-owned named view. Layout, typography and " +
		"routing belong to the renderer. Without --out, stdout carries the SVG, including its accessibility metadata. " +
		"With --out, the receipt names every node, edge, flow and step the picture draws and the counts of the marks " +
		"its key shows; semantic views lists that for every view at once. " +
		"Use --no-comparison to hide comparison marks and removed subjects. " +
		"Use --against to draw relative to another variant, marking only what the drawn variant changes over it and " +
		"leaving out the Planned frame. " +
		"Use semantic rasterize --clipboard for PNG and HTML clipboard output.",
	examples: [
		"archboard semantic render pipeline --out pipeline.svg --theme dark",
		'archboard semantic render pipeline --variant "Queued ingest" --no-comparison --out proposal.svg',
		'archboard semantic render pipeline --variant "TASK-2" --against "TASK-1" --out task-2.svg',
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
			description:
				"Which shared board view to draw, by id or name, or Everything for every part; the overview when absent",
		},
		AGAINST_OPTION,
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
				description:
					"The standalone SVG, its words drawn as glyphs, with its accessibility metadata",
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
	refusals: [serverRefusal, viewEmptyRefusal],
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
	 * @throws {Error} When the board or the view has nothing to draw.
	 */
	async handler(input, context) {
		await context.require("server", "semantic render");
		const drawn = await renderSemanticBoardOnServer(
			input.name,
			exportRenderRequest({ ...input, against: await resolvedAgainst(input.name, input) }),
		);
		if ("empty" in drawn) refuseNothingDrawn(drawn);
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
				...pictureReceipt(drawn, input.noComparison),
			},
			pendingArtifact: { path: file, content: drawn.svg, encoding: "utf8" as const },
		};
	},
});

export { semanticRenderContract };
