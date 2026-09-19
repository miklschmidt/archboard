import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	bodyShift,
	corridorPoints,
	roundBridges,
	routeLabels,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

test("a new top-entry route preserves room to bridge the crossing beside its first corner", async () => {
	// Three west ports are 18px apart. The usual 14px corner leaves too little
	// straight route for this crossing's 7px bridge and 3px clearance.
	const before = VariantContentSchema.parse({
		nodes: [
			["y8vuJJKu", "Region builder"],
			["Y0smyqtZ", "Architecture layout"],
			["L51bfquE", "Edge routing"],
			["J3yMo4ag", "Measured text"],
			["u1OXg3Yy", "Theme palette"],
			["J7mPrUeP", "SVG painters"],
		].map(([id, name]) => ({ id, name, kind: "function" })),
		edges: [
			["v3e9dOLe", "y8vuJJKu", "Y0smyqtZ", "visible regions", "data"],
			["qJrkH2Qg", "Y0smyqtZ", "L51bfquE", "route relationships", "call"],
			["Wn0XA35I", "Y0smyqtZ", "J3yMo4ag", "size cards", "call"],
			["neQc1gXi", "L51bfquE", "J3yMo4ag", "fit labels", "call"],
			["SIdU2g2Q", "Y0smyqtZ", "J7mPrUeP", "placed architecture", "data"],
			["0s8raCUw", "L51bfquE", "J7mPrUeP", "routed edges", "data"],
			["I1lGjMES", "u1OXg3Yy", "J7mPrUeP", "literal colors", "data"],
		].map(([id, from, to, label, kind]) => ({ id, from, to, label, kind })),
	});
	const content = VariantContentSchema.parse({
		nodes: [
			{ ...before.nodes[0], name: "Layout graph" },
			{ ...before.nodes[1], name: "Compound layout" },
			before.nodes[3],
			before.nodes[4],
			before.nodes[5],
			before.nodes[2],
		],
		edges: [
			{ ...before.edges[0], label: "compound graph" },
			before.edges[6],
			{
				id: "6zcjVgzh",
				from: "Y0smyqtZ",
				to: "J7mPrUeP",
				kind: "data",
				label: "complete placed drawing",
				emphasis: "hero",
			},
			...before.edges.slice(1, 6),
		],
	});

	const drawing = await renderArchitecture({ content, theme: "light" });
	// Every proper perpendicular crossing with room for a bridge carries one.
	const corridors = corridorPoints(drawing.svg);
	const crossings = perpendicularCrossings(corridors).filter((crossing) =>
		bridgeHasRoom(crossing, corridors, drawing),
	);
	expect(crossings.length, "the reduction still crosses somewhere").toBeGreaterThan(0);
	const shift = bodyShift(drawing.svg);
	const bridges = new Map(
		[
			...drawing.svg.matchAll(
				/<g data-semantic-kind="edge" data-semantic-id="([^"]+)"[^>]*>([\s\S]*?)<\/g>/gu,
			),
		]
			.map((group) => {
				const path = /<path[^>]*\sd="([^"]*)"[^>]*marker-end=/u.exec(group[2]!)?.[1];
				return [group[1]!, path === undefined ? [] : roundBridges(path)] as const;
			})
			.filter(([, found]) => found.length > 0),
	);
	for (const crossing of crossings) {
		const x = crossing.x - shift.x,
			y = crossing.y - shift.y;
		const bridged = crossing.routes.some((id) =>
			(bridges.get(id) ?? []).some((bridge) => {
				const first = bridge.points[0]!,
					last = bridge.points.at(-1)!;
				return (
					(first.y === last.y &&
						Math.abs(first.y - y) < 0.01 &&
						x > Math.min(first.x, last.x) &&
						x < Math.max(first.x, last.x)) ||
					(first.x === last.x &&
						Math.abs(first.x - x) < 0.01 &&
						y > Math.min(first.y, last.y) &&
						y < Math.max(first.y, last.y))
				);
			}),
		);
		expect(
			bridged,
			`the crossing of ${crossing.routes.join(" and ")} at ${x},${y} has a bridge`,
		).toBe(true);
	}
});

/** The bridge's footprint: its radius (7) and clearance (3) each side of the crossing. */
const FOOTPRINT = 10;

/**
 * Whether the bridge rule would bridge a crossing: nothing else within its
 * footprint, since a bridge touching a card, a label or another route's ink is
 * refused and the crossing left flat (lib/layout/crossings.ts).
 * @param crossing The crossing.
 * @param corridors Every route without its bridges.
 * @param drawing The drawing, for its cards and labels.
 * @returns True when a bridge has room.
 */
function bridgeHasRoom(
	crossing: Crossing,
	corridors: ReadonlyMap<string, readonly { x: number; y: number }[]>,
	drawing: {
		readonly svg: string;
		readonly atlas: {
			readonly nodes: Record<string, { x: number; y: number; width: number; height: number }>;
		};
	},
): boolean {
	const near = (box: { x: number; y: number; width: number; height: number }) =>
		crossing.x > box.x - FOOTPRINT &&
		crossing.x < box.x + box.width + FOOTPRINT &&
		crossing.y > box.y - FOOTPRINT &&
		crossing.y < box.y + box.height + FOOTPRINT;
	if (Object.values(drawing.atlas.nodes).some(near)) return false;
	if ([...routeLabels(drawing.svg).values()].some(near)) return false;
	// A crossing on a rounded corner (radius up to 14) is on an arc, not a run.
	const onCorner = crossing.routes.some((id) =>
		(corridors.get(id) ?? [])
			.slice(1, -1)
			.some((corner) => Math.hypot(corner.x - crossing.x, corner.y - crossing.y) < 14 + FOOTPRINT),
	);
	if (onCorner) return false;
	return ![...corridors].some(
		([id, points]) =>
			!crossing.routes.includes(id) &&
			points.slice(1).some((end, index) => {
				const start = points[index]!;
				return near({
					x: Math.min(start.x, end.x),
					y: Math.min(start.y, end.y),
					width: Math.abs(end.x - start.x),
					height: Math.abs(end.y - start.y),
				});
			}),
	);
}

/** A point where one route's straight run crosses another's at a right angle. */
interface Crossing {
	readonly x: number;
	readonly y: number;
	readonly routes: readonly [string, string];
}

/** One axis-aligned run of a route, and whether it is the route's first or last. */
interface Run {
	readonly id: string;
	readonly start: { readonly x: number; readonly y: number };
	readonly end: { readonly x: number; readonly y: number };
	readonly first: boolean;
	readonly last: boolean;
}

/**
 * Whether a coordinate lies strictly inside a run, past the straight approach
 * (12) at a route's own start or end, where the bridge rule leaves room for
 * the departure and the arrowhead.
 * @param run The run.
 * @param along The coordinate along it.
 * @param from The run's start coordinate.
 * @param to The run's end coordinate.
 * @returns True for a proper interior crossing.
 */
function inside(run: Run, along: number, from: number, to: number): boolean {
	const startMargin = run.first ? 12 : 0.01;
	const endMargin = run.last ? 12 : 0.01;
	const [low, lowMargin, high, highMargin] =
		from < to ? [from, startMargin, to, endMargin] : [to, endMargin, from, startMargin];
	return along > low + lowMargin && along < high - highMargin;
}

/**
 * Every proper perpendicular crossing between two routes' axis-aligned runs.
 * @param routes Each route's bend points, by relationship id.
 * @returns The crossings.
 */
function perpendicularCrossings(
	routes: ReadonlyMap<string, readonly { x: number; y: number }[]>,
): Crossing[] {
	const runs: Run[] = [...routes].flatMap(([id, points]) =>
		points.slice(1).flatMap((end, index) => {
			const start = points[index]!;
			return start.x === end.x || start.y === end.y
				? [{ id, start, end, first: index === 0, last: index === points.length - 2 }]
				: [];
		}),
	);
	const found: Crossing[] = [];
	for (const one of runs) {
		for (const other of runs) {
			if (one.id >= other.id) continue;
			const horizontal = one.start.y === one.end.y ? one : other;
			const vertical = one.start.y === one.end.y ? other : one;
			if (horizontal.start.y !== horizontal.end.y || vertical.start.x !== vertical.end.x) continue;
			const x = vertical.start.x,
				y = horizontal.start.y;
			if (
				inside(horizontal, x, horizontal.start.x, horizontal.end.x) &&
				inside(vertical, y, vertical.start.y, vertical.end.y)
			)
				found.push({ x, y, routes: [one.id, other.id] });
		}
	}
	return found;
}
