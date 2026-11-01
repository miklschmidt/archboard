import { ArchitectureRenderRequestSchema } from "@archboard/board/model";
// What a board render records about how it was drawn (ADR 0057, TASK-526.02).
//
// The recipe is what draws the picture again and what tells whether it is
// outdated. It names the board, the variant and the view by id, because names
// move and a former name can be taken by another board; it holds the drawing
// choices that change the picture; and it holds two digests. The fingerprint
// is of what the picture is drawn from, so it moves only when the board says
// something new. The picture digest is of the SVG as the renderer drew it,
// without the recipe, so it moves when the renderer draws the same board
// differently. It holds no output path and no board version: a file that is
// moved stays the same embed, and a draft edit raises the version and changes
// nothing that the picture draws.

import { z } from "zod";
import {
	LayoutEngineSchema,
	LegendLayoutSchema,
	OfferedViewSchema,
	RenderedVariantSchema,
	StandaloneThemeSchema,
} from "@archboard/board/render-reply";

/** The version of the recipe's shape. A reader refuses one it does not know. */
const RENDER_RECIPE_VERSION = 1;

/** The name that marks a recipe in a file: the SVG element's local name and the PNG chunk's keyword. */
const RENDER_RECIPE_MARK = "archboard:render-recipe";

/** The namespace of the SVG element that holds the recipe. */
const RENDER_RECIPE_NAMESPACE = "https://github.com/miklschmidt/archboard/render-recipe";

const IdSchema = RenderedVariantSchema.shape.id;

/** A SHA-256 digest, spelled with its algorithm. */
const DigestSchema = z
	.string()
	.regex(/^sha256:[0-9a-f]{64}$/u, "A digest is sha256:<64 hex digits>");

const RenderRecipeSchema = z
	.object({
		recipe: z.literal(RENDER_RECIPE_VERSION),
		/** The board by its id; the name is for messages, and the board may have another one now. */
		board: z.object({ id: IdSchema, name: z.string().min(1) }).strict(),
		/**
		 * The vault that holds the board, by the repository identity of its
		 * checkout, or null for a vault in no repository.
		 */
		vault: z.object({ repo: z.string().min(1).nullable() }).strict(),
		/** The variant by id, or `current` for a render that named none, so the render follows an adoption. */
		variant: z.union([z.literal("current"), z.object({ id: IdSchema }).strict()]),
		/** The view by id, Everything's included, or `overview` for a render that named none. */
		view: z.union([z.literal("overview"), z.object({ id: OfferedViewSchema.shape.id }).strict()]),
		/**
		 * How the picture reads against another variant: `on` for the board's own
		 * reading, `off` for none, or the variant it was asked to be drawn against.
		 */
		comparison: z.union([
			z.literal("on"),
			z.literal("off"),
			z.object({ against: IdSchema }).strict(),
		]),
		theme: StandaloneThemeSchema,
		/** The layout engine named, or null for the default one. */
		layout: LayoutEngineSchema.nullable(),
		/** The words of the title, true for the names of what is drawn, or null for none. */
		title: z.union([z.string().regex(/\S/u), z.literal(true)]).nullable(),
		/** How the legend is laid out and whether it stands alone, or null for none. */
		legend: z.object({ layout: LegendLayoutSchema, alone: z.boolean() }).strict().nullable(),
		/** A bitmap's scale and region; absent for an SVG. */
		raster: z
			.object({
				scale: z.number().positive(),
				region: z
					.object({ x: z.int(), y: z.int(), width: z.int(), height: z.int() })
					.strict()
					.nullable(),
			})
			.strict()
			.optional(),
		/** The digest of what the picture is drawn from. */
		fingerprint: DigestSchema,
		/** The digest of the SVG the renderer drew, without the recipe; a bitmap carries its SVG's. */
		picture: DigestSchema,
	})
	.strict()
	.refine((recipe) => recipe.raster === undefined || recipe.theme !== "auto", {
		message: "A bitmap holds one ground, so its theme is light or dark",
		path: ["theme"],
	});
type RenderRecipe = z.infer<typeof RenderRecipeSchema>;
const ArchitectureRecipeSchema = z.strictObject({
	recipe: z.literal(2),
	model: z.strictObject({ id: z.string(), name: z.string() }),
	vault: z.strictObject({ repo: z.string().nullable() }),
	reading: ArchitectureRenderRequestSchema,
	fingerprint: DigestSchema,
	picture: DigestSchema,
	raster: RenderRecipeSchema.shape.raster,
});
const AnyRenderRecipeSchema = z.union([RenderRecipeSchema, ArchitectureRecipeSchema]);
type AnyRenderRecipe = z.infer<typeof AnyRenderRecipeSchema>;

export {
	ArchitectureRecipeSchema,
	AnyRenderRecipeSchema,
	type AnyRenderRecipe,
	RENDER_RECIPE_MARK,
	RENDER_RECIPE_NAMESPACE,
	RENDER_RECIPE_VERSION,
	RenderRecipeSchema,
	type RenderRecipe,
};
