import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
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
	const content = orderedFixture({
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
	const content = orderedFixture(cloud);
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
	const content = orderedFixture(phone);
	const drawing = await renderArchitecture({ content, theme: "light" });
	const frame = drawing.atlas.nodes["FB5oiRXm"]!;
	const database = drawing.atlas.nodes["kw6lbbtf"]!;
	expect(database.y).toBeGreaterThan(frame.y + frame.height);
	expect(database.x).toBeLessThan(frame.x + frame.width);
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
});

/** A drawn card's box. */
type Card = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

/**
 * A card's vertical centre.
 * @param card The card.
 * @returns Its centre's y.
 */
function middle(card: Card): number {
	return card.y + card.height / 2;
}

/**
 * Whether a height lies within a card's top and bottom.
 * @param card The card.
 * @param y The height.
 * @returns True when it does.
 */
function within(card: Card, y: number): boolean {
	return y >= card.y && y <= card.y + card.height;
}

// Each folded column was stacked at its own rank pitch, so where its cards
// were shorter than the next column's, its rows drifted up a card-height
// difference at a time and cards meant as one row stood at different levels.
test("cards of neighbouring folded columns that read as one row share a centre", async () => {
	// Cards with a note stand taller than the rest, and a longer note wraps.
	const notes = [
		"",
		"Keeps one thing",
		"",
		"Keeps one thing and hands the next thing on to the next stage",
	];
	const nodes = Array.from({ length: 12 }, (_, index) => ({
		id: `s${index}`,
		name: `Stage ${index + 1}`,
		kind: "module",
		...(notes[index % 4] ? { responsibility: notes[index % 4] } : {}),
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
	const drawing = await renderArchitecture({ content, theme: "light", layout: "graphviz" });
	const cards = Object.values(drawing.atlas.nodes);
	// Every pair side by side whose centres each lie within the other card.
	const rows = cards.flatMap((one) =>
		cards
			.filter(
				(other) =>
					other.x > one.x + one.width && within(one, middle(other)) && within(other, middle(one)),
			)
			.map((other) => middle(other) - middle(one)),
	);
	expect(rows.length).toBeGreaterThan(0);
	for (const offset of rows) expect(Math.abs(offset)).toBeLessThan(0.5);
});
