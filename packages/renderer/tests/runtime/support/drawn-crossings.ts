// Where two drawn lines cross with no arc over the crossing, and where arcs
// crowd each other or a junction mark, read off the SVG.
//
// Every crossing of two lines gets an arc (TASK-570): one line hops the other,
// so a reader sees which passes over. A crossing left plain, or a line cut
// beneath another with no arc over the gap, reads as a join or a break. This
// reads each route's own path, leaves out its arcs, and finds where the rest
// of two routes' ink crosses. Two arcs side by side on one line, two arcs
// facing each other across neighbouring lines, or an arc bulging into a
// junction mark read as one knot.

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

/** Routes this close across share one drawn line. */
const SHARED_INK = 2;

/** Clear space two arcs keep between them before they read as one knot. */
const ARC_SPACE = 6;

/** Clear space an arc keeps from a junction mark. */
const MARK_SPACE = 3;

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
 * corner or a jog turns onto another line instead. The curve that brings an
 * arc back down starts none: the straight line after it is the line, not the
 * crest of a dip toward the next arc's crest.
 * @param pieces A route's pieces.
 * @returns The indexes of its arc pieces.
 */
function arcPieces(pieces: readonly Piece[]): Set<number> {
	const arcs = new Set<number>();
	for (let index = 1; index < pieces.length; index++) {
		if (pieces[index]!.kind !== "cubic" || arcs.has(index)) continue;
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

/** One arc of a route: the line it leaves, which way it bulges, and its box. */
type DrawnArc = {
	readonly id: string;
	readonly axis: "x" | "y";
	readonly line: number;
	readonly side: number;
	readonly box: Box;
};

/** A box, by its low and high corners. */
type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

/**
 * The box around some points, widened by a mark's radius when given.
 * @param points The points of the shape.
 * @param radius How far its ink reaches past them.
 * @returns The bounds of its ink.
 */
function boxOf(points: readonly DrawnPoint[], radius = 0): Box {
	return {
		x0: Math.min(...points.map((point) => point.x)) - radius,
		y0: Math.min(...points.map((point) => point.y)) - radius,
		x1: Math.max(...points.map((point) => point.x)) + radius,
		y1: Math.max(...points.map((point) => point.y)) + radius,
	};
}

/**
 * A route's arcs.
 * @param id The route's relationship.
 * @param d The route's path.
 * @returns Its arcs, in order.
 */
function arcsOf(id: string, d: string): DrawnArc[] {
	const pieces = piecesOf(d);
	const arcs = [...arcPieces(pieces)].toSorted((a, b) => a - b);
	const found: DrawnArc[] = [];
	for (const [index, piece] of arcs.entries()) {
		if (arcs[index - 1] === piece - 1) continue;
		let last = piece;
		while (arcs.includes(last + 1)) last++;
		const axis = axisOf(pieces[piece - 1])!;
		const line = axis === "x" ? pieces[piece]!.from.y : pieces[piece]!.from.x;
		const points = pieces.slice(piece, last + 1).flatMap((one) => [one.from, one.to]);
		const box = boxOf(points);
		const middle = axis === "x" ? (box.y0 + box.y1) / 2 : (box.x0 + box.x1) / 2;
		found.push({ id, axis, line, side: Math.sign(middle - line), box });
	}
	return found;
}

/**
 * The ink bounds of junction dots and the round-ended bars that gather nearby joins.
 * @param svg The rendered document.
 * @returns One box per mark in the junction layer.
 */
function junctionBoxes(svg: string): Box[] {
	const boxes: Box[] = [];
	for (const group of svg.matchAll(/<g class="ab-junctions"[^>]*>([\s\S]*?)<\/g>/gu))
		for (const mark of group[1]!.matchAll(
			/<(circle|path)\b([^>]*\bdata-members="[^"]*"[^>]*)>/gu,
		)) {
			const attributes = new Map(
				[...mark[2]!.matchAll(/([\w-]+)="([^"]*)"/gu)].map((attribute) => [
					attribute[1]!,
					attribute[2]!,
				]),
			);
			if (mark[1] === "circle")
				boxes.push(
					boxOf(
						[{ x: Number(attributes.get("cx")), y: Number(attributes.get("cy")) }],
						Number(attributes.get("r")),
					),
				);
			else {
				const points = piecesOf(attributes.get("d") ?? "").flatMap((piece) => [
					piece.from,
					piece.to,
				]);
				if (points.length > 0)
					boxes.push(boxOf(points, Number(attributes.get("stroke-width")) / 2));
			}
		}
	return boxes;
}

/**
 * How far apart two boxes lie: the larger of their gaps across and down, 0
 * where they overlap.
 * @param a A box.
 * @param b Another.
 * @returns The gap.
 */
function gapOf(a: Box, b: Box): number {
	return Math.max(0, b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
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
	return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
		? { x: one[0].x + t * r.x, y: one[0].y + t * r.y }
		: undefined;
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

/**
 * Every place two arcs, or an arc and a junction mark, crowd each other: two
 * arcs side by side on one line, which one crest would draw; two arcs on
 * neighbouring lines bulging toward each other; an arc bulging into a
 * junction mark beside the line it passes over.
 * The routes of one trunk draw one arc each, and those count once.
 * @param drawing The rendered document.
 * @returns Each such place, by what crowds and where.
 */
function crowdedArcs(drawing: Pick<RenderedDiagram, "svg">): string[] {
	const arcs: DrawnArc[] = [];
	for (const arc of [...routePaths(drawing.svg)].flatMap(([id, d]) => arcsOf(id, d))) {
		const copy = arcs.some(
			(other) =>
				other.axis === arc.axis &&
				Math.abs(other.line - arc.line) <= SHARED_INK &&
				["x0", "y0", "x1", "y1"].every(
					(corner) =>
						Math.abs(other.box[corner as keyof Box] - arc.box[corner as keyof Box]) <=
						SHARED_INK + STRAIGHT,
				),
		);
		if (!copy) arcs.push(arc);
	}
	const found: string[] = [];
	for (const [index, one] of arcs.entries())
		for (const other of arcs.slice(index + 1)) {
			if (one.axis !== other.axis || gapOf(one.box, other.box) >= ARC_SPACE) continue;
			const apart = other.line - one.line;
			if (Math.abs(apart) <= SHARED_INK)
				found.push(`${one.id} and ${other.id} side by side at ${cornerOf(one.box)}`);
			else if (one.side === Math.sign(apart) && other.side === -one.side)
				found.push(`${one.id} and ${other.id} facing at ${cornerOf(one.box)}`);
		}
	for (const box of junctionBoxes(drawing.svg)) {
		const [x, y] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
		for (const arc of arcs) {
			const [along, beside, low, high] =
				arc.axis === "x" ? [x, y, arc.box.x0, arc.box.x1] : [y, x, arc.box.y0, arc.box.y1];
			const apart = beside - arc.line;
			const into =
				along > low &&
				along < high &&
				Math.abs(apart) > SHARED_INK &&
				Math.sign(apart) === arc.side;
			if (into && gapOf(arc.box, box) < MARK_SPACE)
				found.push(`${arc.id} bulging into a junction at ${cornerOf(box)}`);
		}
	}
	return found;
}

/**
 * A box's low corner, for a drawing diagnostic.
 * @param box The bounds of the ink.
 * @returns Its coordinates.
 */
function cornerOf(box: Box): string {
	return `${box.x0.toFixed(1)},${box.y0.toFixed(1)}`;
}

export { crowdedArcs, unbridgedCrossings };
