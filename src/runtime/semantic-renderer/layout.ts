// The layout's own rules, for focused runtime checks. None of these draws or
// measures, so none needs the Bun host.
export {
	alignLabelRows,
	bridgeCrossings,
	chooseReading,
	curveThrough,
	curveClearanceIssue,
	COMPOUND_OPTIONS,
	settleLabels,
	improveProjection,
	projectLabelChannels,
	routeGraph,
	type ArchitectureDrawing,
	type DrawingEdge,
	type LabelAttempt,
	type Point,
} from "@/transformers/semantic-renderer/layout";
