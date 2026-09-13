import { describe, expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	distanceToFrame,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

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
			for (const [point, id] of endpoints) {
				const box = drawing.atlas.nodes[id];
				expect(point).toBeDefined();
				expect(box).toBeDefined();
				if (point === undefined || box === undefined) throw new Error(`Missing endpoint ${id}`);
				expect(distanceToFrame(point, box)).toBeLessThan(0.02);
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
