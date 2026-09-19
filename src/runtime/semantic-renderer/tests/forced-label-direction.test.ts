import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

for (const returning of [false, true]) {
	test(`a forced label follows its ${returning ? "upward" : "downward"} relationship without reversing it`, async () => {
		// Fixed placement isolates the real native router from ranking choices.
		// The label and both east faces share an otherwise empty corridor.
		const viz = await instance();
		const placed = Object.assign(viz, {
			renderJSON: () => ({
				bb: "0,0,240,280",
				objects: [
					{ name: "upper", pos: "50,40" },
					{ name: "lower", pos: "50,240" },
					{ name: "label_exercise", pos: "200,140" },
				],
			}),
		});
		await loaded;
		const solve = createLayoutEngine(placed, AvoidLib.getInstance());
		const graph: ElkNode = {
			id: "root",
			children: [
				{ id: "upper", width: 100, height: 80 },
				{ id: "lower", width: 100, height: 80 },
			],
			edges: [
				{
					id: "exercise",
					sources: [returning ? "lower" : "upper"],
					targets: [returning ? "upper" : "lower"],
					labels: [{ id: "label", width: 80, height: 30 }],
					layoutOptions: { "archboard.route-label": "true" },
				},
			],
		};
		const result = solve(graph, {});
		const section = result.edges![0]!.sections![0]!;
		const points = [section.startPoint, ...section.bendPoints!, section.endPoint];
		const direction = returning ? -1 : 1;
		for (const [index, point] of points.slice(1).entries()) {
			expect(direction * (point.y - points[index]!.y)).toBeGreaterThanOrEqual(0);
		}
		const label = result.edges![0]!.labels![0]!;
		const center = { x: label.x! + label.width! / 2, y: label.y! + label.height! / 2 };
		expect(
			points.slice(1).some((point, index) => {
				const previous = points[index]!;
				return (
					point.x === center.x &&
					previous.x === center.x &&
					Math.min(point.y, previous.y) <= center.y &&
					Math.max(point.y, previous.y) >= center.y
				);
			}),
		).toBe(true);
	});
}

test("a fallback reserved label aligns both card pins through its measured center", async () => {
	const viz = await instance();
	const placed = Object.assign(viz, {
		renderJSON: () => ({
			bb: "0,0,300,440",
			objects: [
				{ name: "upper", pos: "100,40" },
				{ name: "lower", pos: "140,340" },
				{ name: "label_entry", pos: "160,190" },
			],
		}),
	});
	await loaded;
	const solve = createLayoutEngine(placed, AvoidLib.getInstance());
	const result = solve(
		{
			id: "root",
			children: [
				{ id: "upper", width: 200, height: 80 },
				{ id: "lower", width: 200, height: 80 },
			],
			edges: [
				{
					id: "entry",
					sources: ["upper"],
					targets: ["lower"],
					layoutOptions: { "archboard.route-label": "true" },
					labels: [{ id: "label", width: 80, height: 30 }],
				},
			],
		},
		{},
	);
	const edge = result.edges![0]!;
	const label = edge.labels![0]!;
	const section = edge.sections![0]!;
	expect(section.startPoint.x).toBe(label.x! + label.width! / 2);
	expect(section.endPoint.x).toBe(section.startPoint.x);
	expect(section.bendPoints ?? []).toHaveLength(0);
});
