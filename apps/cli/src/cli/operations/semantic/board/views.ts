// Every view of a board, with what each draws at one variant (TASK-496).
//
// Every view belongs to every variant, and a board can hold dozens, many of
// which draw little or nothing at a given draft. Without this, an agent found
// the view that shows a change by rendering one after another and looking at
// the pictures. Each view is drawn here through the render route that
// `semantic render` uses, so what is listed is what that render would draw:
// the renderer says which subjects it placed, and only it knows, because a
// grammar draws part of what a view's reading holds. The drawings also leave
// their layouts in the server's cache for the render that follows.

import { z } from "zod";
import { EVERYTHING_VIEW } from "@archboard/board/views";
import {
	LayoutEngineSchema,
	OfferedViewSchema,
	PictureMarksSchema,
	RenderedVariantSchema,
	type SemanticRenderReply,
} from "@archboard/board/render-reply";
import { renderSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import {
	DRAWN_AGAINST,
	SelectorSchema,
	UNNAMED_VARIANT,
	drawnAgainst,
	exportRenderRequest,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	AGAINST_NO_COMPARISON_REFUSAL,
	AGAINST_OPTION,
	againstAgreesWithComparison,
	resolvedAgainst,
} from "#cli/operations/semantic/draw/drawn-against.ts";
import { pictureReceipt } from "#cli/rules/semantic/draw/drawn-receipt.ts";

const ViewsInputSchema = z
	.object({
		name: z.string(),
		variant: SelectorSchema.optional(),
		layout: LayoutEngineSchema.optional(),
		against: SelectorSchema.optional(),
		noComparison: z.boolean().default(false),
	})
	.refine(againstAgreesWithComparison, AGAINST_NO_COMPARISON_REFUSAL);

/** How many of each kind of subject one view draws. */
const DrawnCountsSchema = z.object({
	nodes: z.int(),
	edges: z.int(),
	flows: z.int(),
	steps: z.int(),
});

/** One view, and what it draws at the variant. */
const ListedViewSchema = z.object({
	/** The view, or null for the overview. Everything is listed last. */
	view: OfferedViewSchema.nullable(),
	/** How many nodes, edges, flows and steps the picture draws; all zero when it draws nothing. */
	drawn: DrawnCountsSchema,
	/** The counts of the marks its key shows, or null when the picture marks no comparison. */
	marks: PictureMarksSchema.nullable(),
	/** The picture's size before a title or a key, or null when it draws nothing. */
	size: z.object({ width: z.number(), height: z.number() }).nullable(),
});

const SemanticViewsResultSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	variant: RenderedVariantSchema,
	/** The variant every picture is drawn against, or null when none is, as `semantic render` says it. */
	comparedWith: RenderedVariantSchema.nullable(),
	views: z.array(ListedViewSchema),
});

/**
 * One view as the listing carries it.
 * @param reply What the render answered for it.
 * @param noComparison Whether the comparison is hidden.
 * @returns The listed view.
 */
function listed(
	reply: SemanticRenderReply,
	noComparison: boolean,
): z.infer<typeof ListedViewSchema> {
	const drawn = "drawn" in reply ? reply.drawn : { nodes: [], edges: [], flows: [], steps: [] };
	const receipt = pictureReceipt({ changes: reply.changes, drawn }, noComparison);
	return {
		view: reply.view,
		drawn: {
			nodes: drawn.nodes.length,
			edges: drawn.edges.length,
			flows: drawn.flows.length,
			steps: drawn.steps.length,
		},
		marks: receipt.marks,
		size: "svg" in reply ? { width: reply.width, height: reply.height } : null,
	};
}

const semanticViewsContract = defineCommand({
	path: ["semantic", "views"],
	shared: ["url", "directory"],
	summary: "List every view of a board with what it draws at a variant",
	description:
		"Draws the overview, every view of the board and Everything at one variant, as semantic render draws them, " +
		"and lists for each how many nodes, edges, flows and steps the picture draws, the counts of the marks its key " +
		"shows, and its size. A view that draws nothing at the variant is listed with nothing drawn. " +
		"Choose a view from this list before you render one.",
	examples: [
		"archboard semantic views pipeline",
		'archboard semantic views pipeline --variant "TASK-2" --against "TASK-1"',
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
			description: `Which variant to read every view at, by id or name; ${UNNAMED_VARIANT}. ${DRAWN_AGAINST}`,
		},
		AGAINST_OPTION,
		{
			kind: "option",
			key: "noComparison",
			spellings: ["--no-comparison"],
			value: "none",
			description: "List what each view draws without comparison marks and removed subjects",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			placeholder: "engine",
			choices: LayoutEngineSchema.options,
			description: "Which layout engine sizes each architecture; the default one when absent",
		},
	],
	input: { ingress: ViewsInputSchema },
	result: SemanticViewsResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", description: "Every view and what it draws" }],
		/**
		 * The listing is always JSON.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/render",
			cardinality: "parallel",
			description: "Draw the overview, each view and Everything",
		},
	],
	/**
	 * Draw every view and list what each draws.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The listing.
	 * @throws {Error} When the board changed while its views were drawn.
	 */
	async handler(input, context) {
		await context.require("server", "semantic views");
		const against = await resolvedAgainst(input.name, input);
		/**
		 * Draw one reading of the variant.
		 * @param variant The variant, by id or name.
		 * @param view The view, or nothing for the overview.
		 * @returns What the render answered.
		 */
		const draw = (variant: string | undefined, view: string | undefined) =>
			renderSemanticBoardOnServer(input.name, {
				...exportRenderRequest({ ...input, variant, view, against }),
			});
		const overview = await draw(input.variant, undefined);
		// The first answer names the variant by id, so a rename between two drawings cannot move them.
		const others = await Promise.all(
			[...overview.views, EVERYTHING_VIEW].map((view) => draw(overview.variant.id, view.id)),
		);
		const replies = [overview, ...others];
		if (replies.some((reply) => reply.version !== overview.version)) {
			throw new Error(
				`Semantic board "${overview.board}" changed while its views were drawn; run the command again.`,
			);
		}
		return {
			result: {
				success: true as const,
				board: overview.board,
				version: overview.version,
				variant: overview.variant,
				comparedWith: drawnAgainst(overview, input.noComparison),
				views: replies.map((reply) => listed(reply, input.noComparison)),
			},
		};
	},
});

export { semanticViewsContract };
