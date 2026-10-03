// A route cut into the pieces a beam of light is drawn on: each a straight run or
// one bend, with a frame of its own to draw in.
import { coord, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	pathOf,
	pointOnSegment,
	segmentStart,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/** How many chords measure a rounded piece: a quarter bend's length to well under a tenth of a unit. */
const CHORDS = 16;

/** The shortest piece of a route worth a beam of its own. */
const LEAST_PIECE = 0.5;

/**
 * How far each piece of a route's mask runs into the next, so the light has no
 * seam where two pieces meet.
 */
const OVERLAP = 0.5;

/** One piece of a route, with the frame its beam is drawn in. */
interface Leg {
	readonly from: Point;
	readonly segment: Segment;
	/** How far along the route the piece starts. */
	readonly along: number;
	/** How long the piece is along its ink. */
	readonly length: number;
	/** The transform that puts the frame's x axis along the piece, one unit to a unit of ink. */
	readonly frame: string;
	/** How far the piece strays from the straight line between its ends: the room its bar needs. */
	readonly sag: number;
}

/**
 * A number as markup spells it: rounded, and without a trailing zero.
 * @param value The number.
 * @param places How many places to keep.
 * @returns Its spelling.
 */
function plain(value: number, places = 4): string {
	return String(Number(value.toFixed(places)));
}

/**
 * How long one segment is along its ink.
 * @param from Where the segment starts.
 * @param segment The segment.
 * @returns Its length.
 */
function segmentLength(from: Point, segment: Segment): number {
	if (segment.kind === "line") return Math.hypot(segment.to.x - from.x, segment.to.y - from.y);
	let length = 0;
	let previous = from;
	for (let step = 1; step <= CHORDS; step += 1) {
		const point = pointOnSegment(from, segment, step / CHORDS);
		length += Math.hypot(point.x - previous.x, point.y - previous.y);
		previous = point;
	}
	return length;
}

/**
 * The point a fraction of the way from one point to another.
 * @param a The first point.
 * @param b The second.
 * @param t How far, from 0 to 1.
 * @returns The point.
 */
function lerp(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The first part of one segment, up to a fraction of it.
 * @param from Where the segment starts.
 * @param segment The segment.
 * @param t How much of it to keep, from 0 to 1.
 * @returns The kept part, which ends at the point `t` names.
 */
function segmentUpTo(from: Point, segment: Segment, t: number): Segment {
	const to = pointOnSegment(from, segment, t);
	if (segment.kind === "line") return { kind: "line", to };
	const first = lerp(from, segment.first, t);
	const second = lerp(first, lerp(segment.first, segment.second, t), t);
	return { kind: "cubic", first, second, to };
}

/**
 * The route with a length taken off its end: the part pulses ride, which stops
 * short of whatever the route ends in.
 * @param curve The route.
 * @param distance How much of its length to take off.
 * @returns The shorter route, or undefined when that is all of it.
 */
function shortenedBy(curve: Curve, distance: number): Curve | undefined {
	let left = distance;
	for (let index = curve.segments.length - 1; index >= 0; index -= 1) {
		const from = segmentStart(curve, index);
		const segment = curve.segments[index]!;
		const length = segmentLength(from, segment);
		if (length > left) {
			const kept = segmentUpTo(from, segment, 1 - left / length);
			return { from: curve.from, segments: [...curve.segments.slice(0, index), kept] };
		}
		left -= length;
	}
	return undefined;
}

/**
 * How long a route is along its ink.
 * @param curve The route.
 * @returns Its length.
 */
function routeLength(curve: Curve): number {
	return curve.segments.reduce(
		(length, segment, index) => length + segmentLength(segmentStart(curve, index), segment),
		0,
	);
}

/**
 * The unit direction of a way from one point to another, or none.
 * @param from The start.
 * @param to The end.
 * @returns The direction, or undefined when the points are one.
 */
function directionOf(from: Point, to: Point): Point | undefined {
	const length = Math.hypot(to.x - from.x, to.y - from.y);
	return length < 1e-9 ? undefined : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/**
 * How far a segment's own control points stray from the line between its ends.
 * @param from Where it starts.
 * @param segment The segment.
 * @returns The distance, nothing for a straight run.
 */
function sagOf(from: Point, segment: Segment): number {
	if (segment.kind === "line") return 0;
	const chord = Math.hypot(segment.to.x - from.x, segment.to.y - from.y);
	return Math.max(
		...[segment.first, segment.second].map((point) =>
			Math.abs(
				((point.x - from.x) * (segment.to.y - from.y) -
					(point.y - from.y) * (segment.to.x - from.x)) /
					chord,
			),
		),
	);
}

/**
 * The frame one piece of a route is drawn in: its x axis lies along the piece's
 * chord, stretched to the piece's own length, so a unit along it is a unit of ink
 * and the light keeps in step across a bend.
 * @param from Where the piece starts.
 * @param to Where it ends.
 * @param length How long it is along its ink.
 * @returns The transform.
 */
function frameOf(from: Point, to: Point, length: number): string {
	const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
	const stretch = Math.hypot(to.x - from.x, to.y - from.y) / length;
	return (
		`translate(${coord(from.x)} ${coord(from.y)}) rotate(${plain(angle, 3)})` +
		(Math.abs(stretch - 1) < 1e-4 ? "" : ` scale(${plain(stretch, 5)} 1)`)
	);
}

/**
 * Cut a route into the pieces a beam is drawn on, each a straight run or one
 * bend, and give each its own frame.
 * @param curve The route.
 * @returns The pieces.
 */
function legsOf(curve: Curve): Leg[] {
	const legs: Leg[] = [];
	let along = 0;
	curve.segments.forEach((segment, index) => {
		const from = segmentStart(curve, index);
		const length = segmentLength(from, segment);
		if (length >= LEAST_PIECE && directionOf(from, segment.to) !== undefined) {
			const frame = frameOf(from, segment.to, length);
			legs.push({ from, segment, along, length, frame, sag: sagOf(from, segment) });
		}
		along += length;
	});
	return legs;
}

/**
 * The way a piece of a route leaves its start, or arrives at its end.
 * @param leg The piece.
 * @param end Which end: the way it arrives at its end, or the way it leaves its start.
 * @returns The unit direction.
 */
function tangentOf(leg: Leg, end: boolean): Point | undefined {
	const { from, segment } = leg;
	const ways =
		segment.kind === "cubic"
			? end
				? [directionOf(segment.second, segment.to), directionOf(segment.first, segment.to)]
				: [directionOf(from, segment.first), directionOf(from, segment.second)]
			: [];
	return ways.find((way) => way !== undefined) ?? directionOf(from, segment.to);
}

/**
 * One piece of a route as path data, run a hair past each end along the way the
 * route goes, so the masks of two pieces overlap rather than leave a seam.
 * @param leg The piece.
 * @returns The path data.
 */
function legPath(leg: Leg): string {
	const { from, segment } = leg;
	const start = tangentOf(leg, false) ?? { x: 0, y: 0 };
	const end = tangentOf(leg, true) ?? { x: 0, y: 0 };
	return (
		`M${coord(from.x - start.x * OVERLAP)},${coord(from.y - start.y * OVERLAP)} L` +
		pathOf({ from, segments: [segment] }).slice(1) +
		` L${coord(segment.to.x + end.x * OVERLAP)},${coord(segment.to.y + end.y * OVERLAP)}`
	);
}

export { legPath, legsOf, plain, routeLength, shortenedBy, type Leg };
