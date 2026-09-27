// How a reading asks for its routes. A route solve is handed a placed graph,
// so the request travels as one option on it: written where a reading is
// routed (compound.ts) and read where the graph is routed (route-graph.ts).
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";

/** The graph option carrying a route request. */
const ROUTE_REQUEST = "archboard.route.request";

const RouteRequestSchema = z.object({
	/** Every pin of a shape costs the same (even-pins.ts). */
	evenPins: z.boolean().default(false),
	/** The frame walls routes keep clear of (frame-walls.ts). */
	clearWalls: z.array(z.string()).readonly().default([]),
	/** A route that hooks past a card's corner is offered the face it passed (pin-feedback.ts). */
	cornerPins: z.boolean().default(false),
	/** The cards on which a route that hooks past a corner is offered the face it passed, where cornerPins is not asked. */
	cornerCards: z.array(z.string()).readonly().default([]),
	/** A straight channel may take any lane of a shared span (straight-candidates.ts). */
	laneChannels: z.boolean().default(false),
	/** Reserved labels move onto the channel their cards share (label-centring.ts). */
	centredLabels: z.boolean().default(false),
	/** The lines whose reserved labels alone move so, where centredLabels is not asked. */
	centredLines: z.array(z.string()).readonly().default([]),
	/** Reserved labels keep the clearance of a label on its own run from other lines (routing-clearance.ts). */
	labelClearance: z.boolean().default(false),
	/** The cards whose seeds keep a lane from the standing pin they wear; aligned pins always do (pin-feedback.ts). */
	clearPins: z.array(z.string()).readonly().default([]),
	/** A port alone on a face near its corner moves to the face's middle (lone-pins.ts). */
	centredPorts: z.boolean().default(false),
	/** Line ends refused a face, as line:card:FACE, so unrelated lines on one stroke part (stacked-runs.ts). */
	refusedEnds: z.array(z.string()).readonly().default([]),
});

/** What a reading may ask of its routes; anything left out is not asked. */
type RouteRequest = z.input<typeof RouteRequestSchema>;

/** A complete route request. */
type Requested = z.output<typeof RouteRequestSchema>;

/** The way a reading is settled: with evened pins or not, and reserved labels given their full clearance or not (compound.ts). */
type SettlementWay = Pick<Requested, "evenPins" | "labelClearance">;

/**
 * The way a reading whose routes are asked for this was settled.
 * @param request What its routes are asked for.
 * @returns The way.
 */
function wayOf(request: RouteRequest = {}): SettlementWay {
	return { evenPins: request.evenPins === true, labelClearance: request.labelClearance === true };
}

/**
 * The graph options that carry a route request.
 * @param request What is asked.
 * @returns The options.
 */
function requestOptions(request: RouteRequest): Record<string, string> {
	return { [ROUTE_REQUEST]: JSON.stringify(RouteRequestSchema.parse(request)) };
}

/**
 * The route request a placed graph carries.
 * @param graph The placed graph.
 * @returns The request, nothing asked when the graph carries none.
 */
function requestOf(graph: ElkNode): Requested {
	return RouteRequestSchema.parse(JSON.parse(graph.layoutOptions?.[ROUTE_REQUEST] ?? "{}"));
}

export { requestOf, requestOptions, wayOf, type Requested, type RouteRequest, type SettlementWay };
