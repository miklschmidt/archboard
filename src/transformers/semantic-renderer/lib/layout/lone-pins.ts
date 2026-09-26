// Ports alone on a face, still at their card-wide slot.
//
// Every relationship channel at a card has one slot along the card,
// (index + 0.5) / channels, offered on all four faces (avoid-routing.ts
// RoutingScene.endpoint), and libavoid only picks the face. A port alone on
// its face keeps the slot its channel has among all of the card's channels,
// so the last of five channels leaves its face 8.8 px from the corner while
// the middle is free, and its label hangs past the card (Archboard's
// "private stdio session"). Such a port moves to the middle of its face when
// the strip its end run would sweep is clear, and the refined routes are
// solved once more with each moved channel held to its face, since the
// refinement can leave a port alone that had company before, and libavoid
// would otherwise take the shorter seed another face offers near the corner. Which drawings
// are routed so is the finishing step's choice (finishing.ts).
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { ROUTE_OBSTACLE_CLEARANCE } from "@/transformers/semantic-renderer/config";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	FACES,
	boxOf,
	boxesOverlap,
	obstacleOf,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import type {
	AlignedPin,
	AlignedPins,
} from "@/transformers/semantic-renderer/lib/layout/avoid-pins";
import { forcedLabel } from "@/transformers/semantic-renderer/lib/layout/avoid-routes";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	alongFace,
	endRuns,
	samePin,
	type EndRun,
} from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import {
	CARD_ROUTE_CLEARANCE,
	ROUTE_LANE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/**
 * The face a line ends on, from its corner on the card and the next.
 * @param tip The corner on the card.
 * @param next The next corner.
 * @returns The face.
 */
function faceOf(tip: Point, next: Point): Face {
	if (Math.abs(tip.x - next.x) > Math.abs(tip.y - next.y)) return next.x > tip.x ? "EAST" : "WEST";
	return next.y > tip.y ? "SOUTH" : "NORTH";
}

/**
 * Where a line end lies along its card's face.
 * @param box The card.
 * @param face The face.
 * @param tip The end's corner on the card.
 * @returns Its distance from the face's start.
 */
function alongOf(box: Box, face: Face, tip: Point): number {
	const [axis] = alongFace(face);
	return tip[axis] - box[axis];
}

/**
 * The ports of a drawing that stand alone on a card face within a lane of its
 * corner.
 * @param drawing The drawing.
 * @returns One card:FACE key for every such port.
 */
export function bunchedPorts(drawing: ArchitectureDrawing): string[] {
	const cards = new Map(drawing.cards.map(({ measured, box }) => [measured.node.id, box]));
	const ports = new Map<string, { box: Box; face: Face; at: number[] }>();
	for (const { edge, curve } of drawing.edges) {
		const points = verticesOf(curve);
		for (const [card, tip, next] of [
			[edge.from, points[0]!, points[1]!],
			[edge.to, points.at(-1)!, points.at(-2)!],
		] as const) {
			const box = cards.get(card);
			if (box === undefined) continue;
			const face = faceOf(tip, next);
			const key = `${card}:${face}`;
			const port = ports.get(key) ?? { box, face, at: [] };
			ports.set(key, { ...port, at: [...port.at, alongOf(box, face, tip)] });
		}
	}
	return [...ports].flatMap(([key, { box, face, at }]) => {
		const [, extent] = alongFace(face);
		const lone = at.every((one) => Math.abs(one - at[0]!) < 1);
		return lone && Math.min(at[0]!, box[extent] - at[0]!) < ROUTE_LANE ? [key] : [];
	});
}

/**
 * The one channel pin on a card face, when exactly one lies there.
 * @param byChannel The card's used pins by channel.
 * @param face The face.
 * @returns The channel and its pin, or nothing.
 */
function lonePin(
	byChannel: ReadonlyMap<string, readonly AlignedPin[]>,
	face: Face,
): readonly [string, AlignedPin] | undefined {
	const onFace = [...byChannel].flatMap(([channel, pins]) =>
		pins.filter((pin) => pin.face === face).map((pin) => [channel, pin] as const),
	);
	return onFace.length === 1 ? onFace[0] : undefined;
}

/**
 * Whether a strip is clear of every card but the line's own, with a card's clearance.
 * @param nodes Placed semantic nodes.
 * @param run The end run that would sweep it.
 * @param sweep The strip.
 * @returns True when no other card's routing footprint meets it.
 */
function cardsClear(nodes: ReadonlyMap<string, ElkNode>, run: EndRun, sweep: Box): boolean {
	const ends = new Set([...run.edge.sources, ...run.edge.targets]);
	return [...nodes].every(
		([id, node]) =>
			ends.has(id) || !boxesOverlap(sweep, inflate(obstacleOf(node), CARD_ROUTE_CLEARANCE)),
	);
}

/**
 * Whether no other route runs beside a strip, within a lane of it, along the end run.
 * @param edges The routed relationships.
 * @param mine The relationships on the moving pin.
 * @param run The end run.
 * @param strip The strip's low and high sides across the run.
 * @returns True when no parallel run of another route lies within a lane of the strip.
 */
function routesClear(
	edges: readonly ElkExtendedEdge[],
	mine: ReadonlySet<string>,
	run: EndRun,
	strip: readonly [number, number],
): boolean {
	const [low, high] = strip;
	const [along, across] = run.vertical ? (["y", "x"] as const) : (["x", "y"] as const);
	return edges.every((edge) => {
		const section = edge.sections?.[0];
		if (mine.has(edge.id) || section === undefined) return true;
		const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
		return points.slice(1).every((point, index) => {
			const previous = points[index]!;
			const parallel = Math.abs(previous[across] - point[across]) < 0.001;
			const overlap =
				Math.min(Math.max(previous[along], point[along]), run.to) -
				Math.max(Math.min(previous[along], point[along]), run.from);
			const beside = point[across] > low - ROUTE_LANE && point[across] < high + ROUTE_LANE;
			return !(parallel && overlap > 0 && beside);
		});
	});
}

/**
 * Whether an end run can move across to a new place: the strip it sweeps is
 * clear of other cards, of other lines' reserved labels and of other lines
 * running beside it.
 * @param nodes Placed semantic nodes.
 * @param edges The routed relationships.
 * @param mine The relationships on the moving pin.
 * @param run The end run.
 * @param at Where it would lie across its axis.
 * @returns True when the move is clear.
 */
function sweepClear(
	nodes: ReadonlyMap<string, ElkNode>,
	edges: readonly ElkExtendedEdge[],
	mine: ReadonlySet<string>,
	run: EndRun,
	at: number,
): boolean {
	const [low, high] = [Math.min(run.at, at), Math.max(run.at, at)];
	const sweep: Box = run.vertical
		? { x: low, y: run.from, width: high - low, height: run.to - run.from }
		: { x: run.from, y: low, width: run.to - run.from, height: high - low };
	const labels = edges
		.filter((edge) => !mine.has(edge.id) && forcedLabel(edge))
		.map((edge) => inflate(boxOf(edge.labels![0]!), ROUTE_OBSTACLE_CLEARANCE));
	return (
		cardsClear(nodes, run, sweep) &&
		labels.every((label) => !boxesOverlap(sweep, label)) &&
		routesClear(edges, mine, run, [low, high])
	);
}

/**
 * Where a lone channel pin on a face moves: the face's middle, when it still
 * stands at its channel's card-wide slot, every line on it turns after its
 * end run, and every end run can sweep across clear.
 * @param nodes Placed semantic nodes.
 * @param edges The routed relationships.
 * @param runs Every route's end runs.
 * @param slot The channel's card-wide slot.
 * @param lone The card, and its lone pin.
 * @returns The centred pin, or nothing when it stays.
 */
function centred(
	nodes: ReadonlyMap<string, ElkNode>,
	edges: readonly ElkExtendedEdge[],
	runs: readonly EndRun[],
	slot: number,
	lone: readonly [string, AlignedPin],
): AlignedPin | undefined {
	const [card, pin] = lone;
	if (Math.abs(pin.position - slot) > 1e-6 || Math.abs(slot - 0.5) < 1e-6) return undefined;
	const own = runs.filter((run) => run.card === card && samePin(run.pin, pin));
	if (own.length === 0 || own.some((run) => run.turn === 0)) return undefined;
	const box = boxOf(nodes.get(card)!);
	const [axis, extent] = alongFace(pin.face);
	const at = box[axis] + box[extent] / 2;
	const mine = new Set(own.map((run) => run.edge.id));
	return own.every((run) => sweepClear(nodes, edges, mine, run, at))
		? { face: pin.face, position: 0.5 }
		: undefined;
}

/**
 * Move every channel pin alone on its face, still at its card-wide slot, to
 * the face's middle where it can go ({@link centred}).
 * @param nodes Placed semantic nodes.
 * @param channels Sorted channels at every endpoint.
 * @param edges The routed relationships.
 * @param used The used pins by card and channel, changed in place.
 * @returns The moved channels, as card:channel keys.
 */
export function centreLonePins(
	nodes: ReadonlyMap<string, ElkNode>,
	channels: ReadonlyMap<string, readonly string[]>,
	edges: readonly ElkExtendedEdge[],
	used: AlignedPins,
): Set<string> {
	const runs = edges.flatMap((edge) => endRuns(nodes, edge));
	const moved = new Set<string>();
	for (const [card, byChannel] of used) {
		const list = channels.get(card) ?? [];
		for (const face of FACES) {
			const lone = lonePin(byChannel, face);
			if (lone === undefined) continue;
			const [channel, pin] = lone;
			const slot = (list.indexOf(channel) + 0.5) / list.length;
			const middle = centred(nodes, edges, runs, slot, [card, pin]);
			if (middle === undefined) continue;
			byChannel.set(
				channel,
				byChannel.get(channel)!.map((prior) => (samePin(prior, pin) ? middle : prior)),
			);
			moved.add(`${card}:${channel}`);
		}
	}
	return moved;
}

/** Pins a settled scene offers the next solve, and the card:channel keys held to their faces. */
export type PinFeedback = { readonly pins: AlignedPins; readonly held?: ReadonlySet<string> };

/**
 * The used pins of settled routes with every lone port centred.
 * @param nodes Placed scene nodes.
 * @param channels Sorted connection channels at every endpoint.
 * @param edges Settled relationships.
 * @param used Their used pins by card and channel, changed in place.
 * @returns The pins and the moved channels to hold, or nothing when none moved.
 */
export function centredPins(
	nodes: ReadonlyMap<string, ElkNode>,
	channels: ReadonlyMap<string, readonly string[]>,
	edges: readonly ElkExtendedEdge[],
	used: AlignedPins,
): PinFeedback | undefined {
	const held = centreLonePins(nodes, channels, edges, used);
	return held.size > 0 ? { pins: used, held } : undefined;
}
