// The layout's own rules that focused runtime checks hold without a whole
// board: corner rounding, crossing bridges, the marks where routes join, where
// a streak rests, and how Track and Blocks weigh one reading against another.
export { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
export { shownDrawing } from "@/transformers/semantic-renderer/lib/shown";
export { junctionsOf } from "@/transformers/semantic-renderer/lib/svg/junctions";
export { meetingPlaces, restingPlace } from "@/transformers/semantic-renderer/lib/svg/comet-rest";
export {
	curveThrough,
	curveClearanceIssue,
} from "@/transformers/semantic-renderer/lib/layout/curves";
export { placeRun, type Slider } from "@/transformers/semantic-renderer/lib/track/label-runs";
export { unstepped } from "@/transformers/semantic-renderer/lib/blocks/steps";
export { readsBetter, takes, type Weighed } from "@/transformers/semantic-renderer/lib/track/score";
export type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
export type { Point } from "@/transformers/semantic-renderer/lib/geometry";
