import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { bodyShift, roundBridges } from "#tests/runtime/support/drawn-routes.ts";

// Complete bipartite connections cannot all be drawn without crossings. Equal
// node names keep text measurement from choosing a special-case layout.
const CROSSED = orderedFixture({
	nodes: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id, name: id, kind: "service" })),
	edges: ["a", "b", "c"].flatMap((from) =>
		["x", "y", "z"].map((to) => ({ id: from + to, from, to, kind: "call", traffic: {} })),
	),
});

/**
 * A relationship's traffic layer, painted apart from its line.
 * @param svg The drawing.
 * @param id The relationship.
 * @returns The layer's markup, or nothing for a line without traffic.
 */
function trafficOf(svg: string, id: string): string {
	return (svg.split(`data-traffic="${id}"`)[1] ?? "").split(/data-(?:semantic-id|traffic)=/u)[0]!;
}

/** Read only the route groups, excluding separately painted relationship words. */
function routes(svg: string) {
	return [
		...svg.matchAll(
			/<g data-semantic-kind="edge" data-semantic-id="([^"]+)"([^>]*)>([\s\S]*?)<\/g>/gu,
		),
	]
		.filter((group) => group[3]?.includes('class="ab-halo"'))
		.map((group) => ({
			id: group[1]!,
			width: Number(
				/stroke-width="([^"]+)"/u.exec(/<path[^>]*marker-end=[^>]*>/u.exec(group[3]!)![0])![1],
			),
			mask: /mask="url\(#([^)]*)\)"/u.exec(group[2]!)?.[1],
			// Every curve the line draws, once each: its line and its halo ride one curve.
			paths: [
				...new Set(
					[
						...group[3]!
							.replace(/<defs>[\s\S]*?<\/defs>/gu, "")
							.split(/<g class="ab-(?:pulse|near|port)[ "]/u)[0]!
							.matchAll(/<path[^>]* d="([^"]+)"/gu),
					].map((path) => path[1]!),
				),
			],
			// The curves its traffic rides: the narrow layers of its masks, which run into the next piece.
			rides: [
				...new Set(
					[...trafficOf(svg, group[1]!).matchAll(/<path d="([^"]+)"[^>]*stroke="#ffffff"/gu)].map(
						(path) => path[1]!,
					),
				),
			],
			// The line's own paths; its traffic is painted apart, over every line, and
			// the ports its ends run into are drawn near only, after them.
			own: [
				...group[3]!
					.replace(/<defs>[\s\S]*?<\/defs>/gu, "")
					.split(/<g class="ab-(?:pulse|near|port)[ "]/u)[0]!
					.matchAll(/<path[^>]* d="([^"]+)"/gu),
			].length,
		}));
}

/** Read the local bridge cutouts and their clearance widths. */
function masks(svg: string) {
	return new Map(
		[...svg.matchAll(/<mask id="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/gu)].map((mask) => [
			mask[1]!,
			[
				...mask[2]!.matchAll(
					/<path d="([^"]+)"[^>]*stroke(?:="|:)black[^>]*stroke-width="([^"]+)"/gu,
				),
			].map((path) => ({ path: path[1]!, width: Number(path[2]) })),
		]),
	);
}

/**
 * The points a path's commands end on, its start included.
 * @param d The path data.
 * @returns The points.
 */
function endsOf(d: string): { x: number; y: number }[] {
	return [...d.matchAll(/([MLC])([^MLC]+)/gu)].map(([, , numbers]) => {
		const values = numbers!.trim().split(/[ ,]+/u).map(Number);
		return { x: values.at(-2)!, y: values.at(-1)! };
	});
}

/**
 * Whether a cutout lies on a route's drawn ink: every point its commands end
 * on is on the route's path, either one of its points or on a straight piece
 * between two of them.
 * @param cutout The cutout's path data.
 * @param route The route's path data.
 * @returns True when it does.
 */
function follows(cutout: string, route: string): boolean {
	const points = endsOf(route);
	return endsOf(cutout).every((point) =>
		points.some((from, index) => {
			const to = points[index + 1] ?? from;
			const length = Math.hypot(to.x - from.x, to.y - from.y);
			const t =
				length === 0
					? 0
					: Math.min(
							1,
							Math.max(
								0,
								((point.x - from.x) * (to.x - from.x) + (point.y - from.y) * (to.y - from.y)) /
									length ** 2,
							),
						);
			const x = from.x + (to.x - from.x) * t;
			const y = from.y + (to.y - from.y) * t;
			return Math.hypot(point.x - x, point.y - y) < 0.05;
		}),
	);
}

test("crossing clearances share the drawn curve and narrowly clear the ink beneath them", async () => {
	const light = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: CROSSED,
		theme: "light",
	});
	const dark = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: CROSSED,
		theme: "dark",
	});
	const lines = routes(light.svg);
	const shift = bodyShift(light.svg);
	const cutouts = masks(light.svg);
	expect(lines).toHaveLength(9);
	let crossings = 0;
	for (const cutout of [...cutouts.values()].flat()) {
		const upper = lines.find((route) => follows(cutout.path, route.paths[0]!));
		expect(upper, "a cutout follows existing upper-route ink").toBeDefined();
		// Narrow beneath an arc. A line is cut with no arc over it only beside a
		// join, wide enough to clear the join's mark as well (its radius, the
		// line's width and 1.6, and the gap, 3, on each side).
		const cut = /^M[-\d.,]+ L[-\d.,]+$/u.test(cutout.path);
		const extra = cutout.width - upper!.width;
		const allowed = cut ? [upper!.width + 2 * (1.6 + 3)] : [3];
		expect(
			allowed.some((width) => Math.abs(extra - width) < 1e-5),
			`${extra}`,
		).toBe(true);
		crossings += 1;
	}
	for (const upper of lines) {
		// The line and its halo: no background patch, and both on the same drawn
		// curve. Its traffic rides that curve too, a piece at a time, stopping short of
		// the head: every piece but the last is a piece of the line itself.
		expect(upper.own).toBe(2);
		expect(upper.paths).toHaveLength(1);
		for (const ride of upper.rides.slice(0, -1)) {
			const piece = ride.replace(/^M[-\d.,]+ L/u, "").replace(/ L[-\d.,]+$/u, "");
			expect(upper.paths[0]!).toContain(piece);
		}
		for (const bridge of roundBridges(upper.paths[0]!)) {
			const localCurve = bridge.span.trim().replace(/^L/u, "M");
			const matchingCutouts = lines
				.filter((lower) => lower.id !== upper.id)
				.flatMap((lower) =>
					lower.mask === undefined
						? []
						: (cutouts.get(lower.mask) ?? []).filter((cutout) => cutout.path === localCurve),
				);
			expect(matchingCutouts.length, "the bridge clears the crossed connection").toBeGreaterThan(0);
			for (const cutout of matchingCutouts) {
				expect(cutout.width - upper.width).toBeCloseTo(3, 5);
			}
			const box = light.atlas.edges[upper.id]!;
			for (const point of bridge.points) {
				expect(point.x + shift.x).toBeGreaterThanOrEqual(box.x - 0.01);
				expect(point.x + shift.x).toBeLessThanOrEqual(box.x + box.width + 0.01);
				expect(point.y + shift.y).toBeGreaterThanOrEqual(box.y - 0.01);
				expect(point.y + shift.y).toBeLessThanOrEqual(box.y + box.height + 0.01);
			}
		}
	}
	// K3,3 may cross on straight runs or meet at rounded corners. Either
	// contact must have a visible overpass, without dictating native routing.
	expect(crossings).toBeGreaterThan(0);
	expect(masks(dark.svg)).toEqual(cutouts);
	expect(routes(dark.svg)).toEqual(lines);
	expect(dark.atlas).toEqual(light.atlas);
	expect(
		(
			await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content: CROSSED,
				theme: "light",
			})
		).svg,
	).toBe(light.svg);
});

test("fan-in and fan-out connections do not acquire false crossing bridges", async () => {
	for (const pair of [
		{ from: "a", to: "c" },
		{ from: "c", to: "b" },
	]) {
		const content = orderedFixture({
			nodes: ["a", "b", "c"].map((id) => ({ id, name: id, kind: "service" })),
			edges: [
				{ id: "ab", from: "a", to: "b", kind: "call" },
				{ id: "other", ...pair, kind: "call" },
			],
		});
		const drawn = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
		});
		expect(routes(drawn.svg)).toHaveLength(2);
		expect(masks(drawn.svg).size).toBe(0);
		expect(routes(drawn.svg).flatMap((route) => roundBridges(route.paths[0]!))).toEqual([]);
		expect(routes(drawn.svg).every((route) => route.mask === undefined)).toBe(true);
	}
});

/**
 * Whether a value lies between two others, in either order.
 * @param value The value.
 * @param a One bound.
 * @param b The other.
 * @returns True when it does.
 */
function inside(value: number, a: number, b: number): boolean {
	return value >= Math.min(a, b) - 0.01 && value <= Math.max(a, b) + 0.01;
}

/**
 * Whether a mask cuts out a point: a straight cutout of the mask covers it
 * within half its width, or a cut-out box holds it.
 * @param svg The drawn document.
 * @param mask The mask's id.
 * @param point The point.
 * @returns True when the mask hides it.
 */
function hides(svg: string, mask: string | undefined, point: { x: number; y: number }): boolean {
	const body = new RegExp(`<mask id="${mask}"[^>]*>([\\s\\S]*?)</mask>`, "u").exec(svg)?.[1] ?? "";
	const lines = [
		...body.matchAll(
			/<path d="M([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+)"[^>]*stroke-width="([^"]+)"/gu,
		),
	].some(([, x1, y1, x2, y2, width]) => {
		const [ax, ay, bx, by] = [x1, y1, x2, y2].map(Number) as [number, number, number, number];
		const half = Number(width) / 2;
		return ay === by
			? inside(point.x, ax, bx) && Math.abs(point.y - ay) <= half
			: inside(point.y, ay, by) && Math.abs(point.x - ax) <= half;
	});
	const boxes = [
		...body.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" rx=/gu),
	].some(([, x, y, width, height]) => {
		const [left, top] = [Number(x), Number(y)];
		return (
			point.x >= left &&
			point.x <= left + Number(width) &&
			point.y >= top &&
			point.y <= top + Number(height)
		);
	});
	return lines || boxes;
}

// Graphviz, Track and Blocks: routes of one kind on one trunk each drew their
// own stroke, dash pattern and arrowhead over it, a doubled or solid line.
test("routes sharing a trunk draw its ink once: one line, one dash pattern, one arrowhead", async () => {
	const content = orderedFixture({
		nodes: ["a", "b", "c", "t"].map((id) => ({ id, name: id.toUpperCase(), kind: "service" })),
		edges: ["a", "b", "c"].map((from) => ({ id: `${from}t`, from, to: "t", kind: "event" })),
	});
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const drawn = routes(svg);
	const ends = drawn.map((route) => endsOf(route.paths[0]!).slice(-2));
	// The fixture's precondition: all three arrive down one shared last stretch.
	for (const [before, end] of ends) {
		expect(end).toEqual(ends[0]![1]!);
		expect(before!.x).toBe(end!.x);
	}
	const [, end] = ends[0]!;
	const onTrunk = { x: end!.x, y: end!.y - 5 };
	expect(drawn.filter((route) => !hides(svg, route.mask, onTrunk))).toHaveLength(1);
});

// Blocks and Graphviz: a removed relationship's label is drawn see-through,
// and its own line struck through its words.
test("no line shows through a removed relationship's label", async () => {
	const content = orderedFixture({
		nodes: ["a", "b"].map((id) => ({ id, name: id.toUpperCase(), kind: "service" })),
		edges: [{ id: "ab", from: "a", to: "b", kind: "call", label: "reads rows" }],
	});
	for (const standing of [{}, { ab: "removed" as const }]) {
		const drawn = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			standing,
		});
		const label =
			/<g data-semantic-kind="edge" data-semantic-id="ab"[^>]*>\s*<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/u.exec(
				drawn.svg,
			)!;
		const middle = {
			x: Number(label[1]) + Number(label[3]) / 2,
			y: Number(label[2]) + Number(label[4]) / 2,
		};
		const [line] = routes(drawn.svg);
		// An opaque label hides its line itself; a see-through one has it cut away.
		expect(hides(drawn.svg, line!.mask, middle)).toBe("ab" in standing);
	}
});

// Work vault: a kind the vault draws dashed but the default policy does not
// know was judged solid, and rose over solid lines with an arc that barely
// showed.
test("the crossing pass reads each line's dash from the vault's own policy", async () => {
	const content = structuredClone(CROSSED);
	for (const edge of content.edges) if (edge.from === "a") edge.kind = "stream";
	/**
	 * How many lines a stream line hops, with the stream kind drawn one way: a
	 * hop is a piece of the mask of the line beneath it, with an arc in it,
	 * that starts on the line that hops.
	 * @param dash How the vault draws a stream.
	 * @returns The count.
	 */
	const streamHops = async (dash: "solid" | "dashed"): Promise<number> => {
		const policy = {
			...DEFAULT_SEMANTIC_POLICY,
			relationshipKinds: {
				...DEFAULT_SEMANTIC_POLICY.relationshipKinds,
				stream: { name: "Stream", dash, arrowhead: "open" as const },
			},
		};
		const { svg } = await renderArchitecture({ content, theme: "light", layout: "track", policy });
		const pieces = new Map(
			[...svg.matchAll(/<mask id="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/gu)].map((match) => [
				match[1]!,
				[...match[2]!.matchAll(/<path[^>]* d="(M[-\d.]+,[-\d.]+)[^"]*C[^"]*"/gu)].map(([, start]) =>
					start!.slice(1),
				),
			]),
		);
		const lines = routes(svg);
		return lines
			.filter(({ id }) => !id.startsWith("a"))
			.flatMap(({ mask }) => pieces.get(mask ?? "") ?? [])
			.filter((start) =>
				lines.some(({ id, paths }) => id.startsWith("a") && paths[0]!.includes(start)),
			).length;
	};
	// Drawn dashed, a stream line rises over a solid call only where nothing else
	// stands, so it hops fewer of them than drawn solid.
	const [solid, dashed] = [await streamHops("solid"), await streamHops("dashed")];
	expect(solid).toBeGreaterThan(0);
	expect(dashed).toBeLessThan(solid);
});

// Reported from use: traffic on a line that joins lines without traffic
// stopped at the junction, where the shared stretch is drawn by one of the
// others and the rest are masked away.
test("traffic on a joined line runs on past the junction to its card", async () => {
	const content = orderedFixture({
		nodes: ["a", "b", "c", "t"].map((id) => ({ id, name: id.toUpperCase(), kind: "service" })),
		edges: [
			{ id: "at", from: "a", to: "t", kind: "event" },
			{ id: "bt", from: "b", to: "t", kind: "event", traffic: {} },
			{ id: "ct", from: "c", to: "t", kind: "event" },
		],
	});
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const layers = [...svg.matchAll(/data-traffic="([^"]+)"/gu)];
	expect(layers.map((layer) => layer[1])).toEqual(["bt"]);
	// Painted in a layer of its own after the last line, so no line's mask cuts it.
	expect(layers[0]!.index).toBeGreaterThan(svg.lastIndexOf("marker-end"));
});
