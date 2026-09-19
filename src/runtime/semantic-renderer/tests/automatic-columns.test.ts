import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { fitIn } from "@/shared/shell-geometry/index";
import { observedCloud, platformCloud } from "@/runtime/semantic-renderer/tests/cloud-readings";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import phone from "../../../../docs/design/wide-board-layout-fixtures/phone-ownership.content.json";
import cloud from "@/runtime/semantic-renderer/tests/branching-cloud.json";

test.each([
	["observed infrastructure", observedCloud, 0.66],
	["platform API migration", platformCloud, 0.57],
] as const)(
	"%s selects a materially more readable completed fold",
	async (_name, content, minimumFit) => {
		const drawing = await renderArchitecture({ content, theme: "light" });
		// The old readings fit at 0.627 and 0.535 respectively. These floors
		// require useful improvement without freezing a particular split or size.
		expect(fitIn(drawing)).toBeGreaterThan(minimumFit);
		const frame = drawing.atlas.nodes["j6TdeSth"]!;
		for (const node of content.nodes.filter((candidate) => candidate.parent === "j6TdeSth")) {
			const child = drawing.atlas.nodes[node.id]!;
			expect(child.x).toBeGreaterThan(frame.x);
			expect(child.x + child.width).toBeLessThan(frame.x + frame.width);
			expect(child.y).toBeGreaterThan(frame.y);
			expect(child.y + child.height).toBeLessThan(frame.y + frame.height);
		}
		expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
			content.nodes.map((node) => node.id).toSorted(),
		);
		expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
			content.edges.map((edge) => edge.id).toSorted(),
		);
		expect(routesThroughCards(drawing, content)).toEqual([]);
		expect(labelsOffRuns(drawing)).toEqual([]);
	},
);

test("a long reading selects three downward columns when two cannot fit", async () => {
	const nodes = Array.from({ length: 24 }, (_, index) => ({
		id: `s${index}`,
		name: `Stage ${index + 1}`,
		kind: "module",
	}));
	const content = VariantContentSchema.parse({
		nodes,
		edges: nodes.slice(1).map((node, index) => ({
			id: `e${index}`,
			from: nodes[index]!.id,
			to: node.id,
			kind: "call",
		})),
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const columns = new Set(Object.values(drawing.atlas.nodes).map((box) => box.x));
	expect(columns.size).toBe(3);
	expect(Object.keys(drawing.atlas.nodes)).toHaveLength(24);
	expect(Object.keys(drawing.atlas.edges)).toHaveLength(23);
	expect(routesThroughCards(drawing, content)).toEqual([]);
});

test("a branching reading wraps and keeps side-entry sources with consumers", async () => {
	const content = VariantContentSchema.parse(cloud);
	const drawing = await renderArchitecture({ content, theme: "light" });
	const at = drawing.atlas.nodes;
	const traffic = at["KBuciT76"]!;
	const portal = at["ywwZuKxy"]!;
	const balancer = at["9BTlRpYl"]!;
	const devices = at["1yU3ivZL"]!;
	const frame = at["j6TdeSth"]!;
	expect(portal.y).toBeGreaterThan(traffic.y);
	expect(balancer.x).toBeGreaterThan(traffic.x + traffic.width);
	expect(fitIn(drawing)).toBeGreaterThan(0.68);
	expect(devices.x).toBeGreaterThan(traffic.x + traffic.width);
	expect(devices.y).toBeLessThan(balancer.y);
	for (const node of content.nodes.filter((candidate) => candidate.parent === "j6TdeSth")) {
		const child = at[node.id]!;
		expect(child.x).toBeGreaterThan(frame.x);
		expect(child.x + child.width).toBeLessThan(frame.x + frame.width);
		expect(child.y).toBeGreaterThan(frame.y);
		expect(child.y + child.height).toBeLessThan(frame.y + frame.height);
	}
	expect(Object.keys(at).toSorted()).toEqual(content.nodes.map((node) => node.id).toSorted());
	expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
		content.edges.map((edge) => edge.id).toSorted(),
	);
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
});

test("a marginal fit gain keeps the compact ownership reading in one column", async () => {
	const content = VariantContentSchema.parse(phone);
	const drawing = await renderArchitecture({ content, theme: "light" });
	const frame = drawing.atlas.nodes["FB5oiRXm"]!;
	const database = drawing.atlas.nodes["kw6lbbtf"]!;
	expect(database.y).toBeGreaterThan(frame.y + frame.height);
	expect(database.x).toBeLessThan(frame.x + frame.width);
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
});
