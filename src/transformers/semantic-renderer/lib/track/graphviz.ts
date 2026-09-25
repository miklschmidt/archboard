// What Graphviz answers, read into diagram coordinates: the JSON a layout
// returns, its boxes in inches, and its polylines and centres in points.
import type { Graph } from "@viz-js/viz";
import { z } from "zod";

/** A point in diagram coordinates. */
type Point = { readonly x: number; readonly y: number };

const objectSchema = z.object({
	name: z.string(),
	bb: z.string().optional(),
	pos: z.string().optional(),
});
const edgeSchema = z.object({
	id: z.string().optional(),
	tail: z.number(),
	head: z.number(),
	pos: z.string().optional(),
});
const outputSchema = z.object({
	bb: z.string(),
	objects: z.array(objectSchema).default([]),
	edges: z.array(edgeSchema).default([]),
});
type Output = z.infer<typeof outputSchema>;

/**
 * A fixed-size Graphviz box in its inch units.
 * @param name The vendor identity.
 * @param width Its width in diagram points.
 * @param height Its height in diagram points.
 * @returns The vendor node.
 */
function box(name: string, width: number, height: number): NonNullable<Graph["nodes"]>[number] {
	return { name, attributes: { width: width / 72, height: height / 72 } };
}

/**
 * Finite numbers from Graphviz's comma-separated geometry.
 * @param value The serialized point or bounds.
 * @returns The numbers.
 * @throws {Error} When Graphviz answered a coordinate that is not a number.
 */
function numbers(value: string): number[] {
	const parsed = value.split(",").map(Number);
	if (parsed.some((number) => !Number.isFinite(number)))
		throw new Error("Graphviz returned non-finite geometry");
	return parsed;
}

/**
 * The polyline points of a Graphviz edge, without its arrow markers.
 * @param pos The edge's serialized spline.
 * @param origin Where the drawing starts.
 * @returns Its points in diagram coordinates.
 */
function polylinePoints(pos: string, origin: Point): string[] {
	return pos
		.split(" ")
		.filter((token) => !token.startsWith("e,") && !token.startsWith("s,"))
		.map((token) => {
			const [x, y] = numbers(token);
			return `${x! - origin.x},${y! - origin.y}`;
		});
}

/**
 * Every vendor node's centre in diagram coordinates.
 * @param output What Graphviz answered.
 * @param origin Where the drawing starts.
 * @returns The centres by vendor name.
 */
function centresOf(output: Output, origin: Point): Map<string, Point> {
	const centres = new Map<string, Point>();
	for (const object of output.objects) {
		if (object.pos === undefined) continue;
		const [x, y] = numbers(object.pos);
		centres.set(object.name, { x: x! - origin.x, y: y! - origin.y });
	}
	return centres;
}

export { box, centresOf, numbers, outputSchema, polylinePoints, type Output };
