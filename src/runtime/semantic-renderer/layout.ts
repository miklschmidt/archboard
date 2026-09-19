// The layout's own rules, for focused runtime checks. None of these draws or
// measures, so none needs the Bun host.
export {
	bridgeCrossings,
	curveThrough,
	curveClearanceIssue,
	COMPOUND_OPTIONS,
	settleLabels,
	improveProjection,
	type ArchitectureDrawing,
	type DrawingEdge,
	type LabelAttempt,
	type Point,
} from "@/transformers/semantic-renderer/layout";
