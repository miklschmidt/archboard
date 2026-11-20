// The receipt of one rasterized picture: the PNG written, its selectors and
// dimensions, and the SVG it was drawn from. The CLI answers with it and the
// skill evaluation reads the same shape back.

import { z } from "zod";
import { ArchitectureRenderResultSchema } from "#shared/canonical-contracts/schemas/model-operations.ts";
import {
	DiagramThemeSchema,
	OfferedViewSchema,
	PictureReceiptShape,
	RenderedVariantSchema,
	StandaloneThemeSchema,
} from "#shared/protocol/render-reply.ts";

/** The diagram page before bitmap scaling. */
const SemanticRasterPageSizeSchema = z.object({ width: z.number(), height: z.number() });

/** One rectangle of the diagram page, in whole diagram pixels. */
const SemanticRasterRegionSchema = z.object({
	x: z.int(),
	y: z.int(),
	width: z.int(),
	height: z.int(),
});

/** The receipt of a PNG of a legacy board's view, which `semantic rasterize` wrote. */
const SemanticRasterReceiptSchema = z.object({
	success: z.literal(true),
	document: z.string(),
	version: z.int(),
	/** What was drawn; ids select it exactly and names are what a person types. */
	variant: RenderedVariantSchema,
	/**
	 * The variant this picture is drawn against, or null when comparison is disabled or there is nothing
	 * to read it against — it is the current variant, or a first draft on a
	 * document with none — and it is therefore drawn plain. Every other variant is
	 * drawn by default as the comparison with the document's current one (on a document
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
		svgSha256: z.string(),
		motion: z.literal("paused-at-start"),
	}),
});

/** The receipt of a PNG of a model reading, which `model rasterize` writes. */
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

export { ArchitectureRasterReceiptSchema, SemanticRasterReceiptSchema };
