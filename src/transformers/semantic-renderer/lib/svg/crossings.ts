// What each line must not show: the ink beneath a line that crosses over it,
// the ink another route of its trunk draws for it, and the ink behind a
// see-through label. Each is cut from the line's own group by one mask, so the
// actual backdrop shows through, and nothing is painted over anything.
import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import { PILL_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import {
	coord,
	inflate,
	type Box,
	type Point,
} from "@/transformers/semantic-renderer/lib/geometry";
import type { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { sharedInk } from "@/transformers/semantic-renderer/lib/layout/drawn-lines";
import {
	curveBounds,
	pathOf,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { markRadius } from "@/transformers/semantic-renderer/lib/svg/junctions";
import { pulseBreadth } from "@/transformers/semantic-renderer/lib/svg/pulse";
import { strokeWidthOf } from "@/transformers/semantic-renderer/lib/svg/styles";

/**
 * An id that is the same for the same mask markup, in every place the
 * renderer runs: two 32-bit FNV-1a hashes with different offsets, as 20 hex
 * digits. Synchronous and free of any runtime API, unlike a digest, and wide
 * enough that two different masks on one page do not share an id.
 * @param body The mask's markup.
 * @returns The id.
 */
function contentId(body: string): string {
	let one = 0x811c9dc5;
	let other = 0x01000193;
	for (let index = 0; index < body.length; index += 1) {
		const code = body.charCodeAt(index);
		one = Math.imul(one ^ code, 0x01000193) >>> 0;
		other = Math.imul(other ^ code, 0x811c9dc5) >>> 0;
	}
	const length = (body.length >>> 0).toString(16).padStart(4, "0").slice(-4);
	return `${one.toString(16).padStart(8, "0")}${other.toString(16).padStart(8, "0")}${length}`;
}

/** A restrained sliver of clear space on each side of the upper arc. */
const BRIDGE_INK_GAP = 1.5;

/**
 * The clear space on each side of a straight line where the line it crosses is
 * cut beneath it rather than hopped: with no arc to say so, only a gap wide
 * enough to see at a glance tells a crossing from a join.
 */
const CUT_GAP = 3;

/** One piece of ink a route must not show, as mask markup. */
interface Cutout {
	readonly edgeId: string;
	readonly markup: string;
}

/**
 * Clear lower ink narrowly beneath each line that crosses over it.
 * @param edges Final bridged routes.
 * @param bridges Local upper ink and the lower connections it crosses.
 * @returns One cutout per crossed route.
 */
function crossingCutouts(
	edges: readonly DrawingEdge[],
	bridges: ReturnType<typeof bridgeCrossings>["bridges"],
): Cutout[] {
	const byId = new Map(edges.map((route) => [route.edge.id, route]));
	return bridges.flatMap((bridge) => {
		// A cut beneath a line is one piece of it, straight or a turn; a hop is a
		// hump of several pieces, whose arc already says it crosses. A cut beside
		// a join clears the join's mark as well as the line.
		const gap = bridge.curve.segments.length === 1 ? CUT_GAP : BRIDGE_INK_GAP;
		const width = strokeWidthOf(byId.get(bridge.edgeId)!.edge);
		const markup = tag("path", {
			d: pathOf(bridge.curve),
			fill: "none",
			stroke: "black",
			"stroke-width": bridge.join ? (markRadius(width) + CUT_GAP) * 2 : width + gap * 2,
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		});
		return bridge.under.map((edgeId) => ({ edgeId, markup }));
	});
}

/**
 * A piece of a route carried on past the route's end by a distance, when it
 * reaches that end, so it covers what the route ends in.
 * @param piece The piece.
 * @param end Where the route ends.
 * @param past How far past it.
 * @returns The piece, longer where it met the end.
 */
function pastEnd(piece: Curve, end: Point, past: number): Curve {
	const last = piece.segments.at(-1)!;
	const before = piece.segments.at(-2)?.to ?? piece.from;
	const length = Math.hypot(last.to.x - before.x, last.to.y - before.y);
	if (
		last.kind !== "line" ||
		length === 0 ||
		Math.hypot(last.to.x - end.x, last.to.y - end.y) > 0.5
	)
		return piece;
	const scale = (length + past) / length;
	const to = {
		x: before.x + (last.to.x - before.x) * scale,
		y: before.y + (last.to.y - before.y) * scale,
	};
	return { ...piece, segments: [...piece.segments.slice(0, -1), { kind: "line", to }] };
}

/**
 * Hide every stretch of a route's ink another route of its trunk draws: its
 * line, its dashes, its pulses and an arrowhead on the same point, so the trunk
 * reads as one line. Square across its ends, so where the routes part the
 * route's own ink carries on from exactly there.
 * @param routes The routes before any hop is drawn, as the trunks were found.
 * @returns One cutout per hidden stretch.
 */
function trunkCutouts(routes: readonly DrawingEdge[]): Cutout[] {
	return [...sharedInk(routes)].flatMap(([index, pieces]) => {
		const { edge, curve } = routes[index]!;
		const width = strokeWidthOf(edge);
		const end = curve.segments.at(-1)?.to ?? curve.from;
		return pieces.map((piece) => ({
			edgeId: edge.id,
			markup: tag("path", {
				// An arrowhead's tip reaches a line's width past the route's end.
				d: pathOf(pastEnd(piece, end, width + BRIDGE_INK_GAP)),
				"stroke-width": coord(pulseBreadth(width) + BRIDGE_INK_GAP * 2),
				"stroke-linecap": "butt",
				fill: "none",
				stroke: "black",
			}),
		}));
	});
}

/**
 * Hide every line's ink behind a label that is drawn see-through, as a removed
 * relationship's is, so the words are not struck through by what they label.
 * @param edges Final bridged routes.
 * @param labels The see-through labels' boxes.
 * @returns One cutout per route passing behind such a label.
 */
function labelCutouts(edges: readonly DrawingEdge[], labels: readonly Box[]): Cutout[] {
	return labels.flatMap((box) => {
		const markup = tag("rect", {
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
			rx: PILL_RADIUS,
			fill: "black",
		});
		return edges
			.filter(({ curve }) => overlaps(inflate(curveBounds(curve), 1), box))
			.map(({ edge }) => ({ edgeId: edge.id, markup }));
	});
}

/**
 * Whether two boxes share area.
 * @param a One box.
 * @param b Another.
 * @returns True when they do.
 */
function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * One mask per route with anything to hide, keeping all the rest of its ink.
 * @param edges Final bridged routes.
 * @param cutouts What each route must not show.
 * @returns Mask definitions and the mask identity for each affected route.
 */
function crossingMasks(
	edges: readonly DrawingEdge[],
	cutouts: readonly Cutout[],
): { definitions: string; masks: ReadonlyMap<string, string> } {
	const byId = new Map(edges.map((route) => [route.edge.id, route]));
	const grouped = new Map<string, string[]>();
	for (const { edgeId, markup } of cutouts) {
		const paths = grouped.get(edgeId) ?? [];
		if (!paths.includes(markup)) paths.push(markup);
		grouped.set(edgeId, paths);
	}
	const masks = new Map<string, string>();
	const definitions: string[] = [];
	for (const [edgeId, paths] of grouped) {
		// Keep the full stroke, selection halo, pulses and endpoints inside the mask.
		const box = inflate(curveBounds(byId.get(edgeId)!.curve), 18);
		const bounds = {
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
		};
		const body = tag("rect", { ...bounds, fill: "white" }) + paths.join("");
		// Panes and variants share an SVG ID namespace; identical IDs mean identical masks.
		const id = `crossing-${contentId(body)}`;
		masks.set(edgeId, id);
		definitions.push(
			wrap(
				"mask",
				{ id, maskUnits: "userSpaceOnUse", maskContentUnits: "userSpaceOnUse", ...bounds },
				body,
			),
		);
	}
	return {
		definitions: definitions.length === 0 ? "" : wrap("defs", {}, definitions.join("")),
		masks,
	};
}

export { crossingCutouts, crossingMasks, labelCutouts, trunkCutouts };
