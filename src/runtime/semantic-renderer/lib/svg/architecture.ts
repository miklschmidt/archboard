// Painting one architecture: bands, then lines, then cards, then the words on
// the lines.
//
// Forked from PR Lens's `svg/architecture.ts`. The layer order is upstream's
// and is load-bearing: a line passes behind a card, and a label pill — which is
// opaque precisely so that it can be read wherever it lands — passes in front
// of one.

import type { VariantContent } from "@/shared/semantic-board/index";
import { DIAGRAM_MARGIN, PILL_RADIUS } from "@/runtime/semantic-renderer/lib/design";
import {
	canvasFor,
	coord,
	inflate,
	union,
	type Box,
} from "@/runtime/semantic-renderer/lib/geometry";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import type { DiagramAtlas } from "@/shared/semantic-board/index";
import { atlasBoxes } from "@/runtime/semantic-renderer/lib/atlas";
import type { Region } from "@/runtime/semantic-renderer/lib/regions";
import { relieveCongestion } from "@/runtime/semantic-renderer/lib/layout/congestion";
import { curveBounds } from "@/runtime/semantic-renderer/lib/layout/curves";
import type { RoutedEdge } from "@/runtime/semantic-renderer/lib/layout/edges";
import { placeLabelPills } from "@/runtime/semantic-renderer/lib/layout/labels";
import { headerTextBox } from "@/runtime/semantic-renderer/lib/layout/containers";
import {
	paintCard,
	paintContainerBox,
	paintContainerTitle,
} from "@/runtime/semantic-renderer/lib/svg/cards";
import { shifted } from "@/runtime/semantic-renderer/lib/svg/document";
import { lines, tag, textNode, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
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

/** How much wider than its line an edge's selection halo is. */
const EDGE_HALO_EXTRA = 5;
/** Where a pill's text baseline sits inside it. */
const PILL_BASELINE = 0.68;

/**
 * One label pill.
 * @param text What the connection carries.
 * @param box Where the pill goes.
 * @param palette The theme's colours.
 * @param standing How the relationship stands, when the caller said.
 * @returns The pill's markup.
 */
function paintLabelPill(
	text: string,
	box: Box,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const styles = stylesFor(palette);
	return wrap(
		"g",
		{},
		tag("rect", {
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
			rx: PILL_RADIUS,
			...styles.pill,
			...standingOutline(standing, palette),
		}) +
			textNode(
				{
					x: coord(box.x + box.width / 2),
					y: coord(box.y + box.height * PILL_BASELINE),
					"text-anchor": "middle",
					...styles.pillText,
				},
				text,
			),
	);
}

/**
 * One edge: a halo a viewer can light up, the line itself, and the words the
 * line carries.
 *
 * The label is part of the edge, not a separate thing that happens to sit near
 * it. It goes inside the same group, so a click on the words selects the
 * relationship and `.is-selected` lights the line and its label together. PR
 * Lens kept pills on their own layer above the cards; here they do not need to
 * be, because the label pass already treats every card as an obstacle, so a
 * pill never lands on one in the first place.
 *
 * A relationship is drawn as two groups on two layers, and both of them are the
 * relationship: this one carries its route, and `paintEdgeWords` carries the
 * words it says. They have to be separate layers because the words of one
 * relationship have to sit above the routes of ALL of them — a group that held
 * both would put every later edge's line and dots over every earlier edge's
 * pill wherever two routes cross, which is a hole in the middle of the one
 * thing on a relationship that is spelled out. Carrying the identity on both
 * groups is what keeps that free: a click on the words picks the relationship
 * out exactly as a click on its line does, and a viewer lighting a subject
 * lights every group that says it is that subject. The container grammar has
 * worked this way from the start, for the same reason — a frame and its title
 * are two groups and one subject.
 * @param routed The drawn route.
 * @param palette The theme's colours.
 * @param standing How this relationship stands against the variant it came from, when the caller said.
 * @returns The group holding its route.
 */
function paintEdgeLine(
	routed: RoutedEdge,
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
 * What one relationship says, on the layer above every route.
 *
 * The pill and the warning badge both belong here: they are the two things on a
 * relationship that have to stay readable whatever else the picture is doing,
 * and both were being crossed by lines and dots that had nothing to do with
 * them. Nothing at all when a relationship carries neither, so a board of
 * unlabelled arrows draws no empty groups.
 * @param routed The drawn route.
 * @param palette The theme's colours.
 * @param label Where its pill settled, when it has one.
 * @param standing How this relationship stands against the variant it came from, when the caller said.
 * @param unsettled Whether the board says nobody has decided this relationship yet.
 * @returns The group holding its words, or nothing to draw.
 */
function paintEdgeWords(
	routed: RoutedEdge,
	palette: Palette,
	label: Box | undefined,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	const { edge } = routed;
	const pill =
		label === undefined || edge.label === undefined
			? ""
			: paintLabelPill(edge.label, label, palette, standing);
	const badge = warningOnLine(warningAt(label, routed), unsettled, palette);
	if (pill === "" && badge === "") {
		return "";
	}
	return wrap("g", subjectGroup("edge", edge.id, standing), lines([pill, badge]));
}

/**
 * Where a relationship's warning goes.
 *
 * The left edge of its pill, straddling the border so it reads as a badge on
 * the words rather than a mark floating beside them; the point the label pass
 * chose when the relationship carries no words; and the middle of its route
 * when even that is missing, which is a route too short to have a straight run.
 * @param label Where its pill settled, when it has one.
 * @param routed The drawn route.
 * @returns The centre for the badge.
 */
function warningAt(label: Box | undefined, routed: RoutedEdge): { x: number; y: number } {
	if (label !== undefined) {
		return { x: label.x, y: label.y + label.height / 2 };
	}
	if (routed.labelAnchor !== undefined) {
		return routed.labelAnchor;
	}
	const bounds = curveBounds(routed.curve);
	return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** Everything a painted architecture is. */
interface ArchitecturePainting {
	/** The page width. */
	readonly width: number;
	/** The page height. */
	readonly height: number;
	/** The painted body, ready to wrap in a document. */
	readonly body: string;
	/** Where everything landed. */
	readonly atlas: DiagramAtlas;
}

/** Every edge, drawn as two layers, with the boxes its labels took. */
interface EdgeLayer {
	/** Each edge's route: its band, its halo, its line and its dots. */
	readonly markup: readonly string[];
	/** Each edge's words: its pill and its warning, for the layer above every route. */
	readonly words: readonly string[];
	/** Each labelled edge's pill box, by edge id. */
	readonly labels: ReadonlyMap<string, Box>;
}

/**
 * Every edge, painted.
 * @param routed The drawn routes.
 * @param palette The theme's colours.
 * @param occupied Boxes a label pill must stay off.
 * @param standingOf How each subject stands against the variant this one came from.
 * @param unsettledOf Whether the board says a subject is still undecided.
 * @returns The two layers and the pill boxes.
 */
function paintEdges(
	routed: readonly RoutedEdge[],
	palette: Palette,
	occupied: readonly Box[],
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
): EdgeLayer {
	const labels = placeLabelPills(routed, occupied);
	const markup = routed.map((edge) => paintEdgeLine(edge, palette, standingOf(edge.edge.id)));
	const words = routed.map((edge) =>
		paintEdgeWords(
			edge,
			palette,
			labels.get(edge.edge.id),
			standingOf(edge.edge.id),
			unsettledOf(edge.edge.id),
		),
	);
	return { markup, words, labels };
}

/**
 * One architecture, painted.
 * @param regions The bands, in the order they are drawn.
 * @param content The architecture.
 * @param palette The theme's colours.
 * @param standingOf How each subject stands against the variant this one came from.
 * @param unsettledOf Whether the board says a subject is still undecided.
 * @returns The page, its body and its atlas.
 */
function paintArchitecture(
	regions: readonly Region[],
	content: VariantContent,
	palette: Palette,
	standingOf: StandingOf,
	unsettledOf: UnsettledOf,
): ArchitecturePainting {
	const { layout, routed } = relieveCongestion(regions, content);
	const cards = layout.nodes.filter((placed) => placed.chrome === "card");
	// The ink a line puts on the page, not the centreline it was routed along: a
	// dead-straight run's bound has no thickness at all, and a pane asked to put
	// a rim around one would be given a rectangle it cannot draw.
	const inked = routed.map(({ edge, curve }) => ({
		id: edge.id,
		box: inflate(curveBounds(curve), strokeWidthOf(edge) / 2),
	}));
	const edges = paintEdges(
		routed,
		palette,
		[...cards.map(({ box }) => box), ...layout.containers.map(headerTextBox)],
		standingOf,
		unsettledOf,
	);

	// An edge is its line *and* its label: a pane told to focus a relationship
	// has to be shown the words it is meant to be reading. `atlasBoxes` grows a
	// box per id, so naming the edge twice is how the two are covered.
	const labelled = [...edges.labels].map(([id, box]) => ({ id, box }));

	const canvas = canvasFor(
		layout,
		union([
			...layout.containers.map(({ box }) => box),
			...cards.map(({ box }) => box),
			...labelled.map(({ box }) => box),
			...inked.map(({ box }) => box),
		]),
		DIAGRAM_MARGIN,
	);

	// Outermost box first, so a nested one is painted over the one holding it.
	// The containers arrive in that order already — a column's own box is
	// collected before the boxes inside it — and sorting by depth says so
	// rather than relying on it.
	const boxes = [...layout.containers].toSorted((a, b) => a.depth - b.depth);
	const painted = lines([
		wrap(
			"g",
			{},
			lines(boxes.map((held) => paintContainerBox(held, palette, standingOf(held.node.id)))),
		),
		wrap("g", {}, lines([...edges.markup])),
		wrap(
			"g",
			{},
			lines(
				cards.map((placed) =>
					paintCard(placed, palette, standingOf(placed.node.id), unsettledOf(placed.node.id)),
				),
			),
		),
		// Every relationship's words, over every relationship's route. Not inside
		// the edge groups, because two routes that cross would then decide by
		// document order whose words a reader gets to read; and after the cards,
		// which costs nothing because the label pass already treats every card as
		// an obstacle, so no pill was ever going to land on one.
		wrap("g", {}, lines([...edges.words])),
		wrap(
			"g",
			{},
			lines(
				boxes.map((held) =>
					paintContainerTitle(held, palette, standingOf(held.node.id), unsettledOf(held.node.id)),
				),
			),
		),
	]);

	// A node drawn as a box is that box: a pane sent to it should light up the
	// whole container, not the strip of title the router happens to sit beside.
	const framed = layout.containers.map(({ node, box }) => ({ id: node.id, box }));

	return {
		width: canvas.width,
		height: canvas.height,
		body: shifted(canvas, painted),
		atlas: {
			nodes: atlasBoxes(
				[...cards.map(({ node, box }) => ({ id: node.id, box })), ...framed],
				canvas,
			),
			edges: atlasBoxes([...inked, ...labelled], canvas),
			regions: atlasBoxes(framed, canvas),
		},
	};
}

export { type ArchitecturePainting, paintArchitecture };
