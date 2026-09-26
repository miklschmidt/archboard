// The layout's own rules that focused runtime checks hold without a whole
// board: the column count a board is folded into, label reservations,
// spacing, corner rounding, crossing bridges and the marks where routes join.
export { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
export { junctionsOf } from "@/transformers/semantic-renderer/lib/svg/junctions";
export {
	curveThrough,
	curveClearanceIssue,
	straightenedCurve,
} from "@/transformers/semantic-renderer/lib/layout/curves";
export { COMPOUND_OPTIONS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
export { improveProjection } from "@/transformers/semantic-renderer/lib/layout/label-projections";
export {
	alignLabelRows,
	projectLabelChannels,
} from "@/transformers/semantic-renderer/lib/layout/label-runs";
export { routeGraph } from "@/transformers/semantic-renderer/lib/layout/route-graph";
export {
	foldColumnCounts,
	foldColumns,
} from "@/transformers/semantic-renderer/lib/layout/fold-columns";
export { chooseReading } from "@/transformers/semantic-renderer/lib/layout/column-readings";
export {
	settleLabels,
	type LabelAttempt,
} from "@/transformers/semantic-renderer/lib/layout/label-reservations";
export type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
export type { Point } from "@/transformers/semantic-renderer/lib/geometry";
