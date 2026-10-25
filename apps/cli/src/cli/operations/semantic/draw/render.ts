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
import { renderSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { refuseNothingDrawn, viewEmptyRefusal } from "#cli/rules/semantic/draw/nothing-drawn.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
import {
	DRAWN_AGAINST,
	SelectorSchema,
	UNNAMED_VARIANT,
	drawnAgainst,
	exportRenderRequest,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	drawnLegend,
	LEGEND_OPTIONS,
	LegendInputSchema,
	legendStated,
	NO_LEGEND_REFUSAL,
	TITLE_OPTION,
	TitleOptionSchema,
} from "#cli/operations/semantic/draw/framing-options.ts";
import {
	AGAINST_NO_COMPARISON_REFUSAL,
	AGAINST_OPTION,
	againstAgreesWithComparison,
	resolvedAgainst,
} from "#cli/operations/semantic/draw/drawn-against.ts";
import {
	boardHeldRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "#cli/protocol/contract/refusals.ts";
import { pictureReceipt } from "#cli/rules/semantic/draw/drawn-receipt.ts";
import {
	recipeOfPicture,
	vaultRepositoryUnknownRefusal,
} from "#cli/rules/semantic/draw/picture-recipe.ts";
import {
	plannedFile,
	requireTrackable,
	TRACK_NEEDS_OUT,
	TRACK_OPTION,
	TRACK_RELATIONSHIP,
	TrackedReceiptSchema,
	trackedField,
	trackHasOut,
	trackOutsideCheckoutRefusal,
	trackVaultUnregisteredRefusal,
} from "#cli/operations/semantic/draw/tracked-embed.ts";

const RenderInputSchema = z
	.object({
		name: z.string(),
		variant: SelectorSchema.optional(),
		view: SelectorSchema.optional(),
		theme: StandaloneThemeSchema.default("auto"),
		layout: LayoutEngineSchema.optional(),
		against: SelectorSchema.optional(),
		noComparison: z.boolean().default(false),
		title: TitleOptionSchema,
		...LegendInputSchema,
		out: z.string().optional(),
		track: z.boolean().default(false),
	})
	.refine(trackHasOut, TRACK_NEEDS_OUT)
	.refine(legendStated, NO_LEGEND_REFUSAL)
	.refine(againstAgreesWithComparison, AGAINST_NO_COMPARISON_REFUSAL);

const recipeUnavailableRefusal = {
	code: "RENDER_RECIPE_UNAVAILABLE",
	exit: 1,
	stream: "stderr" as const,
	description:
		"The server's SVG carries no render recipe, or one that cannot be read, as a server that started before the recipe existed draws; nothing was written. Run `archboard restart`, then try again.",
};

/** A server's picture without the recipe that every board render carries (ADR 0057). */
class RecipeUnavailableError extends Error {
	readonly code = recipeUnavailableRefusal.code;
}

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
	/** With --track: the file as the board lists it, and the board's version after the write. */
	tracked: TrackedReceiptSchema.optional(),
});

const semanticRenderContract = defineCommand({
	path: ["semantic", "render"],
	shared: ["url", "directory", "doing"],
	summary: "Draw a semantic board as SVG",
	description: [
		"Draws a semantic board at one variant as SVG, optionally through a named view of the board. The renderer owns the layout, the typography and the routing.",
		"",
		"Output:",
		"- Without --out, stdout carries the SVG. It is the same SVG that --out writes, with its accessibility metadata and its render recipe.",
		"- With --out, the answer is a receipt. It names every node, edge, flow and step that the picture draws, and the counts of the marks that its key shows. `semantic views` lists that for every view at once.",
		"- The render recipe names the board, the variant and the view by id, and the drawing choices.",
		"",
		"Comparison:",
		"- --no-comparison hides the comparison marks and the removed subjects.",
		"- --against draws relative to another variant. It marks only what the drawn variant changes over that variant, and leaves out the Planned frame.",
		"",
		"Tracked embeds (--track, with --out):",
		"- The board lists the file as a tracked embed, { repo, path }, before the file is written.",
		"- It is a board write: it takes the board's lease, needs --doing and raises the version. It needs no --expect-version, because it only adds to the list. Tracking a file that the board lists already writes nothing.",
		"",
		"For PNG, and for PNG and HTML on the clipboard, use `semantic rasterize`.",
		"",
		"Refusals:",
		"- TRACK_OUTSIDE_CHECKOUT: --track names a file that no Git checkout holds, or that Git ignores.",
		"- TRACK_VAULT_UNREGISTERED: --track, while no registered checkout of the vault's repository exists.",
		"- RENDER_RECIPE_UNAVAILABLE: the server's SVG carries no recipe. Restart the server.",
		"- VAULT_REPOSITORY_UNKNOWN: Git does not say which repository holds the vault.",
	].join("\n"),
	examples: [
		"archboard semantic render pipeline --out pipeline.svg --theme dark",
		'archboard semantic render pipeline --variant "Queued ingest" --no-comparison --out proposal.svg',
		'archboard semantic render pipeline --variant "TASK-2" --against "TASK-1" --out task-2.svg',
		"archboard semantic rasterize pipeline --clipboard",
		'archboard semantic render pipeline --out docs/pipeline.svg --track --doing "tracking the pipeline picture in the docs"',
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
			default: "auto",
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
		TRACK_OPTION,
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
					"The standalone SVG, its words drawn as glyphs, with its accessibility metadata and its render recipe",
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
	effects: ["read", "local-write", "server-state-write"],
	refusals: [
		serverRefusal,
		viewEmptyRefusal,
		recipeUnavailableRefusal,
		vaultRepositoryUnknownRefusal,
		trackOutsideCheckoutRefusal,
		trackVaultUnregisteredRefusal,
		doingRefusal,
		boardHeldRefusal,
		claimRevokedRefusal,
	],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/render",
			cardinality: "one",
			description: "Draw the variant",
		},
		TRACK_RELATIONSHIP,
	],
	/**
	 * Draw the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The SVG bytes or the file receipt.
	 * @throws {Error} When the board or the view has nothing to draw.
	 * @throws {RecipeUnavailableError} When the server's SVG carries no readable render recipe.
	 */
	async handler(input, context) {
		await context.require("server", "semantic render");
		const planned = await plannedFile(input, context);
		const drawn = await renderSemanticBoardOnServer(
			input.name,
			exportRenderRequest({
				...input,
				legend: drawnLegend(input),
				against: await resolvedAgainst(input.name, input),
			}),
		);
		if ("empty" in drawn) refuseNothingDrawn(drawn);
		const recipe = recipeOfPicture(drawn.svg);
		if ("problem" in recipe) throw new RecipeUnavailableError(recipe.problem);
		const { file } = planned;
		if (file === undefined) return { result: Buffer.from(drawn.svg, "utf8") };
		requireTrackable(planned, recipe.recipe);
		const tracked = await trackedField(input.name, planned);
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
				...tracked,
			},
			pendingArtifact: { path: file, content: drawn.svg, encoding: "utf8" as const },
		};
	},
});

export { semanticRenderContract };
