// Paint a complete drawing. Placement, wrapping and routing are already settled.
import type { DiagramAtlas } from "@/shared/semantic-board/index";
import type { ArchitectureDrawing, DrawingEdge } from "@/runtime/semantic-renderer/lib/drawing";
import { DIAGRAM_MARGIN, PILL_RADIUS } from "@/runtime/semantic-renderer/lib/design";
import { canvasFor, coord, inflate, union } from "@/runtime/semantic-renderer/lib/geometry";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { atlasBoxes } from "@/runtime/semantic-renderer/lib/atlas";
import { curveBounds, labelAnchorOf } from "@/runtime/semantic-renderer/lib/layout/curves";
import {
	paintMeasuredCard,
	paintMeasuredFrame,
	paintMeasuredHeader,
	paintTextRuns,
} from "@/runtime/semantic-renderer/lib/svg/measured-cards";
import { shifted } from "@/runtime/semantic-renderer/lib/svg/document";
import { lines, tag, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
import { travellingPulses } from "@/runtime/semantic-renderer/lib/svg/pulse";
import { HERO_PULSE_TRAVEL_MS, PULSE_TRAVEL_MS } from "@/shared/timing/timing";
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
	pulseCountOf,
	lineColour,
	headOf,
	markerFor,
	strokeWidthOf,
	stylesFor,
	weightOf,
} from "@/runtime/semantic-renderer/lib/svg/styles";

/** Width added to a connection's invisible selection halo. */
const EDGE_HALO_EXTRA = 5;

/**
 * Paint one final route and its traffic marks.
 * @param routed The supplied route.
 * @param palette The selected theme.
 * @param standing Its architectural change.
 * @returns The connection group.
 */
function paintEdgeLine(
	routed: DrawingEdge,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const { edge, path } = routed;
	const styles = stylesFor(palette);
	const width = strokeWidthOf(edge);
	// One ink for the line, the head it ends in and the dots that ride it.
	const ink = lineColour(palette, weightOf(edge), standing);

	return wrap(
		"g",
		subjectGroup("edge", edge.id, standing),
		lines([
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
				"marker-end": markerFor(weightOf(edge), headOf(edge), standing),
				...edgeAttributes(edge, palette, standing),
			}),
			// The dots over its own line, and under every relationship's words.
			// A relationship the proposal no longer has is drawn for context and
			// must not read as live traffic.
			standing === "removed"
				? ""
				: travellingPulses({
						path,
						colour: ink,
						count: pulseCountOf(edge),
						duration: (edge.emphasis === "hero" ? HERO_PULSE_TRAVEL_MS : PULSE_TRAVEL_MS) / 1000,
						lag: 0,
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
 * @returns The document body, bounds and matching atlas.
 */
function paintArchitecture(
	drawing: ArchitectureDrawing,
	palette: Palette,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
): ArchitecturePainting {
	const { cards, containers, edges } = drawing;
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
		...boxes.map((held) => paintMeasuredFrame(held, palette, standingOf(held.measured.node.id))),
		...edges.map((edge) => paintEdgeLine(edge, palette, standingOf(edge.edge.id))),
		...cards.map((card) =>
			paintMeasuredCard(
				card,
				palette,
				standingOf(card.measured.node.id),
				unsettledOf(card.measured.node.id),
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
