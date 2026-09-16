import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { along, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";
import {
	boxesOverlap,
	routeCrosses,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

const BASE = VariantContentSchema.parse({
	nodes: [
		{ id: "driver", name: "Render driver", kind: "module" },
		{ id: "layout", name: "Layout", kind: "module" },
		{ id: "paint", name: "Paint", kind: "module" },
	],
	edges: [
		{ id: "place", from: "driver", to: "layout", kind: "call", label: "place cards" },
		{ id: "draw", from: "layout", to: "paint", kind: "call", label: "paint drawing" },
	],
});

test("an unchanged proposal retains its predecessor geometry exactly", async () => {
	const before = await renderArchitecture({ content: BASE, theme: "light" });
	const after = await renderArchitecture({
		content: BASE,
		predecessors: [BASE, BASE],
		theme: "dark",
		standing: { layout: "removed", draw: "removed" },
	});
	expect(after.atlas).toEqual(before.atlas);
	expect(after.width).toBe(before.width);
	expect(after.height).toBe(before.height);
});

test("an inserted stage preserves the existing order and routes around every card", async () => {
	const proposal = VariantContentSchema.parse({
		...BASE,
		nodes: [...BASE.nodes, { id: "measure", name: "Measure cards", kind: "module" }],
		edges: [
			...BASE.edges,
			{ id: "prepare", from: "driver", to: "measure", kind: "call", label: "measure subjects" },
			{ id: "sizes", from: "measure", to: "layout", kind: "data", label: "measured sizes" },
		],
	});
	const drawing = await renderArchitecture({
		content: proposal,
		predecessors: [BASE],
		theme: "light",
	});
	const { nodes } = drawing.atlas;
	const direction = readingOf(drawing);
	expect(along(nodes["driver"]!, direction)).toBeLessThan(along(nodes["layout"]!, direction));
	expect(along(nodes["layout"]!, direction)).toBeLessThan(along(nodes["paint"]!, direction));
	for (const [id, box] of Object.entries(nodes)) {
		for (const [other, otherBox] of Object.entries(nodes)) {
			if (id !== other) expect(boxesOverlap(box, otherBox)).toBe(false);
		}
		for (const edge of proposal.edges) {
			if (edge.from === id || edge.to === id) continue;
			expect(routeCrosses(routePoints(drawing.svg).get(edge.id)!, box)).toBe(false);
		}
	}
});

test("an empty predecessor view gives its first subjects a normal complete layout", async () => {
	const plain = await renderArchitecture({ content: BASE, theme: "light" });
	const first = await renderArchitecture({
		content: BASE,
		predecessors: [VariantContentSchema.parse({})],
		theme: "light",
	});
	expect(first).toEqual(plain);
});

test("reused placement paints current words and keeps the room allocated by its predecessor", async () => {
	const before = VariantContentSchema.parse({
		nodes: [{ id: "card", name: "Architecture measurement and presentation", kind: "module" }],
	});
	const content = VariantContentSchema.parse({
		nodes: [{ id: "card", name: "Measure", kind: "module" }],
	});
	const baseline = await renderArchitecture({ content: before, theme: "light" });
	const proposal = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	expect(proposal.atlas.nodes).toEqual(baseline.atlas.nodes);
	expect(proposal.svg).toContain(">Measure</text>");
	expect(proposal.svg).not.toContain("Architecture measurement");
});

test("moving the last visible child gives its former container intrinsic card dimensions", async () => {
	const before = VariantContentSchema.parse({
		nodes: [
			{ id: "azure", name: "Azure", kind: "external" },
			{ id: "aws", name: "AWS", kind: "external" },
			{ id: "cluster", name: "Kubernetes", kind: "service", parent: "azure" },
			{ id: "api", name: "API", kind: "module", parent: "cluster" },
			{ id: "worker", name: "Worker", kind: "module", parent: "cluster" },
		],
		edges: [{ id: "calls", from: "api", to: "worker", kind: "call" }],
	});
	const after = structuredClone(before);
	after.nodes.find((node) => node.id === "cluster")!.parent = "aws";
	const expanded = await renderArchitecture({ content: before, theme: "light" });
	const intrinsic = await renderArchitecture({ content: after, theme: "light" });
	const proposal = await renderArchitecture({
		content: after,
		predecessors: [before],
		theme: "light",
	});
	expect(expanded.atlas.regions["azure"]).toBeDefined();
	expect(proposal.atlas.regions["azure"]).toBeUndefined();
	expect(proposal.atlas.nodes["azure"]!.width).toBe(intrinsic.atlas.nodes["azure"]!.width);
	expect(proposal.atlas.nodes["azure"]!.height).toBe(intrinsic.atlas.nodes["azure"]!.height);
	expect(proposal.atlas.regions["aws"]).toBeDefined();
});
