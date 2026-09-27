// A frame of unconnected cards is packed as a grid. Its column count once
// ignored the frame's title, so four cards under a tall title stood in one
// column a third of the page high, and the grid kept to the frame's left wall
// when the title made the frame wider than the grid. A block of blocks packs
// rows in the order its lines run, and a small block late in that order once
// took a row of its own below a wide one while a short row above had room,
// and a block alone on its row stood centred under a wide one, not under the
// block its line comes from.
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
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
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
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
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
