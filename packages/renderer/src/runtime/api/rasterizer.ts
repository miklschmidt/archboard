// A picture to a bitmap in a private headless Chromium, and the receipt of the capture.
export { RasterScaleSchema } from "#runtime/rasterizer/operations/bounds.ts";
export type { PageRegion } from "#runtime/rasterizer/operations/bounds.ts";
export { readPngDimensions } from "#runtime/rasterizer/operations/png.ts";
export {
	SemanticRasterReceiptSchema,
	ArchitectureRasterReceiptSchema,
} from "#runtime/rasterizer/operations/receipt.ts";
export { createSemanticRasterizer } from "#runtime/rasterizer/services/rasterizer.ts";
