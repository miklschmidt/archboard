// The layout's own rules, for focused runtime checks. None of these draws or
// measures, so none needs the Bun host.
export {
	bridgeCrossings,
	curveThrough,
	curveClearanceIssue,
	shownDrawing,
	type ArchitectureDrawing,
	type DrawingEdge,
	type Point,
} from "@/transformers/semantic-renderer/layout";
