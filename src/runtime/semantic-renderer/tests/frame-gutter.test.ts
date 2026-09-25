// Graphviz keeps top-level frames apart by the root graph's margin. With none,
// two frames side by side stood as little as 2 points apart and read as one
// doubled border; they now keep the routing gap cards keep.
import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";
import { SOLVE_STAGE } from "@/transformers/semantic-renderer/host";

/**
 * A frame holding two cards.
 * @param id The frame.
 * @returns The frame.
 */
function frame(id: string): ElkNode {
	return {
		id,
		width: 400,
		height: 60,
		layoutOptions: { "archboard.header.size": "60" },
		children: [
			{ id: `${id}-upper`, width: 200, height: 80 },
			{ id: `${id}-lower`, width: 200, height: 80 },
		],
	};
}

test("two frames side by side keep a routing gap between their borders", async () => {
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
	const placed = solve(
		{
			id: "root",
			children: [frame("left"), frame("right")],
			edges: [
				...["left", "right"].map((id) => ({
					id,
					sources: [`${id}-upper`],
					targets: [`${id}-lower`],
				})),
				// The left frame starts a row lower, beside the right one.
				{ id: "across", sources: ["right-upper"], targets: ["left-upper"] },
			],
		},
		{ [SOLVE_STAGE]: "place" },
	);
	const [one, other] = ["left", "right"]
		.map((id) => placed.children!.find((child) => child.id === id)!)
		.toSorted((a, b) => a.x! - b.x!);
	expect(one!.y! + one!.height!).toBeGreaterThan(other!.y!);
	expect(other!.x! - (one!.x! + one!.width!)).toBeGreaterThanOrEqual(42);
});
