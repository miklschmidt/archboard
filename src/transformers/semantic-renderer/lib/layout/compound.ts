// One layout owner settles cards, frames, ports, routes and label boxes together.
// No subsequent paint or atlas pass is allowed to repair these coordinates.
import type { ElkExtendedEdge, ElkNode, ElkShape, LayoutOptions } from "@archboard/elk-rs";
import { chooseReading } from "@/transformers/semantic-renderer/lib/layout/column-readings";
import type { ChangeKind, VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	PaintedDrawing,
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	type LabelAnchor,
	anchorLabelsOnRuns,
	alignLabelRows,
	projectLabelChannels,
	placeLabelsOnRuns,
} from "@/transformers/semantic-renderer/lib/layout/label-runs";
import { improveProjection } from "@/transformers/semantic-renderer/lib/layout/label-projections";
import {
	rememberSolves,
	settleLabels,
	type LabelAttempt,
} from "@/transformers/semantic-renderer/lib/layout/label-reservations";
import { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { unfoldCrossings } from "@/transformers/semantic-renderer/lib/layout/folded-crossings";
import {
	curveClearanceIssue,
	curveThrough,
	pathOf,
	simplify,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { SOLVE_STAGE, rendererHost } from "@/transformers/semantic-renderer/lib/host";

/** One measured architecture in the engine's solving frame. */
interface Problem {
	readonly content: VariantContent;
	readonly measured: MeasuredArchitecture;
	readonly standings?: Readonly<Record<string, ChangeKind>> | undefined;
	readonly columns: number;
	/** Whether the reading is no longer wanted, so its remaining solves are not asked. */
	readonly abandoned?: () => boolean;
}

/**
 * One reading being settled: its problem, and its placements by label
 * reservations. Placement reads which labels are reserved and nothing about
 * where a forced label sits, so every attempt with the same reservations
 * routes the same placement (TASK-342).
 */
interface Reading extends Problem {
	readonly place: (reserved: ReadonlySet<string>) => Promise<ElkNode>;
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
	if (result.layoutOptions?.["archboard.route-label"] !== "true") return {};
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
	return content.edges
		.toSorted((one, other) => one.order - other.order)
		.map((edge) => {
			const result = results.get(edge.id);
			if (result === undefined) {
				throw new Error(`Layout did not return relationship ${edge.id}`);
			}
			const points = routes.get(edge.id)!;
			const measuredLabel = labels.get(edge.id);
			const label = measuredLabel === undefined ? {} : { label: measuredLabel };
			const curve = curveThrough(points);
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
 * @param standings Comparison standings used to distinguish marked relationship channels.
 * @returns The only placement, routing and label result consumed by painting.
 */
async function layoutCompound(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
): Promise<PaintedDrawing> {
	const problem: Problem = { content, measured, standings, columns: 1 };
	const baseline = await settleReading(problem);
	const chosen = await chooseReading(baseline, (columns, unwanted) =>
		settleReading({ ...problem, columns, abandoned: unwanted }),
	);
	// Lanes that fold into one row are exchanged first, so the routes the
	// drawing reports are the ones painted (junction marks read them); bridges
	// are then settled as part of the geometry a reader sees.
	const drawing = unfoldCrossings(chosen);
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

/**
 * Settle labels independently for one candidate reading.
 * @param problem Measured content and requested downward column count.
 * @returns A complete candidate or a routing/label failure.
 */
async function settleReading(problem: Problem): Promise<ArchitectureDrawing> {
	const reading: Reading = {
		...problem,
		place: rememberSolves((reserved) =>
			solve(problem, graphForLabels(problem, reserved), {
				...solveOptions(problem),
				[SOLVE_STAGE]: "place",
			}),
		),
	};
	const drawing = await settleLabels(
		{
			/**
			 * The page a set of reservations places, which routing leaves as it is.
			 * @param reserved Labels given placement space.
			 * @returns The placed page.
			 */
			place: (reserved) => reading.place(reserved).then(boxOf),
			solve: rememberSolves((reserved) => attemptLabels(reading, reserved)),
		},
		new Set(),
	);
	for (const { edge, curve, label } of drawing.edges) {
		const issue = curveClearanceIssue(curve, label?.box);
		if (issue !== undefined) throw new Error(`Layout relationship ${edge.id}: ${issue}`);
	}
	return drawing;
}

/**
 * Seed all measured relationships before omitting unneeded label reservations.
 * @param problem The board, in the solving frame.
 * @param reserved Relationships that could not fit a badge on an ordinary run.
 * @returns The next placement input.
 */
function graphForLabels(problem: Problem, reserved: ReadonlySet<string>): ElkNode {
	const { content, measured } = problem;
	const graph = compoundGraph(content, measured, problem.standings);
	for (const edge of graph.edges ?? []) if (!reserved.has(edge.id)) edge.labels = [];
	return graph;
}

/**
 * Ask a placed graph's forced labels to be routed through.
 * @param placed A placement of the reading, which stays as it is.
 * @param forced Labels that require a route through their reserved box.
 * @returns The routing input.
 */
function forceLabels(
	placed: ElkNode,
	forced: ReadonlyMap<string, LabelAnchor | undefined>,
): ElkNode {
	const graph = structuredClone(placed);
	for (const edge of graph.edges ?? []) {
		if (!forced.has(edge.id)) continue;
		edge.layoutOptions = {
			...edge.layoutOptions,
			"archboard.route-label": "true",
			...anchorOptions(forced.get(edge.id)),
		};
	}
	return graph;
}

/**
 * Carry an accepted native waypoint through placement without changing its measured size.
 * @param box Optional accepted anchor; absent means keep the engine reservation.
 * @returns Routing metadata for the accepted physical position.
 */
function anchorOptions(box: LabelAnchor | undefined): Record<string, string> {
	return box === undefined
		? {}
		: {
				"archboard.route-label.x": String(box.x),
				"archboard.route-label.axis": box.axis ?? "y",
				"archboard.route-label.pin-align": String(box.pinAlign ?? true),
				"archboard.route-label.y": String(box.y),
			};
}

/**
 * Retain every reserved box so proposed anchors cannot occupy a later fallback.
 * @param graph Complete native scene, including currently unforced reservations.
 * @param measured Semantic label dimensions and text.
 * @returns Reservation boxes keyed by relationship identity.
 */
function reservedLabels(
	graph: ElkNode,
	measured: MeasuredArchitecture,
): ReadonlyMap<string, NonNullable<DrawingEdge["label"]>> {
	return new Map(
		(graph.edges ?? []).flatMap((edge) => {
			const shape = edge.labels?.[0];
			const label = measured.labels.get(edge.id);
			return shape === undefined || label === undefined
				? []
				: [[edge.id, { measured: label, box: boxOf(shape) }] as const];
		}),
	);
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
	problem: Reading,
	reserved: ReadonlySet<string>,
	forced: ReadonlyMap<string, LabelAnchor | undefined> = new Map(),
): Promise<LabelAttempt> {
	const attempt = await drawAttempt(problem, reserved, forced);
	const missing = attempt.missing.filter(
		({ edge }) => reserved.has(edge.id) && !forced.has(edge.id),
	);
	if (missing.length === 0) return correctLabelChannels(problem, reserved, forced, attempt);
	// Placement space is not a waypoint. Each retry forces only labels that
	// still have no clear natural run, so every retry makes finite progress.
	const eligible = new Set([...forced.keys(), ...missing.map(({ edge }) => edge.id)]);
	const drawing = {
		...attempt.drawing,
		edges: attempt.drawing.edges.map(({ edge, curve, path }) => {
			const label = attempt.reservedBoxes.get(edge.id);
			return { edge, curve, path, ...(label === undefined ? {} : { label }) };
		}),
	};
	const anchors = anchorLabelsOnRuns(drawing, problem.measured.labels, eligible);
	const next = new Map([...eligible].map((id) => [id, anchors.get(id) ?? forced.get(id)]));
	return attemptLabels(problem, reserved, next);
}

/**
 * A forced waypoint can reveal a nearby native corridor absent from the natural route.
 * Repair cramped geometry, or try one simpler channel proposal for a valid route.
 * @param problem Measured board and requested reading.
 * @param reserved Labels retaining placement space.
 * @param forced Current native waypoint positions.
 * @param attempt Completed route attempt before optional release.
 * @returns The same attempt, or one reroute with physically feasible row corrections.
 */
async function correctLabelChannels(
	problem: Reading,
	reserved: ReadonlySet<string>,
	forced: ReadonlyMap<string, LabelAnchor | undefined>,
	attempt: Awaited<ReturnType<typeof drawAttempt>>,
): Promise<LabelAttempt> {
	const invalid = new Set(
		attempt.drawing.edges
			.filter(
				({ edge, curve, label }) =>
					forced.has(edge.id) && curveClearanceIssue(curve, label?.box) !== undefined,
			)
			.map(({ edge }) => edge.id),
	);
	const drawing = {
		...attempt.drawing,
		edges: attempt.drawing.edges.map(({ edge, curve, path }) => {
			const label = attempt.reservedBoxes.get(edge.id);
			return { edge, curve, path, ...(label === undefined ? {} : { label }) };
		}),
	};
	if (invalid.size === 0) {
		const anchors = projectLabelChannels(drawing, problem.measured.labels, new Set(forced.keys()));
		return improveLabelChannels(problem, reserved, forced, attempt, anchors);
	}
	const anchors = alignLabelRows(drawing, problem.measured.labels, invalid);
	const changed = [...anchors].filter(([id, box]) => {
		const previous = attempt.reservedBoxes.get(id)!.box;
		return Math.hypot(previous.x - box.x, previous.y - box.y) > 0.000001;
	});
	return changed.length === 0
		? attempt
		: drawAttempt(problem, reserved, new Map([...forced, ...changed]));
}

/**
 * Try one whole-set waypoint proposal, retaining the complete current reading on refusal.
 * @param problem Measured scene.
 * @param reserved Current placement reservations.
 * @param forced Current native waypoints.
 * @param attempt Complete baseline.
 * @param anchors Proposed joint channel coordinates.
 * @returns The accepted complete reading.
 */
async function improveLabelChannels(
	problem: Reading,
	reserved: ReadonlySet<string>,
	forced: ReadonlyMap<string, LabelAnchor | undefined>,
	attempt: LabelAttempt,
	anchors: ReadonlyMap<string, LabelAnchor>,
): Promise<LabelAttempt> {
	if (anchors.size === 0) return attempt;
	return improveProjection(attempt, () =>
		drawAttempt(problem, reserved, new Map([...forced, ...anchors])),
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
	problem: Reading,
	reserved: ReadonlySet<string>,
	forced: ReadonlyMap<string, LabelAnchor | undefined>,
): Promise<
	LabelAttempt & { readonly reservedBoxes: ReadonlyMap<string, NonNullable<DrawingEdge["label"]>> }
> {
	const { content, measured } = problem;
	const laidOut = await solve(problem, forceLabels(await problem.place(reserved), forced), {
		...solveOptions(problem),
		[SOLVE_STAGE]: "route",
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
	return { drawing, missing, unused, reservedBoxes: reservedLabels(laidOut, measured) };
}

/**
 * Ask the engine one solve of a reading that is still wanted.
 * @param problem The reading.
 * @param graph The engine input.
 * @param options The engine options.
 * @returns The solved graph.
 * @throws {Error} When the reading has been abandoned.
 */
async function solve(problem: Problem, graph: ElkNode, options: LayoutOptions): Promise<ElkNode> {
	if (problem.abandoned?.() === true) throw new Error("The reading is no longer wanted");
	return rendererHost().solve(graph, options);
}

/**
 * The options every solve of a reading is asked with.
 * @param problem The board and its column count.
 * @returns The engine options.
 */
function solveOptions(problem: Problem): LayoutOptions {
	return { ...COMPOUND_OPTIONS, "archboard.fold.columns": String(problem.columns) };
}

export { layoutCompound };
