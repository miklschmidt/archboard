// A board's traffic, painted: the pulses on every line that carries some, in
// the time that lines which keep the same time hand on (`traffic-relay.ts`).
import { type SemanticEdge } from "@/shared/semantic-board/index";
import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { rimLength } from "@/transformers/semantic-renderer/lib/svg/card-rim";
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

/** One line that carries traffic, and what its pulses are drawn in. */
interface TrafficLine {
	readonly routed: DrawingEdge;
	readonly traffic: NonNullable<SemanticEdge["traffic"]>;
	/** How far back from the route's end its arrowhead's ink reaches. */
	readonly headReach: number;
	/** The relationship's colour at full strength; its line is drawn weaker. */
	readonly ink: string;
	readonly lineWidth: number;
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
 * @param cards Where every card is, by id: a pulse that sinks into one is held for as
 * long as the way round its edge takes.
 * @param palette The selected theme.
 * @returns Each line's traffic in a layer of its own, by relationship id. The layer
 * names its relationship, so a viewer lights, dims and raises it with its line.
 */
function paintTraffic(
	lines: readonly TrafficLine[],
	cards: ReadonlyMap<string, Box>,
	palette: Palette,
): ReadonlyMap<string, string> {
	const rides = new Map(
		lines.map(({ routed, headReach }) => [routed.edge.id, rideOf(routed.curve, headReach)]),
	);
	const rhythms = relayRhythms(
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
		// A frame has no edge: its pulse crosses it in a straight line.
		(card, from, to) => {
			const box = cards.get(card);
			return box === undefined
				? Math.hypot(from.x - to.x, from.y - to.y)
				: rimLength(box, from, to);
		},
	);
	return new Map(
		lines.map(({ routed, ink, lineWidth }) => {
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
								look: pulseLook(ink, lineWidth, palette),
								ride,
								rhythm,
							}),
				),
			];
		}),
	);
}

export { paintTraffic, type TrafficLine };
