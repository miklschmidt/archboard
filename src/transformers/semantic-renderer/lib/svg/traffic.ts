// A board's traffic, painted: the pulses on every line that carries some, and
// the pulses that run round the edge of a card between lines that keep the same
// time (`traffic-relay.ts`).
import { type SemanticEdge } from "@/shared/semantic-board/index";
import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { rimRoute } from "@/transformers/semantic-renderer/lib/svg/card-rim";
import { wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	pulseLook,
	rideOf,
	routeLength,
	steadyPulses,
} from "@/transformers/semantic-renderer/lib/svg/pulse";
import { TRAFFIC_ATTRIBUTE } from "@/transformers/semantic-renderer/lib/svg/standing";
import { relayRhythms } from "@/transformers/semantic-renderer/lib/svg/traffic-relay";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";

/** How thick the edge of a card is drawn, which a pulse running round it rides. */
const CARD_EDGE_WIDTH = 1;

/** One line that carries traffic, and what its pulses are drawn in. */
interface TrafficLine {
	readonly routed: DrawingEdge;
	readonly traffic: NonNullable<SemanticEdge["traffic"]>;
	/** How far back from the route's end its arrowhead's ink reaches. */
	readonly headReach: number;
	/** The relationship's colour at full strength; its line is drawn weaker. */
	readonly ink: string;
	/** The colour its line is drawn in, which the tail of a pulse fades back into. */
	readonly lineColour: string;
	readonly lineWidth: number;
}

/** A board's traffic, painted. */
interface PaintedTraffic {
	/**
	 * Each line's traffic in a layer of its own, by relationship id. The layer names
	 * its relationship, so a viewer lights, dims and raises it with its line.
	 */
	readonly lines: ReadonlyMap<string, string>;
	/** The pulses that run round the edge of each card, by the card's id. */
	readonly rims: ReadonlyMap<string, string>;
}

/**
 * Paint a board's traffic.
 *
 * The lines' layer goes over every line and under every card and every
 * relationship's words. Drawn with its line, the pulses riding a stretch two
 * joined lines share were covered by whichever line was painted after, and cut
 * where its line is cut beneath a crossing.
 * @param lines The lines that carry traffic: a relationship the proposal no longer
 * has is not among them, because it is drawn for context and must not read as live.
 * @param cards Where every card is, by id: a pulse runs round the edge of one.
 * @param palette The selected theme.
 * @returns The layers of the lines and the pulses round the cards.
 */
function paintTraffic(
	lines: readonly TrafficLine[],
	cards: ReadonlyMap<string, Box>,
	palette: Palette,
): PaintedTraffic {
	const byId = new Map(lines.map((line) => [line.routed.edge.id, line]));
	const rides = new Map(
		lines.map(({ routed, headReach }) => [routed.edge.id, rideOf(routed.curve, headReach)]),
	);
	const { rhythms, crossings } = relayRhythms(
		lines.map(({ routed, traffic }) => ({
			id: routed.edge.id,
			from: routed.edge.from,
			to: routed.edge.to,
			traffic,
			start: routed.curve.from,
			end: routed.curve.segments.at(-1)?.to ?? routed.curve.from,
			length: routeLength(routed.curve),
			ride: rides.get(routed.edge.id)?.length ?? 0,
		})),
		// A frame has no edge to run round: its pulse is handed on across it unseen.
		(card, from, to) => {
			const box = cards.get(card);
			return box === undefined
				? { length: Math.hypot(from.x - to.x, from.y - to.y) }
				: rimRoute(box, from, to);
		},
	);
	const painted = new Map(
		lines.map(({ routed, ink, lineColour, lineWidth }) => {
			const { id } = routed.edge;
			const ride = rides.get(id);
			const rhythm = rhythms.get(id);
			return [
				id,
				wrap(
					"g",
					{ [TRAFFIC_ATTRIBUTE]: id },
					ride === undefined || rhythm === undefined
						? ""
						: steadyPulses({
								look: pulseLook(ink, { lineColour, lineWidth }, palette),
								ride,
								rhythm,
							}),
				),
			];
		}),
	);
	const rims = new Map<string, string>();
	for (const crossing of crossings) {
		const { ink } = byId.get(crossing.onto)!;
		const pulses = steadyPulses({
			// Round a card's edge, a pulse fades into the edge rather than into a line.
			look: pulseLook(ink, { lineColour: palette.cardBorder, lineWidth: CARD_EDGE_WIDTH }, palette),
			ride: { path: crossing.path, length: crossing.length },
			rhythm: crossing.rhythm,
		});
		rims.set(crossing.card, (rims.get(crossing.card) ?? "") + pulses);
	}
	return { lines: painted, rims };
}

export { paintTraffic, type PaintedTraffic, type TrafficLine };
