// These regressions own Track placement, independent of the default engine.
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { corridorPoints, routesCross } from "#tests/runtime/support/drawn-routes.ts";
import { observedCloud, platformCloud } from "#tests/runtime/support/cloud-readings.ts";
import { labelsOffRuns, routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import phone from "../../../../../../docs/design/wide-board-layout-fixtures/phone-ownership.content.json";
import cloud from "#tests/runtime/support/fixtures/branching-cloud.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

// Work-vault readings of Cloud Infrastructure, three versions of one board:
// folded into columns each fit the pane better, but the steering line from
// Azure Traffic Manager then ran back up and across the regional entry into
// Portal API hostname, and every line turned twice more. A fold is kept only
// where it reads no worse than the drawing unfolded (ADR 0039).
test.each([
	["observed infrastructure", observedCloud],
	["platform API migration", platformCloud],
	["device migration", orderedFixture(cloud)],
] as const)("%s stays unfolded where a fold would cross its lines", async (_name, content) => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const routes = corridorPoints(drawing.svg);
	expect(routesCross(routes.get("6xASyZPU")!, routes.get("xCH4TAWg")!)).toBe(false);
	const frame = drawing.atlas.nodes["j6TdeSth"]!;
	for (const node of content.nodes.filter((candidate) => candidate.parent === "j6TdeSth")) {
		const child = drawing.atlas.nodes[node.id]!;
		expect(child.x).toBeGreaterThan(frame.x);
		expect(child.x + child.width).toBeLessThan(frame.x + frame.width);
	}
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
});

test("a long reading selects three downward columns when two cannot fit", async () => {
	const nodes = Array.from({ length: 24 }, (_, index) => ({
		id: `s${index}`,
		name: `Stage ${index + 1}`,
		kind: "module",
	}));
	const content = orderedFixture({
		nodes,
		edges: nodes.slice(1).map((node, index) => ({
			id: `e${index}`,
			from: nodes[index]!.id,
			to: node.id,
			kind: "call",
		})),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const columns = new Set(Object.values(drawing.atlas.nodes).map((box) => box.x));
	expect(columns.size).toBe(3);
	expect(Object.keys(drawing.atlas.nodes)).toHaveLength(24);
	expect(Object.keys(drawing.atlas.edges)).toHaveLength(23);
	expect(routesThroughCards(drawing, content)).toEqual([]);
});

test("a marginal fit gain keeps the compact ownership reading in one column", async () => {
	const content = orderedFixture(phone);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const frame = drawing.atlas.nodes["FB5oiRXm"]!;
	const database = drawing.atlas.nodes["kw6lbbtf"]!;
	expect(database.y).toBeGreaterThan(frame.y + frame.height);
	expect(database.x).toBeLessThan(frame.x + frame.width);
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
});
