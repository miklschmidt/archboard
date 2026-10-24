import { paintRegion } from "#shared/rules/svg/parts/regions.ts";
import { nodeAppearances, lineAppearance } from "#shared/rules/render/semantic-appearance.ts";
import type { SemanticPolicy } from "@archboard/board/policy";
// Paint a complete drawing. Placement, wrapping and routing are already settled.
import type { DiagramAtlas } from "@archboard/board/render-reply";
import type { DrawingEdge, DrawingNode, PaintedDrawing } from "#shared/rules/render/drawing.ts";
import { DIAGRAM_MARGIN } from "#shared/constants/spacing.ts";
import { PILL_RADIUS, SLAB_RADIUS } from "#shared/constants/design.ts";
import { canvasFor, coord, inflate, union, type Box } from "#shared/rules/geometry.ts";
import type { Palette } from "#shared/rules/svg/page/theme.ts";
import { atlasBoxes } from "#shared/rules/render/atlas.ts";
import { farSizeFor } from "#shared/rules/text/measurement.ts";
import { curveBounds, labelAnchorOf } from "#shared/rules/layout/routes/curves.ts";
import {
	crossingCutouts,
	crossingMasks,
	labelCutouts,
	trunkCutouts,
} from "#shared/rules/svg/lines/crossings.ts";
import {
	paintMeasuredCard,
	paintMeasuredFrame,
	paintMeasuredHeader,
} from "#shared/rules/svg/parts/measured-cards.ts";
import { paintTextRuns } from "#shared/rules/svg/page/text-runs.ts";
import { labelLook } from "#shared/rules/svg/parts/appearance.ts";
import { colourId } from "#shared/rules/svg/page/colour.ts";
import { shifted } from "#shared/rules/svg/page/document.ts";
import { lines, tag, wrap } from "#shared/rules/svg/page/primitives.ts";
import { junctionMarks } from "#shared/rules/svg/lines/junctions.ts";
import { shadowUnder, slab, slabSeat, slabShadow } from "#shared/rules/svg/parts/slab.ts";
import { paintTraffic } from "#shared/rules/svg/lines/traffic.ts";
import {
	endsInPort,
	portInside,
	portPlan,
	portsOf,
	rideInto,
	type Port,
} from "#shared/rules/svg/parts/ports.ts";
import {
	PART_ATTRIBUTE,
	ghostOpacity,
	markedBox,
	standingPalette,
	standingSwipe,
	subjectGroup,
	warningOnLine,
	type StandingOf,
	type SubjectStanding,
	type UnsettledOf,
} from "#shared/rules/svg/parts/standing.ts";
import {
	HEAD_LENGTH,
	edgeAttributes,
	headWidths,
	quietened,
	relationshipInk,
	strokeWidthOf,
	stylesFor,
	weightOf,
	type Weight,
} from "#shared/rules/svg/page/styles.ts";

/** Width added to a connection's invisible selection halo. */
const EDGE_HALO_EXTRA = 5;

/**
 * The subject kind a drawn line is: a flow step drawn on the board, or a relationship.
 * @param step Whether the line is a flow step.
 * @returns The kind.
 */
function lineKind(step: boolean): "step" | "edge" {
	return step ? "step" : "edge";
}

/** An arrowhead's drawing: a square this many marker units wide, the line's end at `refX`. */
const MARKER_BOX = 10;

/** How thick the open head's arms are drawn, in marker units. */
const OPEN_ARM = 1.7;

/** Where each head form puts the line's end, and where its ink reaches back to, in marker units. */
const MARKER_FORM = {
	filled: { refX: 8, back: 0 },
	// The open head's arms end at x=2, and their round caps reach half their stroke further.
	open: { refX: 10, back: 2 - OPEN_ARM / 2 },
} as const;

/**
 * How far back from a route's end its arrowhead's ink reaches.
 * @param head The head form.
 * @param weight How loudly the line speaks, which sets how long its head is.
 * @returns The distance along the route, or 0 for a line with no head.
 */
function arrowheadReach(head: "filled" | "open" | "none", weight: Weight): number {
	if (head === "none") return 0;
	const form = MARKER_FORM[head];
	return ((form.refX - form.back) * HEAD_LENGTH[weight]) / MARKER_BOX;
}

/**
 * A head uses the line's ink and SVG's proportional stroke-width units.
 * @param id Marker identity scoped to this edge.
 * @param head Configured arrowhead form.
 * @param weight How loudly the line speaks, which sets how long its head is.
 * @param ink Resolved line ink.
 * @returns Marker definition or nothing for an absent head.
 */
function edgeMarker(
	id: string,
	head: "filled" | "open" | "none",
	weight: Weight,
	ink: string,
): string {
	if (head === "none") return "";
	const side = coord(headWidths(weight));
	return wrap(
		"defs",
		{},
		wrap(
			"marker",
			{
				id,
				viewBox: `0 0 ${MARKER_BOX} ${MARKER_BOX}`,
				refX: MARKER_FORM[head].refX,
				refY: MARKER_BOX / 2,
				markerWidth: side,
				markerHeight: side,
				orient: "auto-start-reverse",
			},
			head === "filled"
				? tag("path", { d: "M0,0 L10,5 L0,10 z", fill: ink })
				: tag("path", {
						d: "M2,1 L10,5 L2,9",
						fill: "none",
						stroke: ink,
						"stroke-width": OPEN_ARM,
						"stroke-linecap": "round",
						"stroke-linejoin": "round",
					}),
		),
	);
}

/**
 * Paint one final route and its traffic marks.
 * @param routed The supplied route.
 * @param palette The selected theme.
 * @param standing Its architectural change.
 * @param policy Current vault policy.
 * @param mask Optional narrow cutouts beneath higher connections.
 * @param step Whether this line is a flow step drawn on the board, not an authored relationship.
 * @param ports The ports its ends run into, cut through the feet of the cards it joins, and
 * whether it is the first line into each, which draws its well.
 * @returns The connection group.
 */
function paintEdgeLine(
	routed: DrawingEdge,
	palette: Palette,
	standing: SubjectStanding | undefined,
	policy: SemanticPolicy,
	mask: string | undefined,
	step: boolean,
	ports: readonly { readonly port: Port; readonly well: boolean }[],
): string {
	const { edge, path } = routed;
	const styles = stylesFor(palette);
	const width = strokeWidthOf(edge);
	// One colour for the line, the head it ends in and the pulses that ride it:
	// the line and its head drawn weaker, the pulses at full strength.
	const appearance = lineAppearance(edge.kind, policy, step);
	const attributes = edgeAttributes(edge, palette, standing, policy, appearance);
	const ink = String(attributes["stroke"]);
	const weight = weightOf(edge);
	// Inline panes share the document ID namespace. Equal IDs must always
	// define equal heads, even when the same subject has a different standing.
	const markerId = `edge-head-${appearance.arrowhead}-${weight}-${colourId(ink)}`;

	return wrap(
		"g",
		{
			...subjectGroup(lineKind(step), edge.id, standing),
			opacity: ghostOpacity(standing),
			mask: mask === undefined ? undefined : `url(#${mask})`,
			"data-type-name": appearance.name,
			"data-type-kind": edge.kind,
			"data-line-color": appearance.color ?? "neutral",
			"data-line-dash": appearance.dash,
			"data-arrowhead": appearance.arrowhead,
		},
		lines([
			edgeMarker(markerId, appearance.arrowhead, weight, ink),
			standingSwipe(path, width, standing, palette),
			tag("path", {
				class: "ab-halo",
				d: path,
				"stroke-width": width + EDGE_HALO_EXTRA,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				...styles.halo,
			}),
			tag("path", {
				d: path,
				"marker-end": appearance.arrowhead === "none" ? undefined : `url(#${markerId})`,
				...attributes,
			}),
			...ports.map(({ port, well }) => portInside(port, well, attributes, palette)),
		]),
	);
}

/**
 * Paint a supplied relationship label and warning above all connections.
 * @param routed Final route and label geometry.
 * @param palette The selected theme.
 * @param standing Its architectural change.
 * @param unsettled Whether this relationship needs reconciliation.
 * @param step Whether this line is a flow step drawn on the board.
 * @returns The words group, or nothing for an unlabelled settled connection.
 */
function paintEdgeWords(
	routed: DrawingEdge,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
	step: boolean,
): string {
	const { label, edge } = routed;
	const at =
		label === undefined
			? labelAnchorOf(routed.curve)
			: { x: label.box.x, y: label.box.y + label.box.height / 2 };
	const badge = warningOnLine(at, unsettled, palette);
	// A low tile like a chip, with a chip's short shadow: labels are many and sit on their lines.
	const pill =
		label === undefined
			? ""
			: lines([
					slabSeat(label.box, PILL_RADIUS),
					...chipsOf(label).map((chip) =>
						lines([
							// A removed label's ghost; a label's shadow lies under the lines (`labelShadow`).
							standing === "removed"
								? slabShadow(chip, PILL_RADIUS, "chip", palette, standing)
								: "",
							slab(chip, labelLook(palette), palette, standing),
						]),
					),
					paintTextRuns(label.measured.runs, label.box, standingPalette(palette, standing)),
				]);
	return pill === "" && badge === ""
		? ""
		: wrap(
				"g",
				{ ...subjectGroup(lineKind(step), edge.id, standing), [PART_ATTRIBUTE]: "label" },
				lines([pill, badge]),
			);
}

/**
 * The chips a label stands on, where the picture puts them: one for a label,
 * one for each relationship a joined line stacks (ADR 0052).
 * @param label The label's box and its measured chips.
 * @param label.box Where the label stands.
 * @param label.measured Its measured chips.
 * @returns Each chip's box.
 */
function chipsOf(label: NonNullable<DrawingEdge["label"]>): Box[] {
	const { box, measured } = label;
	return measured.chips.map(({ y, height }) => ({ ...box, y: box.y + y, height }));
}

/**
 * The shadow a relationship's label casts, under every line, so no line is
 * shadowed by a label, its own included. It lists its relationship, so a
 * viewer veils and lights it with the line.
 * @param routed The relationship's route and label.
 * @param palette The selected theme.
 * @param standing How it stands against the variant it is read against.
 * @returns The shadow's group, or nothing for a line with no label.
 */
function labelShadow(
	routed: DrawingEdge,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	return routed.label === undefined
		? ""
		: lines(
				chipsOf(routed.label).map((chip) =>
					shadowUnder(routed.edge.id, chip, PILL_RADIUS, "chip", palette, standing),
				),
			);
}

/**
 * Where each line's ink and each line's words reach.
 * @param edges The routes as painted.
 * @returns Each line's inked box, and each of its words' box, by relationship id.
 */
function lineBoxes(edges: readonly DrawingEdge[]): {
	inked: { id: string; box: Box }[];
	labelled: { id: string; box: Box }[];
} {
	return {
		inked: edges.map(({ edge, curve }) => ({
			id: edge.id,
			box: inflate(curveBounds(curve), strokeWidthOf(edge) / 2),
		})),
		labelled: edges.flatMap(({ edge, label }) =>
			label === undefined ? [] : [{ id: edge.id, box: label.box }],
		),
	};
}

/**
 * What the page must hold of a drawing: every card and frame with the marks on
 * its corners, every line's ink and words, and every region.
 * @param drawing The drawing.
 * @param standingOf How each subject stands against the variant it is read against.
 * @param unsettledOf Whether a subject needs reconciliation.
 * @returns The box covering it all.
 */
function extentOf(
	drawing: PaintedDrawing,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
): Box | undefined {
	const { inked, labelled } = lineBoxes(drawing.bridged.edges);
	const marked = [...drawing.cards, ...drawing.containers].map(({ measured, box }) =>
		markedBox(box, standingOf(measured.node.id), unsettledOf(measured.node.id)),
	);
	return union([
		...marked,
		...[...inked, ...labelled].map(({ box }) => box),
		...(drawing.regions ?? []).map(({ box }) => box),
	]);
}

/**
 * Paints one card that is not drawn as a card: a flowchart's decision diamond,
 * loop or terminal (ADR 0053). It has two parts, as a card does: the shadow it
 * casts, laid under every line and every card, and the shape itself.
 */
interface ShapePainter {
	readonly shadow: (card: DrawingNode, standing: SubjectStanding | undefined) => string;
	readonly paint: (
		card: DrawingNode,
		standing: SubjectStanding | undefined,
		unsettled: boolean,
	) => string;
}

/** The drawing a page is fitted to, and how its subjects stand for the marks it holds. */
interface HeldPage {
	readonly drawing: PaintedDrawing;
	readonly standingOf: StandingOf;
	/**
	 * The cards drawn as shapes of their own, by id: each casts its own shadow
	 * and is its own face, and none has a port. Absent on an architecture.
	 */
	readonly shapes?: ReadonlyMap<string, ShapePainter> | undefined;
	/** What subject every other card is: a part, or a flowchart's message step. */
	readonly cardKind?: "node" | "step" | undefined;
}

/** A painted drawing and the subject geometry a viewer interacts with. */
interface ArchitecturePainting {
	readonly width: number;
	readonly height: number;
	readonly body: string;
	readonly atlas: DiagramAtlas;
}

/**
 * Paint the final drawing and derive the interaction atlas from those same boxes.
 * @param drawing The layout engine's complete output.
 * @param palette The selected theme.
 * @param standingOf How each subject stands against the variant it is read against.
 * @param unsettledOf Whether a subject needs reconciliation.
 * @param vocabulary The vault's policy, and the level of the board drawn.
 * @param vocabulary.policy Current vault policy.
 * @param vocabulary.level The board's level, which places the boards its parts open.
 * @param derived Ids of the lines that are flow steps drawn on the board, not authored relationships.
 * @param page What the page holds: the whole layout and the marks the comparison would
 * draw, so a drawing that leaves out what its comparison would show keeps everything
 * else where it stands with them.
 * @returns The document body, bounds and matching atlas.
 */
function paintArchitecture(
	drawing: PaintedDrawing,
	palette: Palette,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
	vocabulary: { readonly policy: SemanticPolicy; readonly level: string | undefined },
	derived: ReadonlySet<string>,
	page: HeldPage,
): ArchitecturePainting {
	const { policy, level } = vocabulary;
	const { cards, containers } = drawing;
	const { edges, bridges } = drawing.bridged;
	const { definitions, masks } = crossingMasks(edges, [
		...crossingCutouts(edges, bridges),
		...trunkCutouts(edges),
		// A removed relationship's label is drawn see-through, as its line is.
		...labelCutouts(
			edges,
			edges.flatMap(({ edge, label }) =>
				label === undefined || standingOf(edge.id) !== "removed" ? [] : [label.box],
			),
		),
	]);
	// Where a line meets the foot of a card, it runs into a port cut through the
	// card's front edge; a removed card is a ghost and has no edge to cut.
	const ports = portsOf(
		cards,
		edges,
		(id) => standingOf(id) !== "removed" && page.shapes?.has(id) !== true,
	);
	const { wells, cuts } = portPlan(ports, edges);
	// Every node the page lays out, drawn or not, so leaving some out changes
	// no kept card's colour or whether it draws as a container.
	const appearances = nodeAppearances(
		[...page.drawing.cards, ...page.drawing.containers].map(({ measured }) => measured.node),
		policy,
		level,
	);
	const { inked, labelled } = lineBoxes(edges);
	// A relationship the proposal no longer has is drawn for context and carries
	// no traffic.
	const traffic = paintTraffic(
		edges.flatMap((routed) => {
			const { edge } = routed;
			if (edge.traffic === undefined || standingOf(edge.id) === "removed") return [];
			const width = strokeWidthOf(edge);
			const appearance = lineAppearance(edge.kind, policy, derived.has(edge.id));
			return [
				{
					routed,
					traffic: edge.traffic,
					// A pulse arriving in a head at a port rides on over the head into the hole.
					headReach: endsInPort(routed.curve, ports.byEdge.get(edge.id) ?? [])
						? 0
						: arrowheadReach(appearance.arrowhead, weightOf(edge)),
					into: rideInto(routed.curve, ports.byEdge.get(edge.id) ?? []),
					ink: quietened(
						relationshipInk(edge, palette, standingOf(edge.id), policy, appearance),
						palette,
						weightOf(edge),
					),
					lineWidth: width,
				},
			];
		}),
		new Map(cards.map(({ measured, box }) => [measured.node.id, box])),
		palette,
	);
	const framed = containers.map(({ measured, box }) => ({ id: measured.node.id, box }));
	const cardBoxes = cards.map(({ measured, box }) => ({ id: measured.node.id, box }));
	const canvas = canvasFor(
		page.drawing,
		extentOf(page.drawing, page.standingOf, unsettledOf),
		DIAGRAM_MARGIN,
	);
	const boxes = containers.toSorted(
		(a, b) => a.depth - b.depth || a.measured.node.order - b.measured.node.order,
	);
	const orderedCards = cards.toSorted((a, b) => a.measured.node.order - b.measured.node.order);
	// Group captions draw their names from far away at the largest size every card the page
	// holds, drawn or not, fits its name at, so leaving some out moves no name.
	const farSize = farSizeFor(
		page.drawing.cards.map(({ measured, box }) => ({ name: measured.node.name, box })),
	);
	const painted = lines([
		definitions,
		cuts.size === 0
			? ""
			: wrap("defs", {}, [...cuts.values()].map(({ markup }) => markup).join("")),
		...boxes.map((held) =>
			paintMeasuredFrame(
				held,
				palette,
				standingOf(held.measured.node.id),
				appearances.get(held.measured.node.id)!,
			),
		),
		// Group regions: over the frames that hold them, under every line that crosses them.
		...(drawing.regions ?? [])
			.toSorted((a, b) => a.depth - b.depth)
			.map((region) =>
				paintRegion(region, { palette, policy, farSize, routes: edges.map(({ curve }) => curve) }),
			),
		// The cards' and the labels' shadows, under every line and every card, so
		// no line is shadowed and no shadow lies on a card (TASK-435).
		...orderedCards.map((card) => {
			const { measured, box } = card;
			const shape = page.shapes?.get(measured.node.id);
			return shape === undefined
				? shadowUnder(
						measured.node.id,
						box,
						SLAB_RADIUS,
						"card",
						palette,
						standingOf(measured.node.id),
					)
				: shape.shadow(card, standingOf(measured.node.id));
		}),
		...edges.map((edge) => labelShadow(edge, palette, standingOf(edge.edge.id))),
		...edges.map((edge) =>
			paintEdgeLine(
				edge,
				palette,
				standingOf(edge.edge.id),
				policy,
				masks.get(edge.edge.id),
				derived.has(edge.edge.id),
				(ports.byEdge.get(edge.edge.id) ?? []).map((port) => ({
					port,
					well: wells.get(port) === edge.edge.id,
				})),
			),
		),
		// Over the lines they join, under the cards and every relationship's words.
		// A relationship the proposal no longer has is drawn for context and joins nothing.
		junctionMarks(
			drawing.edges.filter(({ edge }) => standingOf(edge.id) !== "removed"),
			({ edge }) => ({
				ink: String(
					edgeAttributes(
						edge,
						palette,
						standingOf(edge.id),
						policy,
						lineAppearance(edge.kind, policy, derived.has(edge.id)),
					)["stroke"],
				),
				width: strokeWidthOf(edge),
			}),
		),
		// Every relationship's traffic, over all the lines so a stretch two joined
		// lines share never covers the other's pulses, and under the cards and words.
		...edges.map((edge) => traffic.get(edge.edge.id) ?? ""),
		...orderedCards.map((card) => {
			const id = card.measured.node.id;
			const shape = page.shapes?.get(id);
			return shape === undefined
				? paintMeasuredCard(
						card,
						palette,
						standingOf(id),
						unsettledOf(id),
						appearances.get(id)!,
						cuts.get(id),
						page.cardKind,
					)
				: shape.paint(card, standingOf(id), unsettledOf(id));
		}),
		...edges.map((edge) =>
			paintEdgeWords(
				edge,
				palette,
				standingOf(edge.edge.id),
				unsettledOf(edge.edge.id),
				derived.has(edge.edge.id),
			),
		),
		...boxes.map((held) =>
			paintMeasuredHeader(
				held,
				palette,
				standingOf(held.measured.node.id),
				unsettledOf(held.measured.node.id),
				appearances.get(held.measured.node.id)!,
			),
		),
	]);
	return {
		width: canvas.width,
		height: canvas.height,
		body: shifted(canvas, painted),
		atlas: {
			nodes: atlasBoxes([...cardBoxes, ...framed], canvas),
			edges: atlasBoxes([...inked, ...labelled], canvas),
			regions: atlasBoxes(framed, canvas),
		},
	};
}

export { type ArchitecturePainting, type ShapePainter, paintArchitecture };
