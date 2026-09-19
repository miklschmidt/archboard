import { describe, expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { measureArchitecture } from "@/runtime/semantic-renderer/measurement";
import {
	distanceToFrame,
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import {
	across,
	along,
	breadth,
	depth,
	faceOf,
} from "@/runtime/semantic-renderer/tests/drawn-reading";

const NESTED = VariantContentSchema.parse({
	nodes: [
		{ id: "outer", name: "System", kind: "service" },
		{ id: "entry", name: "Entry point", kind: "module", parent: "outer" },
		{ id: "inner", name: "Nested service", kind: "service", parent: "outer" },
		{ id: "worker", name: "Worker", kind: "module", parent: "inner" },
		{ id: "sink", name: "Storage", kind: "datastore" },
	],
	edges: [
		{ id: "begin", from: "outer", to: "entry", kind: "call", label: "accept request" },
		{ id: "nested", from: "entry", to: "worker", kind: "call", label: "dispatch work" },
		{ id: "report", from: "worker", to: "inner", kind: "event", label: "report status" },
		{ id: "write", from: "worker", to: "sink", kind: "data", label: "persist result" },
	],
});

describe("compound architecture layout", () => {
	test("boundary routes avoid cards around nested content", async () => {
		const content = VariantContentSchema.parse({
			nodes: [
				...NESTED.nodes,
				{ id: "added", name: "Additional processing", kind: "module", parent: "inner" },
			],
			edges: [
				...NESTED.edges,
				{ id: "newedge", from: "worker", to: "added", kind: "call" },
				{ id: "newout", from: "added", to: "sink", kind: "call" },
			],
		});
		const drawing = await renderArchitecture({ content, theme: "light" });
		const routes = routePoints(drawing.svg);
		for (const edge of content.edges) {
			for (const id of ["entry", "worker", "added", "sink"]) {
				if (id === edge.from || id === edge.to) continue;
				expect(routeCrosses(routes.get(edge.id)!, drawing.atlas.nodes[id]!)).toBe(false);
			}
		}
	});

	test("ancestor and cross-container routes attach to their own semantic endpoints", async () => {
		const drawing = await renderArchitecture({ content: NESTED, theme: "light" });
		const routes = routePoints(drawing.svg);
		expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
			NESTED.nodes.map((node) => node.id).toSorted(),
		);
		expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
			NESTED.edges.map((edge) => edge.id).toSorted(),
		);
		expect([...routeLabels(drawing.svg).keys()].toSorted()).toEqual(
			NESTED.edges.map((edge) => edge.id).toSorted(),
		);
		for (const edge of NESTED.edges) {
			const points = routes.get(edge.id);
			const endpoints = [
				[points?.[0], edge.from],
				[points?.at(-1), edge.to],
			] as const;
			// A frame and its own descendant connect at the visible title divider;
			// external relationships touch the card or frame outline.
			for (const [point, id] of endpoints) {
				const box = drawing.atlas.nodes[id];
				expect(point).toBeDefined();
				expect(box).toBeDefined();
				if (point === undefined || box === undefined) throw new Error(`Missing endpoint ${id}`);
				const other = id === edge.from ? edge.to : edge.from;
				if (ancestorsOf(other).includes(id)) {
					const header = measureArchitecture(NESTED).nodes.get(id)!.headerHeight;
					expect(point.y).toBeCloseTo(box.y + header, 1);
				} else expect(distanceToFrame(point, box)).toBeLessThan(0.02);
				expect(point.x).toBeGreaterThanOrEqual(box.x - 0.02);
				expect(point.x).toBeLessThanOrEqual(box.x + box.width + 0.02);
				expect(point.y).toBeGreaterThanOrEqual(box.y - 0.02);
				expect(point.y).toBeLessThanOrEqual(box.y + box.height + 0.02);
			}
		}
	});

	test("concurrent requests on the layout worker retain deterministic independent drawings", async () => {
		const other = VariantContentSchema.parse({
			nodes: [{ id: "solo", name: "Another board", kind: "module" }],
		});
		const [first, separate, concurrent] = await Promise.all([
			renderArchitecture({ content: NESTED, theme: "light" }),
			renderArchitecture({ content: other, theme: "dark" }),
			renderArchitecture({ content: NESTED, theme: "light" }),
		]);
		expect(first).toEqual(concurrent);
		expect(Object.keys(separate.atlas.nodes)).toEqual(["solo"]);
		expect(separate.atlas.edges).toEqual({});
		const subsequent = await renderArchitecture({ content: NESTED, theme: "light" });
		expect(subsequent).toEqual(first);
	});
});

/**
 * Every frame a node sits inside, nearest first.
 * @param id The node.
 * @returns Its ancestors' ids.
 */
function ancestorsOf(id: string): string[] {
	const found: string[] = [];
	let at = NESTED.nodes.find((node) => node.id === id)?.parent;
	while (at !== undefined) {
		found.push(at);
		at = NESTED.nodes.find((node) => node.id === at)?.parent;
	}
	return found;
}

test("a container's external dependency ahead leaves its forward perimeter", async () => {
	const content = VariantContentSchema.parse({
		nodes: [
			{ id: "frame", name: "Service", kind: "service" },
			{ id: "one", name: "Worker one", kind: "module", parent: "frame" },
			{ id: "two", name: "Worker two", kind: "module", parent: "frame" },
			{ id: "store", name: "Storage", kind: "datastore" },
		],
		edges: [{ id: "write", from: "frame", to: "store", kind: "data" }],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });

	const frame = drawing.atlas.nodes["frame"]!;
	const target = drawing.atlas.nodes["store"]!;
	// Establish the visible geometry that makes the forward face appropriate,
	// whichever reading the renderer selected; no coordinates or ranks are fixed.
	expect(along(target)).toBeGreaterThan(along(frame) + depth(frame));
	const targetCenter = across(target) + breadth(target) / 2;
	expect(targetCenter).toBeGreaterThan(across(frame));
	expect(targetCenter).toBeLessThan(across(frame) + breadth(frame));
	const origin = routePoints(drawing.svg).get("write")![0]!;
	// A title-band-only router forces this ordinary dependency out a header flank.
	// The actual frame perimeter is the container's external connection boundary.
	expect(faceOf(origin, frame)).toBe("ahead");
});
