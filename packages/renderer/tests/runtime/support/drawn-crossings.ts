// Where two drawn lines cross with no arc over the crossing, read off the SVG.
//
// Every crossing of two lines gets an arc (TASK-570): one line hops the other,
// so a reader sees which passes over. A crossing left plain, or a line cut
// beneath another with no arc over the gap, reads as a join or a break. This
// reads each route's own path, leaves out its arcs, and finds where the rest
// of two routes' ink crosses.

import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import type { DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";

/** One command of a route's path: a straight piece or a cubic curve. */
type Piece =
	| { readonly kind: "line"; readonly from: DrawnPoint; readonly to: DrawnPoint }
	| {
			readonly kind: "cubic";
			readonly from: DrawnPoint;
			readonly first: DrawnPoint;
			readonly second: DrawnPoint;
			readonly to: DrawnPoint;
	  };

/** A straight stretch of ink between two points. */
type Stretch = readonly [DrawnPoint, DrawnPoint];

/** Engine coordinates carry floating noise, so a piece straight to the eye is straight here. */
const STRAIGHT = 0.01;

/** The chords a corner is read as, enough to find where a line crosses it. */
const CORNER_CHORDS = 8;

/**
 * A route path's pieces. The renderer writes absolute `M`, `L` and `C` commands.
 * @param d The `d` attribute.
 * @returns Its pieces in order.
 */
function piecesOf(d: string): Piece[] {
	const pieces: Piece[] = [];
	let at: DrawnPoint = { x: 0, y: 0 };
	for (const [, command, values] of d.matchAll(/([MLC])([^MLC]*)/gu)) {
		const numbers = (values!.match(/-?[\d.]+(?:e-?\d+)?/gu) ?? []).map(Number);
		const point = (index: number): DrawnPoint => ({ x: numbers[index]!, y: numbers[index + 1]! });
		if (command === "M") at = point(0);
		else if (command === "L")
			for (let index = 0; index < numbers.length; index += 2) {
				pieces.push({ kind: "line", from: at, to: point(index) });
				at = point(index);
			}
		else
			for (let index = 0; index < numbers.length; index += 6) {
				const to = point(index + 4);
				pieces.push({ kind: "cubic", from: at, first: point(index), second: point(index + 2), to });
				at = to;
			}
	}
	return pieces;
}

/**
 * The axis a straight piece runs along.
 * @param piece A piece.
 * @returns `x` across, `y` down, or nothing for a curve or a slant.
 */
function axisOf(piece: Piece | undefined): "x" | "y" | undefined {
	if (piece?.kind !== "line") return undefined;
	const dx = Math.abs(piece.to.x - piece.from.x);
	const dy = Math.abs(piece.to.y - piece.from.y);
	if (dy < STRAIGHT && dx >= STRAIGHT) return "x";
	if (dx < STRAIGHT && dy >= STRAIGHT) return "y";
	return undefined;
}

/**
 * The pieces that draw a route's arcs: two curves, with or without a flat
 * crest between them, that leave a straight line and come back to it. A
 * corner or a jog turns onto another line instead.
 * @param pieces A route's pieces.
 * @returns The indexes of its arc pieces.
 */
function arcPieces(pieces: readonly Piece[]): Set<number> {
	const arcs = new Set<number>();
	for (let index = 1; index < pieces.length; index++) {
		if (pieces[index]!.kind !== "cubic") continue;
		const crest = pieces[index + 1]?.kind === "line" && pieces[index + 2]?.kind === "cubic";
		const last = crest ? index + 2 : index + 1;
		if (pieces[last]?.kind !== "cubic") continue;
		const before = pieces[index - 1]!;
		const after = pieces[last + 1];
		const axis = axisOf(before);
		if (axis === undefined || after === undefined || axisOf(after) !== axis) continue;
		const fixed = (point: DrawnPoint) => (axis === "x" ? point.y : point.x);
		if (Math.abs(fixed(before.to) - fixed(after.from)) > STRAIGHT) continue;
		for (let arc = index; arc <= last; arc++) arcs.add(arc);
	}
	return arcs;
}

/**
 * A point on a cubic.
 * @param curve The curve.
 * @param t How far along it, from 0 to 1.
 * @returns The point.
 */
function onCubic(curve: Extract<Piece, { kind: "cubic" }>, t: number): DrawnPoint {
	const u = 1 - t;
	const mix = (a: number, b: number, c: number, d: number) =>
		u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
	return {
		x: mix(curve.from.x, curve.first.x, curve.second.x, curve.to.x),
		y: mix(curve.from.y, curve.first.y, curve.second.y, curve.to.y),
	};
}

/**
 * The stretches a route's ink is drawn along, its arcs left out and its
 * corners read as short chords.
 * @param d The route's path.
 * @returns The stretches.
 */
function inkOf(d: string): Stretch[] {
	const pieces = piecesOf(d);
	const arcs = arcPieces(pieces);
	return pieces.flatMap((piece, index): Stretch[] => {
		if (arcs.has(index)) return [];
		if (piece.kind === "line") return [[piece.from, piece.to]];
		return Array.from({ length: CORNER_CHORDS }, (_, chord) => [
			onCubic(piece, chord / CORNER_CHORDS),
			onCubic(piece, (chord + 1) / CORNER_CHORDS),
		]);
	});
}

/**
 * Where two stretches cross, strictly inside both: touching ends, as at a
 * join or a shared port, and lines along each other are not crossings.
 * @param one A stretch.
 * @param other Another.
 * @returns The crossing, if they cross.
 */
function crossingOf(one: Stretch, other: Stretch): DrawnPoint | undefined {
	const r = { x: one[1].x - one[0].x, y: one[1].y - one[0].y };
	const s = { x: other[1].x - other[0].x, y: other[1].y - other[0].y };
	const across = r.x * s.y - r.y * s.x;
	if (Math.abs(across) < 1e-9) return undefined;
	const q = { x: other[0].x - one[0].x, y: other[0].y - one[0].y };
	const t = (q.x * s.y - q.y * s.x) / across;
	const u = (q.x * r.y - q.y * r.x) / across;
	const inside = (value: number) => value > 1e-6 && value < 1 - 1e-6;
	return inside(t) && inside(u) ? { x: one[0].x + t * r.x, y: one[0].y + t * r.y } : undefined;
}

/**
 * Each route's own path, by its relationship: the path its arrowhead ends,
 * or a headless line's only path.
 * @param svg The rendered document.
 * @returns The paths.
 */
function routePaths(svg: string): Map<string, string> {
	const paths = new Map<string, string>();
	for (const group of svg.matchAll(
		/<g data-semantic-kind="edge" data-semantic-id="([^"]+)"[^>]*>([\s\S]*?)<\/g>/gu,
	)) {
		const body = group[2] ?? "";
		const path =
			[...body.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-(?:end|start)=/gu)].at(-1)?.[1] ??
			(/data-arrowhead="none"/u.test(group[0])
				? /<path(?![^>]*class=)[^>]*\sd="([^"]*)"/u.exec(body)?.[1]
				: undefined);
		if (path !== undefined) paths.set(group[1]!, path);
	}
	return paths;
}

/**
 * Every place two drawn lines cross with no arc over the crossing.
 * @param drawing The rendered document.
 * @returns Each such crossing, by the two relationships and where they cross.
 */
function unbridgedCrossings(drawing: RenderedDiagram): string[] {
	const routes = [...routePaths(drawing.svg)].map(([id, d]) => ({ id, ink: inkOf(d) }));
	const found: string[] = [];
	for (const [index, one] of routes.entries())
		for (const other of routes.slice(index + 1)) {
			const seen: DrawnPoint[] = [];
			for (const stretch of one.ink)
				for (const crossed of other.ink) {
					const at = crossingOf(stretch, crossed);
					if (
						at === undefined ||
						seen.some((point) => Math.hypot(point.x - at.x, point.y - at.y) < 1)
					)
						continue;
					seen.push(at);
					found.push(`${one.id} × ${other.id} at ${at.x.toFixed(1)},${at.y.toFixed(1)}`);
				}
		}
	return found;
}

export { unbridgedCrossings };
