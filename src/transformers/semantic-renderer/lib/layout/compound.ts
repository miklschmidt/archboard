// One layout owner settles cards, frames, ports, routes and label boxes together.
// No subsequent paint or atlas pass is allowed to repair these coordinates.
import type { ElkExtendedEdge, ElkNode, LayoutOptions } from "@archboard/elk-rs";
import {
	chooseReading,
	type ColumnReading,
} from "@/transformers/semantic-renderer/lib/layout/column-readings";
import type { ChangeKind, VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	PaintedDrawing,
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { boxOf } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
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
import { checked } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { SOLVE_STAGE, rendererHost } from "@/transformers/semantic-renderer/lib/host";
import { fittedPage } from "@/transformers/semantic-renderer/lib/layout/page-fit";
import { tidierSettlement } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import { clearerDrawing } from "@/transformers/semantic-renderer/lib/layout/label-clearance";
import { finished } from "@/transformers/semantic-renderer/lib/layout/finishing";
import { anchorClearance } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import {
	requestOptions,
	type RouteRequest,
} from "@/transformers/semantic-renderer/lib/layout/route-requests";

/** One measured architecture in the engine's solving frame. */
interface Problem {
	readonly content: VariantContent;
	readonly measured: MeasuredArchitecture;
	readonly standings?: Readonly<Record<string, ChangeKind>> | undefined;
	readonly columns: number;
	/** What its routes are asked for (route-requests.ts); nothing beyond the ordinary when absent. */
	readonly route?: RouteRequest;
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

/** A reading's settled drawing and the label reservations it was placed with. */
interface SettledReading {
	readonly reading: Reading;
	readonly drawing: ArchitectureDrawing;
	readonly reserved: ReadonlySet<string>;
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
	const shape = result.labels?.[0];
	if (label === undefined || shape === undefined) return {};
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
	const chosen = await chooseReading((columns) =>
		columnReading({ content, measured, standings, columns }),
	);
	// Lanes that fold into one row are exchanged first, so the routes the
	// drawing reports are the ones painted (junction marks read them); bridges
	// are then settled as part of the geometry a reader sees.
	const drawing = fittedPage(unfoldCrossings(chosen));
	return { ...drawing, bridged: bridgeCrossings(drawing, measured.lines) };
}

/**
 * One column count's reading, each of its placements solved once, so the page
 * that ranks it is the first placement settling it asks for.
 * @param problem Measured content and requested downward column count.
 * @returns Its unreserved page and its settlement.
 */
function columnReading(problem: Problem): ColumnReading {
	const reading: Reading = {
		...problem,
		place: rememberSolves((reserved) =>
			rendererHost().solve(graphForLabels(problem, reserved), {
				...solveOptions(problem),
				[SOLVE_STAGE]: "place",
			}),
		),
	};
	return {
		/**
		 * The page placed with no label reserved.
		 * @returns Its size.
		 */
		page: () => reading.place(new Set()).then(boxOf),
		/**
		 * The complete drawing: the tidier of plain and evened pins, each finished, with
		 * and without reserved labels' full clearance, whichever is clearer (label-clearance.ts).
		 * @returns The settled reading.
		 */
		settle: () =>
			clearerDrawing(finishedWith(reading, {}), finishedWith(reading, { labelClearance: true })),
	};
}

/**
 * A reading settled with plain and with evened pins, each finished, the tidier kept.
 * @param reading The reading.
 * @param route What else its routes are asked for.
 * @returns The finished drawing.
 */
function finishedWith(reading: Reading, route: RouteRequest): Promise<ArchitectureDrawing> {
	return tidierSettlement(
		settleReading(asking(reading, route)).then(finishedReading),
		settleReading(asking(reading, { ...route, evenPins: true })).then(finishedReading),
	).then(({ drawing }) => drawing);
}

/**
 * A settled reading finished clear of frame walls, of side exits between
 * stacked cards, of hooks into a card's side, of unrelated lines on one
 * stroke, of line ends beside a card's standing pin and of lone ports
 * crowding a corner (finishing.ts).
 * @param kept The settled reading.
 * @returns The finished drawing.
 */
function finishedReading(kept: SettledReading): Promise<{ drawing: ArchitectureDrawing }> {
	const reroute = rerouting(kept.reserved);
	return finished(
		kept,
		(reading, request) => reroute(asking(reading, request)),
		pinnedCards(kept.reading.standings),
	);
}

/**
 * The subjects of a comparison that wear a standing pin (compound-graph.ts).
 * @param standings How each subject stands, if the drawing is a comparison.
 * @returns Every subject marked anything but unchanged.
 */
function pinnedCards(standings: Problem["standings"]): ReadonlySet<string> {
	return new Set(
		Object.entries(standings ?? {}).flatMap(([id, standing]) =>
			standing === "unchanged" ? [] : [id],
		),
	);
}

/**
 * A reading whose routes are asked for more.
 * @param reading The reading.
 * @param more What else its routes are asked for.
 * @returns The same reading and placements, asking for both.
 */
function asking(reading: Reading, more: RouteRequest): Reading {
	return { ...reading, route: { ...reading.route, ...more } };
}

/**
 * Route a settled placement once more, with the reservations it settled with.
 * @param reserved Its reservations.
 * @returns Routes a reading of it, answering nothing when a label finds no box.
 */
function rerouting(
	reserved: ReadonlySet<string>,
): (reading: Reading) => Promise<Omit<SettledReading, "reserved"> | undefined> {
	return async (reading) => {
		const attempt = await attemptLabels(reading, reserved);
		return attempt.missing.length === 0
			? { reading, drawing: checked(attempt.drawing) }
			: undefined;
	};
}

/**
 * Settle labels independently for one candidate reading.
 * @param reading Measured content, requested downward column count and its placements.
 * @returns A complete candidate or a routing/label failure.
 */
async function settleReading(reading: Reading): Promise<SettledReading> {
	const settled = await settleLabels(
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
	return { reading, drawing: checked(settled.drawing), reserved: settled.reserved };
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
 * Ask a placed graph's forced labels to be routed through. The routing input
 * shares the placement's unchanged parts: the host copies a graph it solves
 * and never changes the caller's (host.ts), and a copy of the whole placement
 * for every route was a tenth of the renderer's own work (2026-09-27).
 * @param placed A placement of the reading, which stays as it is.
 * @param forced Labels that require a route through their reserved box.
 * @param route What its routes are asked for.
 * @returns The routing input.
 */
function forceLabels(
	placed: ElkNode,
	forced: ReadonlyMap<string, LabelAnchor | undefined>,
	route: RouteRequest = {},
): ElkNode {
	return {
		...placed,
		layoutOptions: { ...placed.layoutOptions, ...requestOptions(route) },
		edges: (placed.edges ?? []).map((edge) =>
			forced.has(edge.id)
				? {
						...edge,
						layoutOptions: {
							...edge.layoutOptions,
							"archboard.route-label": "true",
							...anchorOptions(forced.get(edge.id)),
						},
					}
				: edge,
		),
	};
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
	const anchors = anchorLabelsOnRuns(
		drawing,
		problem.measured.labels,
		eligible,
		anchorClearance(problem.route),
	);
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
		const anchors = projectLabelChannels(
			drawing,
			problem.measured.labels,
			new Set(forced.keys()),
			anchorClearance(problem.route),
		);
		return improveLabelChannels(problem, reserved, forced, attempt, anchors);
	}
	const anchors = alignLabelRows(
		drawing,
		problem.measured.labels,
		invalid,
		anchorClearance(problem.route),
	);
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
	const laidOut = await rendererHost().solve(
		forceLabels(await problem.place(reserved), forced, problem.route),
		{
			...solveOptions(problem),
			[SOLVE_STAGE]: "route",
		},
	);
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
 * The options every solve of a reading is asked with.
 * @param problem The board and its column count.
 * @returns The engine options.
 */
function solveOptions(problem: Problem): LayoutOptions {
	return { ...COMPOUND_OPTIONS, "archboard.fold.columns": String(problem.columns) };
}

export { layoutCompound };
