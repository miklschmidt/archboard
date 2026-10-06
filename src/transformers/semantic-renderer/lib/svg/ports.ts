// Ports: where a line meets the foot of a card, it goes into a slot cut through
// the card's front edge (TASK-424).
//
// The slot is a hole, not a mark drawn on the edge. The card's body and its
// shadow are clipped round it (`portCut`), so what lies under the card shows
// through: the line's own group draws, under the card, the inside of the port
// and the end of the line running into it (`portInside`). So the end of the line
// takes whatever a viewer does to the line, its veil and its light, as the
// rest of it does. Lit from above, the floor of the slot by its sill catches the
// light and its inside darkens from the rim into its depth. The card draws the
// depth the line fades into over the slot (`portFront`), over the traffic too,
// so a pulse that reaches the card goes into the dark with its line.
//
// A port is drawn near only: from far away a card is its name, and the slot is
// closed in the card's front edge. Its shapes are rects and a line, so a viewer
// that carries a line from one picture to the next leaves them out of the
// line's paths. The atlas, the routes and the layout know nothing of it.

import { CARD_THICKNESS, SLAB_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { DrawingEdge, DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { contentId } from "@/transformers/semantic-renderer/lib/svg/crossings";
import { NEAR_CLASS, farLayer, nearLayer } from "@/transformers/semantic-renderer/lib/svg/far-view";
import {
	lines,
	tag,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import { strokeWidthOf } from "@/transformers/semantic-renderer/lib/svg/styles";

/** The class every port's inside carries, so a reader of the picture can find it. */
const PORT_CLASS = "ab-port";

/**
 * How much room a slot keeps either side of its line; how much of the front
 * edge stays above it (its lid) and below it (its sill); the least of the edge
 * left standing between two slots; and how deep the lit floor of the slot
 * shows past its sill.
 */
const SOCKET = 2.1;
const LID = 0.6;
const SILL = 0.7;
const WEB = 1.5;
const FLOOR = 0.5;

/**
 * How near a slot's end may come to a side of its card: the card's corners are
 * rounded, and a slot this far in still has its sill under it, so it stays
 * inside the rounded corner and narrows as it nears it.
 */
const CORNER_ROOM = SLAB_RADIUS - 2.75;

/** The gradients a port's inside is drawn in: its well, and the depth its line fades into. */
const WELL_ID = "ab-port-well";
const FADE_ID = "ab-port-fade";

/** One slot, cut through a card's front edge where a line meets its foot. */
interface Port {
	/** Where the line meets the foot: the slot's centre. */
	readonly x: number;
	/** The card's foot, where the line ends. */
	readonly foot: number;
	/** Half the slot's length. */
	readonly half: number;
}

/** The ports of a drawing: each card's slots, and each line's. */
interface Ports {
	readonly byCard: ReadonlyMap<string, readonly Port[]>;
	readonly byEdge: ReadonlyMap<string, readonly Port[]>;
}

/** Where one line meets the foot of one card. */
interface Meeting {
	readonly card: string;
	readonly edge: string;
	readonly x: number;
	readonly line: number;
}

/**
 * Where a line's ends meet the feet of the cards it joins: each end that lies
 * on the bottom edge of its card's box, inside it.
 * @param routed The line.
 * @param boxes Every card's box, by id.
 * @returns The meetings.
 */
function meetingsOf(routed: DrawingEdge, boxes: ReadonlyMap<string, Box>): Meeting[] {
	const { edge, curve } = routed;
	const end = curve.segments.at(-1)?.to ?? curve.from;
	return [
		{ card: edge.from, point: curve.from },
		{ card: edge.to, point: end },
	].flatMap(({ card, point }) => {
		const box = boxes.get(card);
		if (box === undefined) return [];
		const foot = box.y + box.height;
		const inside = point.x > box.x && point.x < box.x + box.width;
		return Math.abs(point.y - foot) < 0.5 && inside
			? [{ card, edge: edge.id, x: point.x, line: strokeWidthOf(edge) }]
			: [];
	});
}

/**
 * Half the length of the slot at one place on a card's foot: room for its line
 * and the socket either side, no nearer the card's sides than its rounded
 * corners allow, and leaving the edge standing between it and the slots beside
 * it. No slot where that leaves too little room round the line.
 * @param box The card's box.
 * @param x Where the line meets the foot.
 * @param line How thick the line is.
 * @param neighbours Where the other lines meet the same foot.
 * @returns Half the slot's length, or undefined for none.
 */
function halfAt(
	box: Box,
	x: number,
	line: number,
	neighbours: readonly number[],
): number | undefined {
	const apart = neighbours.map((other) => (Math.abs(other - x) - WEB) / 2);
	const half = Math.min(
		line / 2 + SOCKET,
		x - box.x - CORNER_ROOM,
		box.x + box.width - CORNER_ROOM - x,
		...apart,
	);
	return half >= line / 2 + 0.5 ? half : undefined;
}

/**
 * Every port of a drawing: where a line meets the foot of a card that is drawn
 * whole. Two lines meeting a foot at one place share one slot.
 * @param cards The cards.
 * @param edges The lines.
 * @param drawnWhole Whether a card is drawn whole: a removed card is a ghost, and has no edge to cut.
 * @returns The ports, by card and by line.
 */
function portsOf(
	cards: readonly DrawingNode[],
	edges: readonly DrawingEdge[],
	drawnWhole: (id: string) => boolean,
): Ports {
	const boxes = new Map(
		cards
			.filter(({ measured }) => drawnWhole(measured.node.id))
			.map(({ measured, box }) => [measured.node.id, box]),
	);
	const meetings = edges.flatMap((routed) => meetingsOf(routed, boxes));
	const byCard = new Map<string, Port[]>();
	const byEdge = new Map<string, Port[]>();
	for (const [card, box] of boxes) {
		for (const { port, edges: through } of footPorts(
			box,
			meetings.filter((meeting) => meeting.card === card),
		)) {
			byCard.set(card, [...(byCard.get(card) ?? []), port]);
			for (const edge of through) byEdge.set(edge, [...(byEdge.get(edge) ?? []), port]);
		}
	}
	return { byCard, byEdge };
}

/**
 * The slots along one card's foot, one for each place a line meets it, and the
 * lines that run into each.
 * @param box The card's box.
 * @param here Where the lines meet its foot.
 * @returns Its slots.
 */
function footPorts(
	box: Box,
	here: readonly Meeting[],
): { readonly port: Port; readonly edges: readonly string[] }[] {
	const places = [...new Set(here.map(({ x }) => x))];
	return places.flatMap((x) => {
		const at = here.filter((one) => one.x === x);
		const line = Math.max(...at.map((one) => one.line));
		const half = halfAt(
			box,
			x,
			line,
			places.filter((other) => other !== x),
		);
		return half === undefined
			? []
			: [{ port: { x, foot: box.y + box.height, half }, edges: at.map(({ edge }) => edge) }];
	});
}

/**
 * A slot's box: through the front edge, under its lid and over its sill.
 * @param port The slot.
 * @returns Its box.
 */
function slotOf(port: Port): Box {
	const top = port.foot - CARD_THICKNESS + LID;
	return { x: port.x - port.half, y: top, width: 2 * port.half, height: port.foot - SILL - top };
}

/**
 * A slot's outline, its ends round: a path, so a viewer that carries a line
 * from one picture to the next never reads it as the line's label.
 * @param slot The slot.
 * @returns The outline.
 */
function outlineOf(slot: Box): string {
	const { x, y, width, height } = slot;
	const round = height / 2;
	const arc = `A${coord(round)},${coord(round)} 0 0 1`;
	return (
		`M${coord(x + round)},${coord(y)}H${coord(x + width - round)}` +
		`${arc} ${coord(x + width - round)},${coord(y + height)}` +
		`H${coord(x + round)}${arc} ${coord(x + round)},${coord(y)}Z`
	);
}

/**
 * A slot filled, its ends round.
 * @param slot The slot.
 * @param fill How it is filled.
 * @returns The path.
 */
function outlined(slot: Box, fill: string): string {
	return tag("path", { d: outlineOf(slot), fill, "pointer-events": "none" });
}

/**
 * The lit floor of a slot, seen past its sill: a crescent along the slot's
 * rounded bottom, as deep as the floor shows at the middle and nothing at the
 * ends, where the slot's sides turn up.
 * @param slot The slot.
 * @returns The crescent's outline.
 */
function floorOf(slot: Box): string {
	const { x, y, width, height } = slot;
	const round = height / 2;
	const [left, right, middle, foot] = [x, x + width, y + round, y + height];
	const arc = `A${coord(round)},${coord(round)} 0 0`;
	return (
		`M${coord(left)},${coord(middle)}${arc} 0 ${coord(left + round)},${coord(foot)}` +
		`H${coord(right - round)}${arc} 0 ${coord(right)},${coord(middle)}` +
		`${arc} 1 ${coord(right - round)},${coord(foot - FLOOR)}` +
		`H${coord(left + round)}${arc} 1 ${coord(left)},${coord(middle)}Z`
	);
}

/**
 * The inside of a port, drawn in its line's group under the card: the well,
 * from its rim into its depth; its floor by the sill, lit; and the end of the
 * line, running up from the card's foot into it. Drawn near only.
 * @param port The slot.
 * @param stroke How the line is stroked.
 * @param palette The theme's colours.
 * @returns Its markup.
 */
function portInside(port: Port, stroke: Attributes, palette: Palette): string {
	const slot = slotOf(port);
	// Near only, as a card's own near layer is.
	return wrap(
		"g",
		{ class: `${NEAR_CLASS} ${PORT_CLASS}` },
		lines([
			outlined(slot, `url(#${WELL_ID})`),
			tag("path", { d: floorOf(slot), fill: palette.trayLip, "pointer-events": "none" }),
			tag("line", {
				x1: coord(port.x),
				y1: coord(port.foot),
				x2: coord(port.x),
				y2: coord(slot.y),
				"pointer-events": "none",
				...stroke,
			}),
		]),
	);
}

/**
 * Where a card is cut for its ports: everything but its slots, as a clip its
 * body and its shadow are drawn through. Its id is its outline's, so two panes
 * drawn inline in one document share a clip only when they cut alike.
 * @param ports The card's slots.
 * @returns The clip's id and its definition, or nothing for a card with no port.
 */
function portCut(ports: readonly Port[] | undefined): { id: string; markup: string } | undefined {
	if (ports === undefined || ports.length === 0) return undefined;
	const far = 100_000;
	const outline = tag("path", {
		d: [
			`M${-far},${-far}H${far}V${far}H${-far}Z`,
			...ports.map((port) => outlineOf(slotOf(port))),
		].join(""),
		"clip-rule": "evenodd",
	});
	const id = `ab-port-${contentId(outline)}`;
	return { id, markup: wrap("clipPath", { id, clipPathUnits: "userSpaceOnUse" }, outline) };
}

/**
 * What a card draws over its slots: near, the depth each line fades into, from
 * the top of the slot down to nothing above its floor; far, where the picture
 * shows no port, each slot closed in the card's front edge.
 * @param ports The card's slots.
 * @param edge The card's front edge.
 * @returns Its near and far layers, or nothing for a card with no port.
 */
function portFront(ports: readonly Port[] | undefined, edge: string): string {
	if (ports === undefined || ports.length === 0) return "";
	const slots = ports.map(slotOf);
	return (
		nearLayer(lines(slots.map((slot) => outlined(slot, `url(#${FADE_ID})`)))) +
		farLayer(lines(slots.map((slot) => outlined(slot, edge))))
	);
}

/**
 * The gradients every port is drawn in, in each port's own box: its well, its
 * rim lighter than its depth and its depth high in it, under the top of the
 * slot in shade; and the depth its line fades into, from the top of the slot to
 * nothing above its floor.
 * @param palette The theme's colours.
 * @returns The gradients.
 */
function portDefinitions(palette: Palette): string {
	return (
		wrap(
			"radialGradient",
			{ id: WELL_ID, cx: 0.5, cy: 0.3, r: 0.62 },
			tag("stop", { offset: 0, "stop-color": palette.portDeep }) +
				tag("stop", { offset: 0.45, "stop-color": palette.portDeep }) +
				tag("stop", { offset: 1, "stop-color": palette.portWall }),
		) +
		wrap(
			"linearGradient",
			{ id: FADE_ID, x1: 0, y1: 0, x2: 0, y2: 1 },
			tag("stop", { offset: 0, "stop-color": palette.portDeep }) +
				tag("stop", { offset: 0.45, "stop-color": palette.portDeep, "stop-opacity": 0.8 }) +
				tag("stop", { offset: 0.85, "stop-color": palette.portDeep, "stop-opacity": 0 }),
		)
	);
}

export {
	type Port,
	type Ports,
	PORT_CLASS,
	portCut,
	portDefinitions,
	portFront,
	portInside,
	portsOf,
};
