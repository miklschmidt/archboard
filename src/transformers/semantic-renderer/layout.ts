// The layout's own rules that focused runtime checks hold without a whole
// board: label reservations, spacing, corner rounding and crossing bridges.
export { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
export {
	curveThrough,
	curveClearanceIssue,
} from "@/transformers/semantic-renderer/lib/layout/curves";
export { COMPOUND_OPTIONS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
export { improveProjection } from "@/transformers/semantic-renderer/lib/layout/label-projections";
export {
	foldColumnCounts,
	foldColumns,
} from "@/transformers/semantic-renderer/lib/layout/fold-columns";
export {
	settleLabels,
	type LabelAttempt,
} from "@/transformers/semantic-renderer/lib/layout/label-reservations";
export type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
export type { Point } from "@/transformers/semantic-renderer/lib/geometry";
