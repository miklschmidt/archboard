// A frame of unconnected cards is packed as a grid. Its column count once
// ignored the frame's title, so four cards under a tall title stood in one
// column a third of the page high, and the grid kept to the frame's left wall
// when the title made the frame wider than the grid.
import { expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";
import { SOLVE_STAGE } from "@/transformers/semantic-renderer/host";

test("a frame of unconnected cards packs a grid shaped for the pane, centred under its title", async () => {
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
	const placed = solve(
		{
			id: "root",
			children: [
				{
					id: "pool",
					width: 600,
					height: 200,
					layoutOptions: { "archboard.header.size": "200" },
					children: ["one", "two", "three", "four"].map((id) => ({ id, width: 260, height: 72 })),
				},
			],
		},
		{ [SOLVE_STAGE]: "place" },
	);
	const pool = placed.children![0]!;
	const cards = pool.children!;
	expect(new Set(cards.map((card) => card.x)).size).toBe(2);
	const left = Math.min(...cards.map((card) => card.x!)) - pool.x!;
	const right = pool.x! + pool.width! - Math.max(...cards.map((card) => card.x! + card.width!));
	expect(left).toBeCloseTo(right, 5);
});
