// The layout's own rules that focused runtime checks hold without a whole
// board: corner rounding, crossing bridges, the marks where routes join, how
// traffic keeps time and is held in a card, how Track and Blocks weigh one
// reading against another, whether a wrap sinks a card, and how Blocks asks
// for the layouts its joins weigh.
export { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
export { shownDrawing } from "@/transformers/semantic-renderer/lib/shown";
export { junctionsOf } from "@/transformers/semantic-renderer/lib/svg/junctions";
export { rimLength } from "@/transformers/semantic-renderer/lib/svg/card-rim";
export { relayRhythms, type Lane } from "@/transformers/semantic-renderer/lib/svg/traffic-relay";
export {
	curveThrough,
	curveClearanceIssue,
} from "@/transformers/semantic-renderer/lib/layout/curves";
export { placeRun, type Slider } from "@/transformers/semantic-renderer/lib/track/label-runs";
export { unstepped } from "@/transformers/semantic-renderer/lib/blocks/steps";
export { captionIn } from "@/transformers/semantic-renderer/lib/blocks/lone";
export { type Joined } from "@/transformers/semantic-renderer/lib/blocks/joins";
export { layJoined } from "@/transformers/semantic-renderer/lib/blocks/joins-laid";
export { weighedPlaced, type Page } from "@/transformers/semantic-renderer/lib/blocks/weighing";
export {
	readsBetter,
	sinks,
	takes,
	type Weighed,
} from "@/transformers/semantic-renderer/lib/track/score";
export type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
export type { Point } from "@/transformers/semantic-renderer/lib/geometry";
