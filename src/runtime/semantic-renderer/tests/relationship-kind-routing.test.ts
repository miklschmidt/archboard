import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { corridorPoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("different relationship kinds use distinct ports and tracks while one kind shares its port", async () => {
	const content = VariantContentSchema.parse({
		nodes: ["a", "b"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "call1", from: "a", to: "b", kind: "call" },
			{ id: "call2", from: "a", to: "b", kind: "call" },
			{ id: "data", from: "a", to: "b", kind: "data" },
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const routes = corridorPoints(drawing.svg);
	const call = routes.get("call1")!;
	const shared = routes.get("call2")!;
	const data = routes.get("data")!;
	expect(call[0]).toEqual(shared[0]);
	expect(call.at(-1)).toEqual(shared.at(-1));
	expect(data[0]).not.toEqual(call[0]);
	expect(data.at(-1)).not.toEqual(call.at(-1));
	let sharedLength = 0;
	for (const [index, end] of call.slice(1).entries()) {
		const start = call[index]!;
		for (const [otherIndex, otherEnd] of data.slice(1).entries()) {
			const otherStart = data[otherIndex]!;
			for (const [along, across] of [
				["x", "y"],
				["y", "x"],
			] as const) {
				if (start[across] !== end[across] || otherStart[across] !== otherEnd[across]) continue;
				if (Math.abs(start[across] - otherStart[across]) > 0.01) continue;
				const overlap =
					Math.min(
						Math.max(start[along], end[along]),
						Math.max(otherStart[along], otherEnd[along]),
					) -
					Math.max(
						Math.min(start[along], end[along]),
						Math.min(otherStart[along], otherEnd[along]),
					);
				sharedLength += Math.max(0, overlap);
			}
		}
	}
	expect(sharedLength).toBeLessThanOrEqual(0.01);
});
