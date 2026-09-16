// The layout's own rules that focused runtime checks hold without a whole
// board: how label reservations settle, the spacing a label keeps, and which
// of several drawings the scorecard keeps.
export { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/lib/layout/compound-graph";
export { bestOf } from "@/runtime/semantic-renderer/lib/layout/scorecard";
export {
	settleLabels,
	type LabelAttempt,
} from "@/runtime/semantic-renderer/lib/layout/label-reservations";
export type { ArchitectureDrawing, DrawingEdge } from "@/runtime/semantic-renderer/lib/drawing";
export type { Point } from "@/runtime/semantic-renderer/lib/geometry";
