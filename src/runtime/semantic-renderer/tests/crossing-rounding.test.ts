import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	bodyShift,
	roundBridges,
	routePoints,
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

	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const points = routePoints(drawing.svg);
	const crossing = { x: points.get("6zcjVgzh")!.at(-1)!.x, y: points.get("SIdU2g2Q")![0]!.y };
	const shift = bodyShift(drawing.svg);
	const marked = [
		...drawing.svg.matchAll(
			/<g data-semantic-kind="edge" data-semantic-id="(6zcjVgzh|SIdU2g2Q)"[^>]*>([\s\S]*?)<\/g>/gu,
		),
	].some((group) => {
		const path = /<path[^>]*\sd="([^"]*)"[^>]*marker-end=/u.exec(group[2]!)?.[1];
		return (
			path !== undefined &&
			roundBridges(path).some((bridge) => {
				const first = bridge.points[0]!,
					last = bridge.points.at(-1)!;
				const x = crossing.x - shift.x,
					y = crossing.y - shift.y;
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
			})
		);
	});
	expect(marked, "the perpendicular crossing beside the new route's corner has a bridge").toBe(
		true,
	);
});
