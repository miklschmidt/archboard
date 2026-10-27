// A picture to a bitmap in a private headless Chromium, and the receipt of the capture.
export { RASTER_MAX_SCALE, RASTER_MIN_SCALE } from "#runtime/operations/rasterizer/bounds.ts";
export type { PageRegion } from "#runtime/operations/rasterizer/bounds.ts";
export { readPngDimensions } from "#runtime/operations/rasterizer/png.ts";
export {
	SemanticRasterReceiptSchema,
	ArchitectureRasterReceiptSchema,
} from "#runtime/operations/rasterizer/receipt.ts";
export {
	createSemanticRasterizer,
	SemanticRasterError,
} from "#runtime/services/rasterizer/rasterizer.ts";
export type { Capture } from "#runtime/services/rasterizer/session.ts";
