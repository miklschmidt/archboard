// A block of blocks packs rows in the order its lines run, and a small block
// late in that order once took a row of its own below a wide one while a
// short row above had room, and a block alone on its row stood centred under
// a wide one, not under the block its line comes from.
import { expect, test } from "bun:test";
import type { DiagramBox } from "@archboard/board/render-reply";
import {
	distanceToFrame,
	routeCrosses,
	type DrawnPoint,
} from "#tests/runtime/support/drawn-routes.ts";
import { loadCore } from "#runtime/services/core.ts";

/** What these tests read of a solved graph: its root options. */
interface Solved {
	readonly layoutOptions?: Readonly<Record<string, string>>;
}

/**
 * The worker's layout engine, over graphs as objects.
 * @returns A solve of one graph.
 */
function layoutEngine(): (graph: object) => Solved {
	const { layOutBoard } = loadCore();
	return (graph) => JSON.parse(layOutBoard(JSON.stringify(graph))) as Solved;
}

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

test("a small block late in the order fills the room a short row leaves", () => {
	const solved = layoutEngine();
	const call = { "archboard.relationship.kind": "call" };
	const placed = solved({
		id: "root",
		layoutOptions: { "archboard.blocks.nesting": "blocks" },
		children: [frame("a", 340, 100), frame("b", 1600, 500), frame("c", 340, 100)],
		edges: [
			{ id: "ab", sources: ["a1"], targets: ["b1"], layoutOptions: call },
			{ id: "ac", sources: ["a1"], targets: ["c1"], layoutOptions: call },
		],
	});
	const { frames } = JSON.parse(placed.layoutOptions!["archboard.blocks.placed"]!) as {
		frames: { id: string; box: { y: number; height: number } }[];
	};
	const box = (id: string) => frames.find((one) => one.id === id)!.box;
	expect(box("c").y).toBe(box("a").y);
	expect(box("c").y + box("c").height).toBeLessThan(box("b").y);
});

test("a block connects to its caller through a direct clear route", () => {
	const solved = layoutEngine();
	const placed = solved({
		id: "root",
		layoutOptions: { "archboard.blocks.nesting": "blocks" },
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
	});
	const { cards, edges } = JSON.parse(placed.layoutOptions!["archboard.blocks.placed"]!) as {
		cards: { id: string; box: DiagramBox }[];
		edges: { id: string; points: DrawnPoint[] }[];
	};
	const route = edges.find((one) => one.id === "ac")!.points;
	const [first, last] = [route[0]!, route.at(-1)!];
	const box = (id: string) => cards.find((card) => card.id === id)!.box;
	expect(distanceToFrame(first, box("a"))).toBeLessThan(1);
	expect(distanceToFrame(last, box("c"))).toBeLessThan(1);
	const length = route
		.slice(1)
		.reduce(
			(sum, end, index) =>
				sum + Math.abs(end.x - route[index]!.x) + Math.abs(end.y - route[index]!.y),
			0,
		);
	expect(length).toBeCloseTo(Math.abs(last.x - first.x) + Math.abs(last.y - first.y), 5);
	expect(route.length).toBeLessThanOrEqual(4);
	expect(routeCrosses(route, box("b"))).toBe(false);
});
