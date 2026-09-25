// A reserved label ranks on its own Graphviz node between its line's ends.
// Graphviz breaking a cycle through two labelled lines turned one half of a
// label's chain only, and that label ranked below both of its ends, so its
// line ran past its target and came back up through it in a loop.
import { expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";
import { SOLVE_STAGE } from "@/transformers/semantic-renderer/host";

test("each reserved label of two lines that answer each other ranks between its ends", async () => {
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
	const placed = solve(
		{
			id: "root",
			children: [
				{ id: "asks", width: 200, height: 80 },
				{ id: "answers", width: 200, height: 80 },
			],
			edges: [
				{
					id: "ask",
					sources: ["asks"],
					targets: ["answers"],
					labels: [{ id: "ask", width: 120, height: 30 }],
				},
				{
					id: "answer",
					sources: ["answers"],
					targets: ["asks"],
					labels: [{ id: "answer", width: 120, height: 30 }],
				},
			],
		},
		{ [SOLVE_STAGE]: "place" },
	);
	const cards = new Map(placed.children!.map((card) => [card.id, card]));
	for (const edge of placed.edges!) {
		const box = edge.labels![0]!;
		const [from, to] = [cards.get(edge.sources[0]!)!, cards.get(edge.targets[0]!)!];
		const middle = box.y! + box.height! / 2;
		const ends = [from.y! + from.height! / 2, to.y! + to.height! / 2];
		expect(middle).toBeGreaterThan(Math.min(...ends));
		expect(middle).toBeLessThan(Math.max(...ends));
	}
});
