import {
	nodeAppearances,
	relationshipAppearance,
} from "@/runtime/semantic-renderer/lib/semantic-appearance";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
// Paint a complete drawing. Placement, wrapping and routing are already settled.
import type { DiagramAtlas } from "@/shared/semantic-board/index";
import type { ArchitectureDrawing, DrawingEdge } from "@/runtime/semantic-renderer/lib/drawing";
import { DIAGRAM_MARGIN, PILL_RADIUS } from "@/runtime/semantic-renderer/lib/design";
import { canvasFor, coord, inflate, union } from "@/runtime/semantic-renderer/lib/geometry";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { atlasBoxes } from "@/runtime/semantic-renderer/lib/atlas";
import { curveBounds, labelAnchorOf } from "@/runtime/semantic-renderer/lib/layout/curves";
import { bridgeCrossings } from "@/runtime/semantic-renderer/lib/layout/crossings";
import { crossingMasks } from "@/runtime/semantic-renderer/lib/svg/crossings";
import {
	paintMeasuredCard,
	paintMeasuredFrame,
	paintMeasuredHeader,
	paintTextRuns,
} from "@/runtime/semantic-renderer/lib/svg/measured-cards";
import { shifted } from "@/runtime/semantic-renderer/lib/svg/document";
import { lines, tag, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
import { travellingPulses } from "@/runtime/semantic-renderer/lib/svg/pulse";
import {
	standingOutline,
	standingSwipe,
	subjectGroup,
	warningOnLine,
	type StandingOf,
	type SubjectStanding,
	type UnsettledOf,
} from "@/runtime/semantic-renderer/lib/svg/standing";
import {
	edgeAttributes,
	strokeWidthOf,
	stylesFor,
} from "@/runtime/semantic-renderer/lib/svg/styles";

/** Width added to a connection's invisible selection halo. */
const EDGE_HALO_EXTRA = 5;

/**
 * A head uses the line's ink and SVG's proportional stroke-width units.
 * @param id Marker identity scoped to this edge.
 * @param head Configured arrowhead form.
 * @param ink Resolved line ink.
 * @returns Marker definition or nothing for an absent head.
 */
function edgeMarker(id: string, head: "filled" | "open" | "none", ink: string): string {
	if (head === "none") return "";
	return wrap(
		"defs",
		{},
		wrap(
			"marker",
			{
				id,
				viewBox: "0 0 10 10",
				refX: head === "filled" ? 8 : 10,
				refY: 5,
				markerWidth: 5,
				markerHeight: 5,
				orient: "auto-start-reverse",
			},
			head === "filled"
				? tag("path", { d: "M0,0 L10,5 L0,10 z", fill: ink })
				: tag("path", {
						d: "M2,1 L10,5 L2,9",
						fill: "none",
						stroke: ink,
						"stroke-width": 1.7,
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
 * @returns The connection group.
 */
function paintEdgeLine(
	routed: DrawingEdge,
	palette: Palette,
	standing: SubjectStanding | undefined,
	policy: SemanticPolicy,
	mask: string | undefined,
): string {
	const { edge, path } = routed;
	const styles = stylesFor(palette);
	const width = strokeWidthOf(edge);
	// One ink for the line, the head it ends in and the dots that ride it.
	const appearance = relationshipAppearance(edge.kind, policy);
	const attributes = edgeAttributes(edge, palette, standing, policy);
	const ink = String(attributes["stroke"]);
	// Inline panes share the document ID namespace. Equal IDs must always
	// define equal heads, even when the same subject has a different standing.
	const markerId = `edge-head-${appearance.arrowhead}-${ink.slice(1)}`;

	return wrap(
		"g",
		{
			...subjectGroup("edge", edge.id, standing),
			mask: mask === undefined ? undefined : `url(#${mask})`,
			"data-type-name": appearance.name,
			"data-type-kind": edge.kind,
			"data-line-color": appearance.color ?? "neutral",
			"data-line-dash": appearance.dash,
			"data-arrowhead": appearance.arrowhead,
			"data-emphasis": edge.emphasis,
		},
		lines([
			edgeMarker(markerId, appearance.arrowhead, ink),
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
			// The dots over its own line, and under every relationship's words.
			// A relationship the proposal no longer has is drawn for context and
			// must not read as live traffic.
			standing === "removed" || edge.traffic === undefined
				? ""
				: travellingPulses({
						path,
						colour: ink,
						traffic: edge.traffic,
					}),
		]),
	);
}

/**
 * Paint a supplied relationship label and warning above all connections.
 * @param routed Final route and label geometry.
 * @param palette The selected theme.
 * @param standing Its architectural change.
 * @param unsettled Whether this relationship needs reconciliation.
 * @returns The words group, or nothing for an unlabelled settled connection.
 */
function paintEdgeWords(
	routed: DrawingEdge,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	const { label, edge } = routed;
	const styles = stylesFor(palette);
	const at =
		label === undefined
			? labelAnchorOf(routed.curve)
			: { x: label.box.x, y: label.box.y + label.box.height / 2 };
	const badge = warningOnLine(at, unsettled, palette);
	const pill =
		label === undefined
			? ""
			: lines([
					tag("rect", {
						x: coord(label.box.x),
						y: coord(label.box.y),
						width: coord(label.box.width),
						height: coord(label.box.height),
						rx: PILL_RADIUS,
						...styles.pill,
						...standingOutline(standing, palette),
					}),
					paintTextRuns(label.measured.runs, label.box, palette),
				]);
	return pill === "" && badge === ""
		? ""
		: wrap("g", subjectGroup("edge", edge.id, standing), lines([pill, badge]));
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
 * @param drawing The compound layout owner's complete output.
 * @param palette The selected theme.
 * @param standingOf How each subject changed against its predecessor.
 * @param unsettledOf Whether a subject needs reconciliation.
 * @param policy Current vault policy.
 * @returns The document body, bounds and matching atlas.
 */
function paintArchitecture(
	drawing: ArchitectureDrawing,
	palette: Palette,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
	policy: SemanticPolicy,
): ArchitecturePainting {
	const { cards, containers } = drawing;
	const { edges, bridges } = bridgeCrossings(drawing);
	const { definitions, masks } = crossingMasks(edges, bridges);
	const appearances = nodeAppearances(
		[...cards, ...containers].map(({ measured }) => measured.node),
		policy,
	);
	const inked = edges.map(({ edge, curve }) => ({
		id: edge.id,
		box: inflate(curveBounds(curve), strokeWidthOf(edge) / 2),
	}));
	const labelled = edges.flatMap(({ edge, label }) =>
		label === undefined ? [] : [{ id: edge.id, box: label.box }],
	);
	const framed = containers.map(({ measured, box }) => ({ id: measured.node.id, box }));
	const cardBoxes = cards.map(({ measured, box }) => ({ id: measured.node.id, box }));
	const canvas = canvasFor(
		drawing,
		union([...cardBoxes, ...framed, ...inked, ...labelled].map(({ box }) => box)),
		DIAGRAM_MARGIN,
	);
	const boxes = containers.toSorted((a, b) => a.depth - b.depth);
	const painted = lines([
		definitions,
		...boxes.map((held) =>
			paintMeasuredFrame(
				held,
				palette,
				standingOf(held.measured.node.id),
				appearances.get(held.measured.node.id)!,
			),
		),
		...edges.map((edge) =>
			paintEdgeLine(edge, palette, standingOf(edge.edge.id), policy, masks.get(edge.edge.id)),
		),
		...cards.map((card) =>
			paintMeasuredCard(
				card,
				palette,
				standingOf(card.measured.node.id),
				unsettledOf(card.measured.node.id),
				appearances.get(card.measured.node.id)!,
			),
		),
		...edges.map((edge) =>
			paintEdgeWords(edge, palette, standingOf(edge.edge.id), unsettledOf(edge.edge.id)),
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

export { type ArchitecturePainting, paintArchitecture };
