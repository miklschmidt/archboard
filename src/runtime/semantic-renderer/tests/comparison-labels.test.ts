import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("comparison labels retain their shared row and horizontal run when a connection is added", async () => {
	// Reduced from the Semantic renderer comparison: the added top-entry port
	// used to squeeze the inherited horizontal label onto a vertical staircase,
	// while the longer flank moved its label away from its original shared row.
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
	for (const drawing of [
		await renderArchitecture({ content: before, theme: "light" }),
		await renderArchitecture({ content, predecessors: [before], theme: "light" }),
	]) {
		const labels = routeLabels(drawing.svg);
		expect(labels.get("Wn0XA35I")!.y).toBe(labels.get("qJrkH2Qg")!.y);
		const label = labels.get("0s8raCUw")!,
			points = routePoints(drawing.svg).get("0s8raCUw")!;
		expect(
			points.slice(1).some((end, index) => {
				const start = points[index]!;
				return (
					start.y === end.y &&
					Math.abs(start.y - label.y - label.height / 2) < 0.01 &&
					Math.min(start.x, end.x) <= label.x &&
					Math.max(start.x, end.x) >= label.x + label.width
				);
			}),
		).toBe(true);
	}
});
