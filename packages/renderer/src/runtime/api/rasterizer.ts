// A picture to a bitmap in a private headless Chromium, and the receipt of the capture.
export { rasterScaleSchema } from "#runtime/rasterizer/operations/bounds.ts";
export type { PageRegion } from "#runtime/rasterizer/operations/bounds.ts";
export { readPngDimensions } from "#runtime/rasterizer/operations/png.ts";
export {
	architectureRasterReceiptSchema,
	parseRasterReceipt,
} from "#runtime/rasterizer/operations/receipt.ts";
export type {
	ArchitectureRasterReceipt,
	SemanticRasterReceipt,
} from "#runtime/rasterizer/operations/receipt.ts";
export { createSemanticRasterizer } from "#runtime/rasterizer/services/rasterizer.ts";
