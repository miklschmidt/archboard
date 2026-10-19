// A page comes from its placement, not from what is drawn: the placement's
// bounds and margins, or a block's inset around a frame at its edge. The
// painter only ever grows a page, so that slack became uneven margins, 52
// points at the top against 24 elsewhere, or an 80-point band down one side.
// Every engine's
// settled drawing is moved to the margin and its page cut to what it draws,
// so every side keeps the same margin.
import type { ArchitectureDrawing, DrawingNode } from "#shared/rules/render/drawing.ts";
import { DIAGRAM_MARGIN } from "#shared/constants/spacing.ts";
import { union, type Box, type Point } from "#shared/rules/geometry.ts";
import { curveBounds, pathOf, type Curve } from "#shared/rules/layout/routes/curves.ts";

/**
 * A settled drawing moved so what it draws starts at the margin, on a page
 * that ends the margin past it.
 * @param drawing The settled drawing.
 * @returns The drawing on its fitted page.
 */
function fittedPage(drawing: ArchitectureDrawing): ArchitectureDrawing {
	const drawn = union([
		...[...drawing.cards, ...drawing.containers].map(({ box }) => box),
		...drawing.edges.flatMap(({ curve, label }) => [
			curveBounds(curve),
			...(label === undefined ? [] : [label.box]),
		]),
		...(drawing.regions ?? []).map(({ box }) => box),
	]);
	if (drawn === undefined) return drawing;
	const by = { x: DIAGRAM_MARGIN - drawn.x, y: DIAGRAM_MARGIN - drawn.y };
	/**
	 * A placed node moved with the drawing.
	 * @param node The node.
	 * @returns The moved node.
	 */
	const move = (node: DrawingNode): DrawingNode => ({ ...node, box: moved(node.box, by) });
	return {
		...drawing,
		width: drawn.width + 2 * DIAGRAM_MARGIN,
		height: drawn.height + 2 * DIAGRAM_MARGIN,
		cards: drawing.cards.map(move),
		containers: drawing.containers.map(move),
		edges: drawing.edges.map((edge) => {
			const curve = movedCurve(edge.curve, by);
			const label =
				edge.label === undefined
					? {}
					: { label: { ...edge.label, box: moved(edge.label.box, by) } };
			return { ...edge, curve, path: pathOf(curve), ...label };
		}),
		...(drawing.regions === undefined
			? {}
			: {
					regions: drawing.regions.map((region) => ({
						...region,
						box: moved(region.box, by),
						caption: { ...region.caption, box: moved(region.caption.box, by) },
					})),
				}),
	};
}

/**
 * A point moved.
 * @param point The point.
 * @param by How far.
 * @returns The moved point.
 */
function shifted(point: Point, by: Point): Point {
	return { x: point.x + by.x, y: point.y + by.y };
}

/**
 * A box moved.
 * @param box The box.
 * @param by How far.
 * @returns The moved box.
 */
function moved(box: Box, by: Point): Box {
	return { ...box, ...shifted(box, by) };
}

/**
 * A route moved, every corner and control point with it.
 * @param curve The route.
 * @param by How far.
 * @returns The moved route.
 */
function movedCurve(curve: Curve, by: Point): Curve {
	return {
		from: shifted(curve.from, by),
		segments: curve.segments.map((segment) =>
			segment.kind === "line"
				? { kind: "line", to: shifted(segment.to, by) }
				: {
						kind: "cubic",
						first: shifted(segment.first, by),
						second: shifted(segment.second, by),
						to: shifted(segment.to, by),
					},
		),
	};
}

export { fittedPage };
