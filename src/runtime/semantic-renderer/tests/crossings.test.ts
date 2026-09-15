import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { bodyShift, roundBridges } from "./drawn-routes";
import cornerCrossing from "./corner-crossing.json";

// Complete bipartite connections cannot all be drawn without crossings. Equal
// node names keep text measurement from choosing a special-case layout.
const CROSSED = VariantContentSchema.parse({
	nodes: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id, name: id, kind: "service" })),
	edges: ["a", "b", "c"].flatMap((from) =>
		["x", "y", "z"].map((to) => ({ id: from + to, from, to, kind: "call", traffic: {} })),
	),
});

test("a crossing beside a rounded turn bridges whichever route has room", async () => {
	const [before, content] = cornerCrossing.map((value) => VariantContentSchema.parse(value));
	const drawing = await renderArchitecture({
		content: content!,
		predecessors: [before!],
		theme: "dark",
	});
	const lines = routes(drawing.svg);
	const pair = ["eKqUHYSH", "I1lGjMES"].map((id) => lines.find((line) => line.id === id)!);
	const cutouts = masks(drawing.svg);
	expect(
		pair.some((lower, index) =>
			(cutouts.get(lower.mask ?? "") ?? []).some((cutout) => {
				const span = cutout.path.replace(/^M/u, "L");
				return (
					roundBridges(` ${span}`).length === 1 &&
					pair[1 - index]!.paths.every((path) => path.includes(span))
				);
			}),
		),
	).toBe(true);
});

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
			paths: [
				...group[3]!.replace(/<defs>[\s\S]*?<\/defs>/gu, "").matchAll(/<path[^>]* d="([^"]+)"/gu),
			].map((path) => path[1]!),
		}));
}

/** Read the local bridge cutouts and their clearance widths. */
function masks(svg: string) {
	return new Map(
		[...svg.matchAll(/<mask id="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/gu)].map((mask) => [
			mask[1]!,
			[
				...mask[2]!.matchAll(/<path d="([^"]+)"[^>]*stroke="black"[^>]*stroke-width="([^"]+)"/gu),
			].map((path) => ({ path: path[1]!, width: Number(path[2]) })),
		]),
	);
}

test("round bridges share one curve and narrowly clear the ink beneath them", async () => {
	const light = await renderArchitecture({ content: CROSSED, theme: "light" });
	const dark = await renderArchitecture({ content: CROSSED, theme: "dark" });
	const lines = routes(light.svg);
	const shift = bodyShift(light.svg);
	const cutouts = masks(light.svg);
	expect(lines).toHaveLength(9);
	let crossings = 0;
	for (const upper of lines) {
		// The only route paths are line, halo and traffic: no background patch.
		expect(upper.paths).toHaveLength(3);
		expect(new Set(upper.paths).size).toBe(1);
		for (const bridge of roundBridges(upper.paths[0]!)) {
			crossings += 1;
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
	expect(crossings).toBeGreaterThan(1);
	expect(masks(dark.svg)).toEqual(cutouts);
	expect(routes(dark.svg)).toEqual(lines);
	expect(dark.atlas).toEqual(light.atlas);
	expect((await renderArchitecture({ content: CROSSED, theme: "light" })).svg).toBe(light.svg);
});

test("fan-in and fan-out connections do not acquire false crossing bridges", async () => {
	for (const pair of [
		{ from: "a", to: "c" },
		{ from: "c", to: "b" },
	]) {
		const content = VariantContentSchema.parse({
			nodes: ["a", "b", "c"].map((id) => ({ id, name: id, kind: "service" })),
			edges: [
				{ id: "ab", from: "a", to: "b", kind: "call" },
				{ id: "other", ...pair, kind: "call" },
			],
		});
		const drawn = await renderArchitecture({ content, theme: "light" });
		expect(routes(drawn.svg)).toHaveLength(2);
		expect(masks(drawn.svg).size).toBe(0);
		expect(routes(drawn.svg).flatMap((route) => roundBridges(route.paths[0]!))).toEqual([]);
		expect(routes(drawn.svg).every((route) => route.mask === undefined)).toBe(true);
	}
});
