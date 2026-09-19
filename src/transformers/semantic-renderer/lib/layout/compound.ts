// One layout owner settles cards, frames, ports, routes and label boxes together.
// No subsequent paint or atlas pass is allowed to repair these coordinates.
import type { ElkExtendedEdge, ElkNode, ElkShape } from "@archboard/elk-rs";
import { fitIn } from "@/shared/shell-geometry/index";
import { WRAP_MIN_FIT_GAIN } from "@/transformers/semantic-renderer/config";
import { foldColumnCounts } from "@/transformers/semantic-renderer/lib/layout/fold-columns";
import type { VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	PaintedDrawing,
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { placeLabelsOnRuns } from "@/transformers/semantic-renderer/lib/layout/label-runs";
import {
	rememberSolves,
	settleLabels,
	type LabelAttempt,
} from "@/transformers/semantic-renderer/lib/layout/label-reservations";
import { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { curveThrough, pathOf, simplify } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { rendererHost } from "@/transformers/semantic-renderer/lib/host";

/** One measured architecture in the engine's solving frame. */
interface Problem {
	readonly content: VariantContent;
	readonly measured: MeasuredArchitecture;
	readonly columns: number;
}

/**
 * Read a complete box in the global coordinates returned by placement.
 * @param shape A node or edge label after layout.
 * @returns The geometry shared by painter and atlas.
 */
function boxOf(shape: ElkShape): Box {
	const { x, y, width, height } = shape;
	if (x === undefined || y === undefined || width === undefined || height === undefined) {
		throw new Error(`Layout omitted geometry for ${shape.id}`);
	}
	return { x, y, width, height };
}

/**
 * Collect each semantic subject exactly once, retaining containment depth.
 * @param nodes The laid-out hierarchy.
 * @param measured The semantic meaning and precomputed text for each node.
 * @param depth The depth of this level.
 * @returns Final node geometry in parent-before-child order.
 */
function drawingNodes(
	nodes: readonly ElkNode[],
	measured: MeasuredArchitecture,
	depth: number,
): DrawingNode[] {
	return nodes.flatMap((node) => {
		const value = measured.nodes.get(node.id);
		if (value === undefined) {
			throw new Error(`Layout returned an unknown architecture node: ${node.id}`);
		}
		return [
			{ measured: value, box: boxOf(node), depth },
			...drawingNodes(node.children ?? [], measured, depth + 1),
		];
	});
}

/**
 * Join the engine's route into the same rounded geometry the SVG paints.
 * @param result One laid-out semantic edge.
 * @returns Its continuous curve, with no duplicate or collinear waypoints.
 */
function pointsOf(result: ElkExtendedEdge): Point[] {
	const sections = result.sections ?? [];
	if (sections.length !== 1) {
		throw new Error(`Layout did not return one complete route for relationship ${result.id}`);
	}
	const points = sections.flatMap((section) => [
		section.startPoint,
		...(section.bendPoints ?? []),
		section.endPoint,
	]);
	return points;
}

/**
 * Read a reserved label box; other measured labels will use clear route runs.
 * @param result The laid-out relationship.
 * @param measured The measured words and dimensions.
 * @returns Its final label when the relationship carries one.
 */
function drawingLabel(
	result: ElkExtendedEdge,
	measured: MeasuredArchitecture,
): Pick<DrawingEdge, "label"> {
	const label = measured.labels.get(result.id);
	if (label === undefined) {
		return {};
	}
	const shape = result.labels?.[0];
	if (shape === undefined) {
		return {};
	}
	return { label: { measured: label, box: boxOf(shape) } };
}

/**
 * Match final route and label geometry to every relationship in the view.
 * @param content The semantic connections in drawing order.
 * @param laidOut The engine's complete graph.
 * @param measured Text measurement for the optional label.
 * @returns Every drawn edge; missing routes are errors, never silent omissions.
 */
function drawingEdges(
	content: VariantContent,
	laidOut: ElkNode,
	measured: MeasuredArchitecture,
): DrawingEdge[] {
	const results = new Map(laidOut.edges?.map((edge) => [edge.id, edge]));
	const labels = new Map(
		[...results].flatMap(([id, result]) => {
			const label = drawingLabel(result, measured).label;
			return label === undefined ? [] : [[id, label] as const];
		}),
	);
	const routes = new Map(
		content.edges.map((edge) => [edge.id, simplify(pointsOf(results.get(edge.id)!))]),
	);
	return content.edges.map((edge) => {
		const result = results.get(edge.id);
		if (result === undefined) {
			throw new Error(`Layout did not return relationship ${edge.id}`);
		}
		const points = routes.get(edge.id)!;
		const measuredLabel = labels.get(edge.id);
		const label = measuredLabel === undefined ? {} : { label: measuredLabel };
		const curve = curveThrough(points, label.label?.box);
		return {
			edge,
			curve,
			path: pathOf(curve),
			...label,
		};
	});
}

/**
 * Route with measured spacing, reserving only labels that need their own layer.
 * @param content The architecture meaning, including its containment links.
 * @param measured Fixed card and label dimensions and minimum frame dimensions.
 * @returns The only placement, routing and label result consumed by painting.
 */
async function layoutCompound(
	content: VariantContent,
	measured: MeasuredArchitecture,
): Promise<PaintedDrawing> {
	const problem: Problem = { content, measured, columns: 1 };
	const baseline = await settleReading(problem);
	const drawing = await chooseReading(problem, baseline);
	// Bridges are settled here as part of the geometry a reader sees.
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

/**
 * Tighten the width bound after each improvement before trying another count.
 * @param problem The measured semantic board.
 * @param baseline Original settled geometry used to find indivisible bands.
 * @param best Best complete reading so far.
 * @param columns Next count, in increasing order so fewer columns win ties.
 * @returns The best complete reading without solving impossible improvements.
 */
async function chooseReading(
	problem: Problem,
	baseline: ArchitectureDrawing,
	best = baseline,
	columns = 2,
): Promise<ArchitectureDrawing> {
	const requiredFit = fitIn(best) * (1 + WRAP_MIN_FIT_GAIN);
	const count = columnCounts(baseline, requiredFit).find((candidate) => candidate >= columns);
	if (count === undefined) return best;
	const next = await betterReading({ ...problem, columns: count }, best, requiredFit);
	return chooseReading(problem, baseline, next, count + 1);
}

/**
 * Keep the complete baseline when an alternate cannot route or improve pane fit.
 * @param problem One alternate column count.
 * @param baseline Best complete reading so far; fewer columns win equal fit.
 * @param requiredFit The material relative improvement another column must provide.
 * @returns The better complete reading.
 */
async function betterReading(
	problem: Problem,
	baseline: ArchitectureDrawing,
	requiredFit: number,
): Promise<ArchitectureDrawing> {
	try {
		const candidate = await settleReading(problem);
		const fit = fitIn(candidate);
		return fit > fitIn(baseline) && fit >= requiredFit ? candidate : baseline;
	} catch {
		return baseline;
	}
}

/**
 * Find feasible column counts from the fully settled baseline geometry.
 * Preserve hierarchy so proposed folds move whole frames and side-entry sources.
 * @param drawing The complete downward baseline.
 * @param minimumFit The fit any further candidate must improve.
 * @returns Increasing candidate counts; ties retain the earlier, simpler reading.
 */
function columnCounts(drawing: ArchitectureDrawing, minimumFit: number): number[] {
	const subjects = [...drawing.cards, ...drawing.containers];
	const nodes = new Map<string, ElkNode>(
		subjects.map(({ measured, box }) => [measured.node.id, { id: measured.node.id, ...box }]),
	);
	const children: ElkNode[] = [];
	for (const { measured } of subjects) {
		const node = nodes.get(measured.node.id)!;
		const parent = nodes.get(measured.node.parent ?? "");
		if (parent === undefined) children.push(node);
		else (parent.children ??= []).push(node);
	}
	return foldColumnCounts(
		{
			id: "column-candidates",
			x: 0,
			y: 0,
			width: drawing.width,
			height: drawing.height,
			children,
			edges: drawing.edges.map(({ edge }) => ({
				id: edge.id,
				sources: [edge.from],
				targets: [edge.to],
			})),
		},
		minimumFit,
	);
}

/**
 * Settle labels independently for one candidate reading.
 * @param problem Measured content and requested downward column count.
 * @returns A complete candidate or a routing/label failure.
 */
function settleReading(problem: Problem): Promise<ArchitectureDrawing> {
	return settleLabels(
		rememberSolves((reserved) => attemptLabels(problem, reserved)),
		new Set(),
	);
}

/**
 * Seed all measured relationships before omitting unneeded label reservations.
 * @param problem The board, in the solving frame.
 * @param reserved Relationships that could not fit a badge on an ordinary run.
 * @param forced Labels that also require a route through their reserved box.
 * @returns The next complete engine input.
 */
function graphForLabels(
	problem: Problem,
	reserved: ReadonlySet<string>,
	forced: ReadonlySet<string>,
): ElkNode {
	const { content, measured } = problem;
	const graph = compoundGraph(content, measured);

	for (const edge of graph.edges ?? []) {
		if (!reserved.has(edge.id)) edge.labels = [];
		if (forced.has(edge.id))
			edge.layoutOptions = { ...edge.layoutOptions, "archboard.route-label": "true" };
	}
	return graph;
}

/**
 * Whether a label was drawn somewhere other than the box the engine reserved.
 * @param reserved The engine's box.
 * @param drawn The box it was drawn in.
 * @returns True when the two differ by more than rounding.
 */
function movedOff(reserved: Box, drawn: Box | undefined): boolean {
	return drawn === undefined || Math.hypot(reserved.x - drawn.x, reserved.y - drawn.y) > 0.5;
}

/**
 * Try natural routes before forcing only the labels that still cannot fit.
 * @param problem The board, in the solving frame.
 * @param reserved Labels given dedicated placement space.
 * @param forced Labels whose natural route has already proved insufficient.
 * @returns The drawing and remaining placement requirements.
 */
async function attemptLabels(
	problem: Problem,
	reserved: ReadonlySet<string>,
	forced: ReadonlySet<string> = new Set(),
): Promise<LabelAttempt> {
	const attempt = await drawAttempt(problem, reserved, forced);
	const missing = attempt.missing.filter(
		({ edge }) => reserved.has(edge.id) && !forced.has(edge.id),
	);
	if (missing.length === 0) return attempt;
	// Placement space is not a waypoint. Each retry forces only labels that
	// still have no clear natural run, so every retry makes finite progress.
	return attemptLabels(
		problem,
		reserved,
		new Set([...forced, ...missing.map(({ edge }) => edge.id)]),
	);
}

/**
 * Draw one placement with only the explicitly needed label waypoints.
 * @param problem Measured semantic content and reading direction.
 * @param reserved Labels given placement space.
 * @param forced Labels requiring the route to pass through that space.
 * @returns The drawing and its remaining label requirements.
 */
async function drawAttempt(
	problem: Problem,
	reserved: ReadonlySet<string>,
	forced: ReadonlySet<string>,
): Promise<LabelAttempt> {
	const { content, measured } = problem;
	const laidOut = await rendererHost().solve(graphForLabels(problem, reserved, forced), {
		...COMPOUND_OPTIONS,
		"archboard.fold.columns": String(problem.columns),
	});
	const nodes = drawingNodes(laidOut.children ?? [], measured, 0);
	const extent = boxOf(laidOut);
	const solved = drawingEdges(content, laidOut, measured);
	const drawing = placeLabelsOnRuns(
		{
			direction: "down",
			width: extent.width,
			height: extent.height,
			cards: nodes.filter((node) => node.measured.headerHeight === 0),
			containers: nodes.filter((node) => node.measured.headerHeight > 0),
			edges: solved,
		},
		measured.labels,
	);
	const missing = drawing.edges.filter(
		({ edge, label }) => measured.labels.has(edge.id) && label === undefined,
	);
	const unused = solved.flatMap(({ edge, label }, index) =>
		reserved.has(edge.id) &&
		(label === undefined || movedOff(label.box, drawing.edges[index]?.label?.box))
			? [edge.id]
			: [],
	);
	return { drawing, missing, unused };
}

export { layoutCompound };
