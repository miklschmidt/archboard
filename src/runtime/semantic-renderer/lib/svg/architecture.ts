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
import {
	standingOutline,
	standingSwipe,
	subjectGroup,
	type StandingOf,
	type SubjectStanding,
} from "@/runtime/semantic-renderer/lib/svg/standing";
import {
	edgeAttributes,
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
 * @param routed The drawn route.
 * @param palette The theme's colours.
 * @param label Where its pill settled, when it has one.
 * @param standing How this relationship stands against the variant it came from, when the caller said.
 * @returns The edge's whole group.
 */
function paintEdge(
	routed: RoutedEdge,
	palette: Palette,
	label: Box | undefined,
	standing: SubjectStanding | undefined,
): string {
	const { edge, path } = routed;
	const styles = stylesFor(palette);
	const attributes = edgeAttributes(edge, palette);
	const width = strokeWidthOf(edge);

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
				"marker-end": markerFor(weightOf(edge), headOf(edge)),
				...attributes,
			}),
			label === undefined || edge.label === undefined
				? ""
				: paintLabelPill(edge.label, label, palette, standing),
		]),
	);
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

/** Every edge, drawn, with the boxes its labels took. */
interface EdgeLayer {
	/** Each edge's group, line and label together. */
	readonly markup: readonly string[];
	/** Each labelled edge's pill box, by edge id. */
	readonly labels: ReadonlyMap<string, Box>;
}

/**
 * Every edge, painted.
 * @param routed The drawn routes.
 * @param palette The theme's colours.
 * @param occupied Boxes a label pill must stay off.
 * @param standingOf How each subject stands against the variant this one came from.
 * @returns The groups and the pill boxes.
 */
function paintEdges(
	routed: readonly RoutedEdge[],
	palette: Palette,
	occupied: readonly Box[],
	standingOf: StandingOf,
): EdgeLayer {
	const labels = placeLabelPills(routed, occupied);
	const markup = routed.map((edge) =>
		paintEdge(edge, palette, labels.get(edge.edge.id), standingOf(edge.edge.id)),
	);
	return { markup, labels };
}

/**
 * One architecture, painted.
 * @param regions The bands, in the order they are drawn.
 * @param content The architecture.
 * @param palette The theme's colours.
 * @param standingOf How each subject stands against the variant this one came from.
 * @returns The page, its body and its atlas.
 */
function paintArchitecture(
	regions: readonly Region[],
	content: VariantContent,
	palette: Palette,
	standingOf: StandingOf,
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
			lines(cards.map((placed) => paintCard(placed, palette, standingOf(placed.node.id)))),
		),
		wrap(
			"g",
			{},
			lines(boxes.map((held) => paintContainerTitle(held, palette, standingOf(held.node.id)))),
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
