import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { AlignedPin } from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import { boxOf, type Face } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import {
	CARD_ROUTE_CLEARANCE,
	ROUTE_LANE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/**
 * How far inside a card's corner a corner pin stands: clear of the change
 * badge a proposal pins 3 px inside a card's top corner with a 9.2 px radius,
 * by half the widest arrowhead, so an arrow never lands on the badge
 * (Board persistence's "adopt a draft" into Adopt).
 */
const CORNER_PIN_INSET = 20;

type PinProjection = { pin: AlignedPin; corridor: Box };

/**
 * Read one endpoint's actual attachment from a complete native route.
 * @param node Endpoint card.
 * @param points Route ordered away from that endpoint.
 * @returns Its face and proportional position.
 */
function usedPin(node: ElkNode, points: readonly Point[]): AlignedPin {
	const at = points[0]!;
	const next = points[1]!;
	const vertical = Math.abs(at.x - next.x) < Math.abs(at.y - next.y);
	const face: Face = vertical
		? next.y > at.y
			? "SOUTH"
			: "NORTH"
		: next.x > at.x
			? "EAST"
			: "WEST";
	const box = boxOf(node);
	return { face, position: vertical ? (at.x - box.x) / box.width : (at.y - box.y) / box.height };
}

/**
 * Preserve every ordinary-card attachment, including multiple edges in one shared channel.
 * Self-loop pins and frame attachments retain their existing specialized policies.
 * @param nodes Placed semantic nodes.
 * @param edge One complete native relationship.
 * @returns Actual card pins paired with their endpoint identity.
 */
export function usedCardPins(
	nodes: ReadonlyMap<string, ElkNode>,
	edge: ElkExtendedEdge,
): [string, AlignedPin][] {
	return endRuns(nodes, edge).map(({ card, pin }) => [card, pin]);
}

/**
 * Find the corridor from an outside run to the near card boundary.
 * @param low Card's first boundary.
 * @param high Card's second boundary.
 * @param one Run start.
 * @param two Run end.
 * @returns Corridor and approach direction, or nothing for an overlapping run.
 */
function outsideInterval(
	low: number,
	high: number,
	one: number,
	two: number,
): readonly [number, number, boolean] | undefined {
	const start = Math.min(one, two);
	const end = Math.max(one, two);
	if (end < low) return [start, low, true];
	if (start > high) return [high, end, false];
	return undefined;
}

/**
 * Resolve the face reached by an outside run.
 * @param vertical Run orientation.
 * @param before Whether the run precedes the card on its axis.
 * @returns Near card face.
 */
function projectionFace(vertical: boolean, before: boolean): Face {
	if (vertical) return before ? "NORTH" : "SOUTH";
	return before ? "WEST" : "EAST";
}

/**
 * Project an external straight run onto the near face of a card.
 * @param box Card bounds.
 * @param one First point of the native run.
 * @param two Second point of the native run.
 * @param vertical Whether the run travels along the y axis.
 * @returns A pin and its complete approach corridor when the run faces this card.
 */
function projection(
	box: Box,
	one: Point,
	two: Point,
	vertical: boolean,
): PinProjection | undefined {
	const axes = vertical
		? (["x", "y", "width", "height"] as const)
		: (["y", "x", "height", "width"] as const);
	const [axis, cross, extent, crossExtent] = axes;
	const coordinate = one[axis];
	if (
		coordinate < box[axis] + ROUTE_NUDGE_DISTANCE ||
		coordinate > box[axis] + box[extent] - ROUTE_NUDGE_DISTANCE
	)
		return undefined;
	const interval = outsideInterval(
		box[cross],
		box[cross] + box[crossExtent],
		one[cross],
		two[cross],
	);
	if (interval === undefined) return undefined;
	const [start, end, before] = interval;
	return {
		pin: {
			face: projectionFace(vertical, before),
			position: (coordinate - box[axis]) / box[extent],
		},
		corridor: vertical
			? { x: coordinate, y: start, width: 0, height: end - start }
			: { x: start, y: coordinate, width: end - start, height: 0 },
	};
}

/**
 * Offer continuations of the router's own straight runs, without inventing a
 * path, and, when asked, the near corner of a face a route hooks past ({@link cornerPin}).
 * @param node Ordinary endpoint card.
 * @param edge Complete native relationship.
 * @param corners Whether to offer corner pins.
 * @returns Candidate attachment corridors for the existing collision policy to validate.
 */
export function projectedCardPins(
	node: ElkNode,
	edge: ElkExtendedEdge,
	corners = false,
): PinProjection[] {
	const section = edge.sections?.[0];
	if (!section) return [];
	const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
	const box = boxOf(node);
	return [
		...(corners ? cornerPins(node, edge, points) : []),
		...points.slice(1).flatMap((point, index) => {
			const previous = points[index]!;
			const candidate = projection(box, previous, point, Math.abs(previous.x - point.x) < 0.001);
			return candidate ? [candidate] : [];
		}),
	];
}

/**
 * The corner pins of a card at each of a route's ends on it.
 * @param node The card.
 * @param edge The relationship.
 * @param points Its route from source to target.
 * @returns A pin for each end that hooks past the card's corner.
 */
function cornerPins(
	node: ElkNode,
	edge: ElkExtendedEdge,
	points: readonly Point[],
): PinProjection[] {
	const ends = [
		...(edge.sources[0] === node.id ? [points] : []),
		...(edge.targets[0] === node.id ? [points.toReversed()] : []),
	];
	return ends.flatMap((route) => {
		const corner = cornerPin(boxOf(node), route);
		return corner ? [corner] : [];
	});
}

/**
 * The top or bottom face just inside the corner a route hooks past. A line
 * that drops down the gutter beside its card, past the card's corner, and
 * turns into its side a few points below (Renderer layout's "measure every
 * word") could have entered the face it passed with one bend fewer; the
 * face's only pin was its channel's seed, far along it, so the router took
 * the side. The run past the corner only lies a card clearance outside the
 * card, so the face never sees it as a rail of its own.
 * @param box The card.
 * @param route The route ordered away from the card.
 * @returns The pin {@link CORNER_PIN_INSET} inside the corner it passed, and the corridor the carried-on run and drop take.
 */
function cornerPin(box: Box, route: readonly Point[]): PinProjection | undefined {
	const [tip, bend, after] = [route[0]!, route[1]!, route[2]];
	if (after === undefined || !hooksPast(box, tip, bend, after)) return undefined;
	const above = after.y < box.y;
	const x = Math.max(
		box.x + CORNER_PIN_INSET,
		Math.min(box.x + box.width - CORNER_PIN_INSET, bend.x),
	);
	const face = above ? box.y : box.y + box.height;
	return {
		pin: { face: above ? "NORTH" : "SOUTH", position: (x - box.x) / box.width },
		corridor: {
			x: Math.min(x, bend.x),
			y: Math.min(after.y, face),
			width: Math.abs(bend.x - x),
			height: Math.abs(after.y - face),
		},
	};
}

/**
 * Whether a route hooks into a card's side: a stub no longer than the card's
 * own corridor and a lane leaves the side and turns along it to beyond the
 * card's top or bottom. A longer first run is an ordinary L that happens to
 * pass the card's corner, and its corner exit would only be worse (Command
 * interface's "the stated board, doing and version").
 * @param box The card.
 * @param tip The route's end on the card.
 * @param bend Its first bend.
 * @param after The end of the run after that bend.
 * @returns True when the side stub turns past the card's corner.
 */
export function hooksPast(box: Box, tip: Point, bend: Point, after: Point): boolean {
	if (Math.abs(tip.y - bend.y) >= 0.01 || Math.abs(bend.x - after.x) >= 0.01) return false;
	if (Math.abs(tip.x - bend.x) > CARD_ROUTE_CLEARANCE + ROUTE_LANE) return false;
	return after.y < box.y || after.y > box.y + box.height;
}

/** One route's first or last run, which the router holds on its card's pin. */
export interface EndRun {
	readonly edge: ElkExtendedEdge;
	readonly card: string;
	readonly pin: AlignedPin;
	readonly vertical: boolean;
	/** Where the run lies across its axis. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
	/** Which way the route turns after the run, across it: -1, 0 or +1. */
	readonly turn: number;
}

/**
 * The runs a complete route holds fixed at its card ends.
 * @param nodes Placed semantic nodes.
 * @param edge One complete native relationship.
 * @returns Its end runs on ordinary cards.
 */
export function endRuns(nodes: ReadonlyMap<string, ElkNode>, edge: ElkExtendedEdge): EndRun[] {
	const section = edge.sections?.[0];
	if (!section || edge.sources[0] === edge.targets[0]) return [];
	const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
	const ends = [
		[edge.sources[0]!, points],
		[edge.targets[0]!, points.toReversed()],
	] as const;
	return ends.flatMap(([card, route]) => {
		const node = nodes.get(card)!;
		if (node.children?.length) return [];
		const [tip, bend, after] = [route[0]!, route[1]!, route[2]];
		const vertical = Math.abs(tip.x - bend.x) < Math.abs(tip.y - bend.y);
		const [along, across] = vertical ? (["y", "x"] as const) : (["x", "y"] as const);
		return [
			{
				edge,
				card,
				pin: usedPin(node, route),
				vertical,
				at: tip[across],
				from: Math.min(tip[along], bend[along]),
				to: Math.max(tip[along], bend[along]),
				turn: after === undefined ? 0 : Math.sign(after[across] - bend[across]),
			},
		];
	});
}

/**
 * Whether two end runs of unrelated routes share a lane: parallel, closer
 * than a lane and side by side for a lane or more. The router holds both, so
 * its nudging never parts them, and they read as one line or a doubled one.
 * @param one An end run.
 * @param other Another route's end run.
 * @returns True when they would read as one line.
 */
function onOneTrack(one: EndRun, other: EndRun): boolean {
	if (one.vertical !== other.vertical || Math.abs(one.at - other.at) >= ROUTE_LANE - 0.01)
		return false;
	const ends = new Set([...one.edge.sources, ...one.edge.targets]);
	if ([...other.edge.sources, ...other.edge.targets].some((id) => ends.has(id))) return false;
	return Math.min(one.to, other.to) - Math.max(one.from, other.from) >= ROUTE_LANE;
}

/**
 * Move one pin of each pair of unrelated routes whose held end runs lie on
 * one track a lane along its face, toward where its route turns, when the
 * face has room there and no other channel's pin is within a lane.
 * @param nodes Placed semantic nodes.
 * @param edges Complete baseline relationships.
 * @param pinsOf A card's used pins by channel, which a move replaces in place.
 * @returns Each moved card's tracks, as the pins on its faces a pin must stay a lane from.
 */
export function separateEndRuns(
	nodes: ReadonlyMap<string, ElkNode>,
	edges: readonly ElkExtendedEdge[],
	pinsOf: (card: string) => Map<string, AlignedPin[]> | undefined,
): Map<string, AlignedPin[]> {
	const runs = edges.flatMap((edge) => endRuns(nodes, edge));
	const tracks = new Map<string, AlignedPin[]>();
	for (const [index, run] of runs.entries()) {
		const other = runs.slice(0, index).find((earlier) => onOneTrack(earlier, run));
		if (other === undefined) continue;
		const box = boxOf(nodes.get(run.card)!);
		if (!movePin(box, run, other, pinsOf(run.card))) continue;
		tracks.set(run.card, [...(tracks.get(run.card) ?? []), pinAt(box, run.pin.face, other.at)]);
	}
	return tracks;
}

/**
 * The pin on a face at a coordinate along it.
 * @param box The card.
 * @param face Its face.
 * @param at The coordinate along the face.
 * @returns The pin.
 */
function pinAt(box: Box, face: Face, at: number): AlignedPin {
	const [axis, extent] = alongFace(face);
	return { face, position: (at - box[axis]) / box[extent] };
}

/**
 * The axis a face runs along.
 * @param face A face.
 * @returns Its coordinate and extent.
 */
export function alongFace(face: Face): readonly ["x", "width"] | readonly ["y", "height"] {
	return face === "NORTH" || face === "SOUTH"
		? (["x", "width"] as const)
		: (["y", "height"] as const);
}

/**
 * Move an end run's pin a lane clear of the run it lies on.
 * @param box The card.
 * @param run The end run to move.
 * @param other The run it lies on.
 * @param byChannel The card's used pins by channel, changed in place.
 * @returns Whether the pin moved.
 */
function movePin(
	box: Box,
	run: EndRun,
	other: EndRun,
	byChannel: Map<string, AlignedPin[]> | undefined,
): boolean {
	const channel = channelOf(byChannel, run.pin);
	if (channel === undefined) return false;
	const taken = [...byChannel!].flatMap(([owner, pins]) => (owner === channel ? [] : pins));
	const toward = run.turn || Math.sign(run.at - other.at) || 1;
	const shifted = [toward, -toward]
		.map((direction) => pinAt(box, run.pin.face, other.at + direction * ROUTE_LANE))
		.find((pin) => roomFor(box, pin, taken));
	if (shifted === undefined) return false;
	byChannel!.set(
		channel,
		byChannel!.get(channel)!.map((pin) => (samePin(pin, run.pin) ? shifted : pin)),
	);
	return true;
}

/**
 * The channel a used pin belongs to.
 * @param byChannel A card's used pins by channel.
 * @param pin The pin.
 * @returns Its channel, if the pin is used.
 */
function channelOf(
	byChannel: ReadonlyMap<string, readonly AlignedPin[]> | undefined,
	pin: AlignedPin,
): string | undefined {
	return [...(byChannel ?? [])].find(([, pins]) => pins.some((used) => samePin(used, pin)))?.[0];
}

/**
 * Whether two pins are one physical pin.
 * @param one A pin.
 * @param other Another pin.
 * @returns True on the same face at the same place.
 */
export function samePin(one: AlignedPin, other: AlignedPin): boolean {
	return one.face === other.face && Math.abs(one.position - other.position) < 0.000001;
}

/**
 * Whether a face has room for a pin: clear of its corners and a lane from
 * every other channel's pin.
 * @param box The card.
 * @param pin The pin.
 * @param taken Other channels' pins on the card.
 * @returns True when it fits.
 */
function roomFor(box: Box, pin: AlignedPin, taken: readonly AlignedPin[]): boolean {
	const length = box[alongFace(pin.face)[1]];
	const margin = ROUTE_NUDGE_DISTANCE / length;
	return (
		pin.position >= margin &&
		pin.position <= 1 - margin &&
		!taken.some(
			(other) =>
				other.face === pin.face && Math.abs(other.position - pin.position) * length < ROUTE_LANE,
		)
	);
}
