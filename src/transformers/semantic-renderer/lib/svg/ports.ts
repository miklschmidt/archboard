// Ports: where a line meets the foot of a card, it goes into a slot cut through
// the card's front edge (TASK-424).
//
// The slot is a hole, not a mark drawn on the edge. The card's body is
// clipped round it (`portCut`), and round a notch through the sill below it as
// wide as the line, so what lies under the card shows through: the line's own
// group draws, under the card, the inside of the port and the end of the line
// running up into it (`portInside`). So the line comes out of the hole over its
// sill, at its own width, and takes whatever a viewer does to the line, its
// veil and its light, as the rest of it does. Lit from above, the floor of the
// slot catches the light and its inside darkens from the rim into its depth;
// the line runs over the floor and fades into the depth. A pulse rides on into
// the hole (`rideInto`), over all of it, past an arrowhead too, and goes under
// the lid with its line.
//
// A port is drawn near and far alike: from far away a card is still a card,
// with the same front edge, so the same hole is cut in it. It belongs to
// neither view's layer, so the swap between them neither moves nor fades it.
// The clip is in the card's own box (`objectBoundingBox`), so a viewer that
// carries the card from one picture to the next carries its holes with it. Its
// shapes are paths and a line, so a viewer that carries a line leaves them out
// of the line's paths. The atlas, the routes and the layout know nothing of it.

import { CARD_THICKNESS, SLAB_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { Curve, Segment } from "@/transformers/semantic-renderer/lib/layout/curves";
import type { DrawingEdge, DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { contentId } from "@/transformers/semantic-renderer/lib/svg/crossings";
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

/**
 * How far past the foot a pulse rides into a port: to the lid, and the air a
 * pulse keeps from the end of what it rides, so it goes under the lid and
 * nothing of it reaches past the lid onto the card, whether the card is seen
 * through or the line is drawn over it.
 */
const RIDE_IN = CARD_THICKNESS - LID + 1;

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
	/** How thick its line is, and the notch it comes out of the hole through. */
	readonly line: number;
}

/** The ports of a drawing: each card's slots, and each line's. */
interface Ports {
	readonly byCard: ReadonlyMap<string, readonly Port[]>;
	readonly byEdge: ReadonlyMap<string, readonly Port[]>;
	/** The box of every card drawn whole, by id. */
	readonly boxes: ReadonlyMap<string, Box>;
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
 * Every port of a drawing: where a line drawn whole meets the foot of a card
 * drawn whole. Two lines meeting a foot at one place share one slot.
 * @param cards The cards.
 * @param edges The lines.
 * @param drawnWhole Whether a part is drawn whole: a removed card is a ghost with no edge
 * to cut, and a removed line is drawn for context and runs into no port.
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
	const meetings = edges
		.filter(({ edge }) => drawnWhole(edge.id))
		.flatMap((routed) => meetingsOf(routed, boxes));
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
	return { byCard, byEdge, boxes };
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
			: [{ port: { x, foot: box.y + box.height, half, line }, edges: at.map(({ edge }) => edge) }];
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
 * The whole hole a port cuts in a card: its slot, and the notch through the
 * sill under it, as wide as the line, that the line comes out of the hole
 * through. The notch runs on past the foot, where there is no card to cut. It
 * is spelt in shares of the card's box, as a clip in the card's own box takes it.
 * @param port The port.
 * @param box The card's box.
 * @returns The outline.
 */
function holeOf(port: Port, box: Box): string {
	const { x, y, width, height } = slotOf(port);
	const round = height / 2;
	/**
	 * A distance across the card as a share of its width.
	 * @param value The distance from the card's left.
	 * @returns The share.
	 */
	const u = (value: number): string => share((value - box.x) / box.width);
	/**
	 * A distance down the card as a share of its height.
	 * @param value The distance from the card's top.
	 * @returns The share.
	 */
	const v = (value: number): string => share((value - box.y) / box.height);
	const arc = `A${share(round / box.width)},${share(round / box.height)} 0 0 1`;
	const [left, right] = [port.x - port.line / 2, port.x + port.line / 2];
	return (
		`M${u(x + round)},${v(y)}H${u(x + width - round)}` +
		`${arc} ${u(x + width - round)},${v(y + height)}` +
		`H${u(right)}V${v(port.foot + 1)}H${u(left)}V${v(y + height)}` +
		`H${u(x + round)}${arc} ${u(x + round)},${v(y)}Z`
	);
}

/**
 * A share of a card's box, spelt finely enough that a hole a few units long
 * in a card hundreds of units wide lands where it is meant to.
 * @param value The share.
 * @returns Its spelling.
 */
function share(value: number): string {
	return String(Number(value.toFixed(6)));
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
 * from its rim into its depth, and its floor by the sill, lit, which the first
 * of the lines that share the port draws; the end of the line, at its own
 * width, running up from the card's foot over the floor into it; and the depth
 * it fades into, over it and no wider, so a line drawn after it into the same
 * port covers none of it. Drawn near only.
 * @param port The slot.
 * @param well Whether this line draws the well, the first of the lines that share the port.
 * @param stroke How the line is stroked.
 * @param palette The theme's colours.
 * @returns Its markup.
 */
function portInside(port: Port, well: boolean, stroke: Attributes, palette: Palette): string {
	const slot = slotOf(port);
	const width = Number(stroke["stroke-width"]);
	const [left, bottom] = [port.x - width / 2, slot.y + slot.height];
	// Near only, as a card's own near layer is.
	return wrap(
		"g",
		{ class: PORT_CLASS },
		lines([
			well ? outlined(slot, `url(#${WELL_ID})`) : "",
			well
				? tag("path", { d: floorOf(slot), fill: palette.portLip, "pointer-events": "none" })
				: "",
			tag("line", {
				x1: coord(port.x),
				y1: coord(port.foot),
				x2: coord(port.x),
				y2: coord(slot.y),
				"pointer-events": "none",
				...stroke,
				// Square, so it stops at the lid and nothing of it reaches onto the card.
				"stroke-linecap": "butt",
			}),
			tag("path", {
				d: `M${coord(left)},${coord(slot.y)}H${coord(left + width)}V${coord(bottom)}H${coord(left)}Z`,
				fill: `url(#${FADE_ID})`,
				"pointer-events": "none",
			}),
		]),
	);
}

/**
 * Where a card is cut for its ports: everything but its holes, as a clip its
 * body is drawn through, in the body's own box, so it moves with the body. Its
 * id is its outline's, so two panes drawn inline in one document share a clip
 * only when they cut alike.
 * @param ports The card's slots.
 * @param box The card's box.
 * @returns The clip's id and its definition, or nothing for a card with no port.
 */
function portCut(
	ports: readonly Port[] | undefined,
	box: Box,
): { id: string; markup: string } | undefined {
	if (ports === undefined || ports.length === 0) return undefined;
	const outline = tag("path", {
		d: ["M-1,-1H2V2H-1Z", ...ports.map((port) => holeOf(port, box))].join(""),
		"clip-rule": "evenodd",
	});
	const id = `ab-port-${contentId(outline)}`;
	return { id, markup: wrap("clipPath", { id, clipPathUnits: "objectBoundingBox" }, outline) };
}

/**
 * How a drawing's ports are drawn: which line draws each port's well, the first
 * painted into it, and how each card with a port is cut.
 * @param ports The ports.
 * @param edges The lines, in the order they are painted.
 * @returns The line that draws each well, and each cut card's slots and clip.
 */
function portPlan(
	ports: Ports,
	edges: readonly DrawingEdge[],
): {
	readonly wells: ReadonlyMap<Port, string>;
	readonly cuts: ReadonlyMap<
		string,
		{ readonly slots: readonly Port[]; readonly id: string; readonly markup: string }
	>;
} {
	const wells = new Map<Port, string>();
	for (const { edge } of edges)
		for (const port of ports.byEdge.get(edge.id) ?? [])
			if (!wells.has(port)) wells.set(port, edge.id);
	const cuts = new Map(
		[...ports.byCard].flatMap(([id, slots]) => {
			const cut = portCut(slots, ports.boxes.get(id)!);
			return cut === undefined ? [] : [[id, { slots, ...cut }] as const];
		}),
	);
	return { wells, cuts };
}

/**
 * Where a route's end runs on to inside a card, when it runs into a port there.
 * @param point Where the route meets the foot.
 * @param ports The ports its ends run into.
 * @returns The point under the lid it runs on to, or undefined where no port is.
 */
function insidePort(point: Point, ports: readonly Port[]): Point | undefined {
	return ports.some((port) => port.x === point.x && Math.abs(port.foot - point.y) < 0.5)
		? { x: point.x, y: point.y - RIDE_IN }
		: undefined;
}

/**
 * The route a line's pulses ride: on from each end that runs into a port, up
 * through the hole and under the lid, so a pulse is seen to come out of the
 * hole and to go into it. A pulse that arrives in an arrowhead at a port rides
 * on over the head into the hole, since the head's tip stands on the sill
 * (`endsInPort`).
 * @param curve The line's route.
 * @param ports The ports its ends run into.
 * @returns The route its pulses ride.
 */
function rideInto(curve: Curve, ports: readonly Port[]): Curve {
	const start = insidePort(curve.from, ports);
	const end = insidePort(segmentEnd(curve), ports);
	return {
		from: start ?? curve.from,
		segments: [...lineTo(start && curve.from), ...curve.segments, ...lineTo(end)],
	};
}

/**
 * Whether a route ends in a port, so a pulse that arrives in an arrowhead
 * rides on over the head into the hole rather than stopping short of it.
 * @param curve The route.
 * @param ports The ports its ends run into.
 * @returns True when its end is at a port.
 */
function endsInPort(curve: Curve, ports: readonly Port[]): boolean {
	return insidePort(segmentEnd(curve), ports) !== undefined;
}

/**
 * Where a route ends.
 * @param curve The route.
 * @returns Its last point.
 */
function segmentEnd(curve: Curve): Point {
	return curve.segments.at(-1)?.to ?? curve.from;
}

/**
 * A straight piece of route to a point, if there is one to go to.
 * @param to The point, or undefined for none.
 * @returns The piece, or none.
 */
function lineTo(to: Point | undefined): Segment[] {
	return to === undefined ? [] : [{ kind: "line", to }];
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
	endsInPort,
	portDefinitions,
	portPlan,
	portInside,
	portsOf,
	rideInto,
};
