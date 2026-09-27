// The layout's own rules that focused runtime checks hold without a whole
// board: the column count a board is folded into, label reservations,
// spacing, corner rounding, crossing bridges and the marks where routes join.
export { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
export { shownDrawing } from "@/transformers/semantic-renderer/lib/shown";
export { junctionsOf } from "@/transformers/semantic-renderer/lib/svg/junctions";
export { meetingPlaces, restingPlace } from "@/transformers/semantic-renderer/lib/svg/comet-rest";
export {
	curveThrough,
	curveClearanceIssue,
	straightenedCurve,
} from "@/transformers/semantic-renderer/lib/layout/curves";
export {
	COMPOUND_OPTIONS,
	compoundGraph,
	PINNED_STANDING,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
export { improveProjection } from "@/transformers/semantic-renderer/lib/layout/label-projections";
export {
	alignLabelRows,
	projectLabelChannels,
} from "@/transformers/semantic-renderer/lib/layout/label-runs";
export { publishRoutes } from "@/transformers/semantic-renderer/lib/layout/avoid-routes";
export { routeGraph } from "@/transformers/semantic-renderer/lib/layout/route-graph";
export { centreLabels } from "@/transformers/semantic-renderer/lib/layout/label-centring";
export {
	centreHandicap,
	tidierSettlement,
} from "@/transformers/semantic-renderer/lib/layout/even-pins";
export { finished } from "@/transformers/semantic-renderer/lib/layout/finishing";
export { RouteCheckFailed } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
export { clearerSettlement } from "@/transformers/semantic-renderer/lib/layout/label-clearance";
export { requestOptions } from "@/transformers/semantic-renderer/lib/layout/route-requests";
export { wallOf, wallReach } from "@/transformers/semantic-renderer/lib/layout/frame-walls";
export { centredPins } from "@/transformers/semantic-renderer/lib/layout/lone-pins";
export { relationshipChannel } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
export { EndpointOptions } from "@/transformers/semantic-renderer/lib/layout/endpoint-options";
export {
	foldColumnCounts,
	foldColumns,
} from "@/transformers/semantic-renderer/lib/layout/fold-columns";
export { chooseReading } from "@/transformers/semantic-renderer/lib/layout/column-readings";
export { placeRun, type Slider } from "@/transformers/semantic-renderer/lib/track/label-runs";
export { unstepped } from "@/transformers/semantic-renderer/lib/blocks/steps";
export { captionIn } from "@/transformers/semantic-renderer/lib/blocks/lone";
export { readsBetter, takes, type Weighed } from "@/transformers/semantic-renderer/lib/track/score";
export {
	settleLabels,
	type LabelAttempt,
} from "@/transformers/semantic-renderer/lib/layout/label-reservations";
export type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
export type { Point } from "@/transformers/semantic-renderer/lib/geometry";
