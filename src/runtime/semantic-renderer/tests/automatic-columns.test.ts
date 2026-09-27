import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { corridorPoints, routesCross } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { observedCloud, platformCloud } from "@/runtime/semantic-renderer/tests/cloud-readings";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import phone from "../../../../docs/design/wide-board-layout-fixtures/phone-ownership.content.json";
import cloud from "@/runtime/semantic-renderer/tests/branching-cloud.json";

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
	const drawing = await renderArchitecture({ content, theme: "light" });
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
	const drawing = await renderArchitecture({ content, theme: "light" });
	const columns = new Set(Object.values(drawing.atlas.nodes).map((box) => box.x));
	expect(columns.size).toBe(3);
	expect(Object.keys(drawing.atlas.nodes)).toHaveLength(24);
	expect(Object.keys(drawing.atlas.edges)).toHaveLength(23);
	expect(routesThroughCards(drawing, content)).toEqual([]);
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
