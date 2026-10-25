// A block of blocks packs rows in the order its lines run, and a small block
// late in that order once took a row of its own below a wide one while a
// short row above had room, and a block alone on its row stood centred under
// a wide one, not under the block its line comes from.
import { expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { createLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { SOLVE_STAGE } from "#shared/rules/render/host.ts";
import { loadCore } from "#runtime/services/core.ts";

/**
 * A framed block holding one card.
 * @param id The frame.
 * @param width The card's width.
 * @param height The card's height.
 * @returns The frame.
 */
function frame(id: string, width: number, height: number) {
	return {
		id,
		width: 300,
		height: 60,
		layoutOptions: { "archboard.header.size": "60" },
		children: [{ id: `${id}1`, width, height }],
	};
}

test("a small block late in the order fills the room a short row leaves", async () => {
	loadCore();
	const solve = createLayoutEngine(await instance());
	const call = { "archboard.relationship.kind": "call" };
	const placed = solve(
		{
			id: "root",
			children: [frame("a", 340, 100), frame("b", 1600, 500), frame("c", 340, 100)],
			edges: [
				{ id: "ab", sources: ["a1"], targets: ["b1"], layoutOptions: call },
				{ id: "ac", sources: ["a1"], targets: ["c1"], layoutOptions: call },
			],
		},
		{ [SOLVE_STAGE]: "blocks" },
	);
	const { frames } = JSON.parse(placed.layoutOptions!["archboard.blocks.placed"]!) as {
		frames: { id: string; box: { y: number; height: number } }[];
	};
	const box = (id: string) => frames.find((one) => one.id === id)!.box;
	expect(box("c").y).toBe(box("a").y);
	expect(box("c").y + box("c").height).toBeLessThan(box("b").y);
});

test("a block alone on its row stands under the block its line comes from", async () => {
	loadCore();
	const solve = createLayoutEngine(await instance());
	const placed = solve(
		{
			id: "root",
			children: [
				{
					id: "frame",
					width: 400,
					height: 60,
					layoutOptions: { "archboard.header.size": "60" },
					children: [
						{ id: "a", width: 340, height: 100 },
						{ id: "b", width: 600, height: 100 },
					],
				},
				{ id: "c", width: 340, height: 100 },
			],
			edges: [
				{
					id: "ac",
					sources: ["a"],
					targets: ["c"],
					layoutOptions: { "archboard.relationship.kind": "call" },
				},
			],
		},
		{ [SOLVE_STAGE]: "blocks" },
	);
	const { cards, edges } = JSON.parse(placed.layoutOptions!["archboard.blocks.placed"]!) as {
		cards: { id: string; box: { x: number; width: number } }[];
		edges: { id: string; points: { x: number; y: number }[] }[];
	};
	const centre = (id: string) => {
		const { box } = cards.find((one) => one.id === id)!;
		return box.x + box.width / 2;
	};
	expect(centre("c")).toBeCloseTo(centre("a"), 5);
	expect(edges.find((one) => one.id === "ac")!.points).toHaveLength(2);
});
