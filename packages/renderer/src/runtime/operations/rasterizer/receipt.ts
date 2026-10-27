import { ArchitectureRenderResultSchema } from "@archboard/board/model";
import { StandaloneThemeSchema } from "@archboard/board/render-reply";
// The public receipt for one semantic rasterization: the saved board picture,
// its selectors and dimensions, and the renderer document that produced it.
// The CLI writes this shape and evaluation tooling parses the same authority.

import { z } from "zod";

import {
	DiagramThemeSchema,
	OfferedViewSchema,
	PictureReceiptShape,
	RenderedVariantSchema,
} from "@archboard/board/render-reply";

/** The diagram page before bitmap scaling. */
const SemanticRasterPageSizeSchema = z.object({ width: z.number(), height: z.number() });

/** One rectangle of the diagram page, in whole diagram pixels. */
const SemanticRasterRegionSchema = z.object({
	x: z.int(),
	y: z.int(),
	width: z.int(),
	height: z.int(),
});

/** The machine-readable receipt for a PNG written by `semantic rasterize`. */
const SemanticRasterReceiptSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	/** What was drawn; ids select it exactly and names are what a person types. */
	variant: RenderedVariantSchema,
	/**
	 * The variant this picture is drawn against, or null when comparison is disabled or there is nothing
	 * to read it against — it is the current variant, or a first draft on a
	 * board with none — and it is therefore drawn plain. Every other variant is
	 * drawn by default as the comparison with the board's current one (on a board
	 * with none, with the one it came from), so the receipt names the other
	 * side; the bitmap cannot.
	 */
	comparedWith: RenderedVariantSchema.nullable(),
	/** The selected view, or null when the whole variant was drawn. */
	view: OfferedViewSchema.nullable(),
	theme: DiagramThemeSchema,
	file: z.string(),
	/** Bitmap pixels. */
	width: z.int(),
	height: z.int(),
	/** Bitmap pixels per diagram pixel. */
	scale: z.number(),
	/** The diagram's page before scaling. */
	diagram: SemanticRasterPageSizeSchema,
	/** The captured page rectangle, or null for the whole diagram. */
	region: SemanticRasterRegionSchema.nullable(),
	/**
	 * Every node, edge, flow and step the diagram draws, and the counts of the
	 * marks its key shows: of the whole diagram, also when a region is captured.
	 */
	...PictureReceiptShape,
	/** The exact renderer document and stable presentation state used for capture. */
	source: z.object({
		renderer: z.literal("semantic-renderer"),
		fonts: z.literal("embedded"),
		svgSha256: z.string(),
		facesLoaded: z.int(),
		motion: z.literal("paused-at-start"),
	}),
});

type SemanticRasterReceipt = z.infer<typeof SemanticRasterReceiptSchema>;
type SemanticRasterPageSize = SemanticRasterReceipt["diagram"];

export { SemanticRasterReceiptSchema, type SemanticRasterPageSize, type SemanticRasterReceipt };

const ArchitectureRasterReceiptSchema = ArchitectureRenderResultSchema.options[0]
	.omit({ svg: true, atlas: true })
	.extend({
		theme: StandaloneThemeSchema,
		file: z.string(),
		scale: z.number(),
		diagram: SemanticRasterPageSizeSchema,
		region: SemanticRasterRegionSchema.nullable(),
		source: SemanticRasterReceiptSchema.shape.source,
	});
export { ArchitectureRasterReceiptSchema };
