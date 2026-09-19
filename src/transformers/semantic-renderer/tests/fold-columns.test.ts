import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { foldColumnCounts, foldColumns } from "@/transformers/semantic-renderer/layout";

/**
 * A branch followed by a wide frame and its downstream card, already placed.
 * @returns Native-style measured geometry with two equally placed fold labels.
 */
function branching(): ElkNode {
	return {
		id: "root",
		x: 0,
		y: 0,
		width: 528,
		height: 798,
		children: [
			{ id: "a", x: 10, y: 20, width: 120, height: 100 },
			{ id: "b", x: 10, y: 160, width: 120, height: 100 },
			{ id: "c", x: 210, y: 160, width: 120, height: 100 },
			{
				id: "frame",
				x: 0,
				y: 300,
				width: 480,
				height: 240,
				children: [
					{ id: "d", x: 24, y: 360, width: 120, height: 80 },
					{ id: "e", x: 240, y: 360, width: 120, height: 80 },
				],
			},
			{ id: "f", x: 10, y: 650, width: 120, height: 100 },
		],
		edges: [
			{ id: "ab", sources: ["a"], targets: ["b"] },
			{ id: "ac", sources: ["a"], targets: ["c"] },
			{
				id: "bd",
				sources: ["b"],
				targets: ["d"],
				labels: [{ id: "lbd", x: 30, y: 280, width: 100, height: 24 }],
			},
			{
				id: "ce",
				sources: ["c"],
				targets: ["e"],
				labels: [{ id: "lce", x: 230, y: 280, width: 100, height: 24 }],
			},
			{ id: "df", sources: ["d"], targets: ["f"] },
			{ id: "ef", sources: ["e"], targets: ["f"] },
		],
	};
}

test("a multi-relationship fold preserves the branch row and complete frame", () => {
	const original = branching();
	const before = structuredClone(original);
	const folded = foldColumns(original, 2)!;
	const [a, b, c, frame, f] = folded.children!;
	expect(original).toEqual(before);
	expect(b!.y).toBe(c!.y);
	expect(c!.x! - b!.x!).toBe(200);
	expect(frame!.x).toBeGreaterThan(c!.x! + c!.width!);
	expect(frame!.y).toBe(a!.y);
	expect(f!.y).toBeGreaterThan(frame!.y! + frame!.height!);
	for (const [index, child] of frame!.children!.entries()) {
		const old = original.children![3]!.children![index]!;
		expect(child.x! - frame!.x!).toBe(old.x! - original.children![3]!.x!);
		expect(child.y! - frame!.y!).toBe(old.y! - original.children![3]!.y!);
	}
	expect(folded.edges!.map(({ id, sources, targets }) => ({ id, sources, targets }))).toEqual(
		original.edges!.map(({ id, sources, targets }) => ({ id, sources, targets })),
	);
});

test("fold labels use the full column gutter without covering each other", () => {
	const folded = foldColumns(branching(), 2)!;
	const left = folded.children![2]!;
	const frame = folded.children![3]!;
	const labels = folded.edges!.flatMap((edge) => edge.labels ?? []);
	for (const label of labels) {
		expect(label.x!).toBeGreaterThan(left.x! + left.width!);
		expect(label.x! + label.width!).toBeLessThan(frame.x!);
	}
	expect(labels[1]!.y!).toBeGreaterThan(labels[0]!.y! + labels[0]!.height!);
});

test("candidate counts follow the pane and indivisible bands rather than a fixed column count", () => {
	const graph: ElkNode = {
		id: "root",
		x: 0,
		y: 0,
		width: 308,
		height: 2352,
		children: Array.from({ length: 24 }, (_, index) => ({
			id: `n${index}`,
			x: 24,
			y: 24 + index * 96,
			width: 260,
			height: 72,
		})),
		edges: Array.from({ length: 23 }, (_, index) => ({
			id: `e${index}`,
			sources: [`n${index}`],
			targets: [`n${index + 1}`],
		})),
	};
	expect(foldColumnCounts(graph)).toContain(3);
	expect(foldColumnCounts({ ...graph, width: 4000 })).toEqual([]);
	expect(foldColumns(graph, 3)!.height!).toBeLessThan(foldColumns(graph, 2)!.height!);
	expect(
		foldColumnCounts({
			...graph,
			height: 408,
			children: graph.children!.slice(0, 4),
			edges: graph.edges!.slice(0, 3),
		}),
	).toEqual([]);
	expect(foldColumns(graph, 25)).toBeUndefined();
	const framed = {
		...graph,
		children: [{ id: "frame", x: 0, y: 0, width: 308, height: 2352, children: graph.children! }],
	};
	expect(foldColumnCounts(framed)).toEqual([]);
	expect(foldColumns(framed, 2)).toBeUndefined();
});

test("a side-entry source stays with its consumer without changing native offsets", () => {
	const graph = branching();
	graph.children!.push({ id: "device", x: 400, y: 160, width: 120, height: 100 });
	graph.edges!.push({ id: "device-d", sources: ["device"], targets: ["d"] });
	const folded = foldColumns(graph, 2)!;
	const source = folded.children!.find((node) => node.id === "device")!;
	const branch = folded.children!.find((node) => node.id === "c")!;
	const frame = folded.children!.find((node) => node.id === "frame")!;
	const consumer = frame.children![0]!;
	expect(source.x!).toBeGreaterThan(branch.x! + branch.width!);
	expect(source.y!).toBeLessThan(consumer.y!);
	expect(source.x! - consumer.x!).toBe(400 - 24);
	expect(source.y! - consumer.y!).toBe(160 - 360);
});
