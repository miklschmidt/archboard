// The track engine (TASK-349): what its own placement and routing promise.
// What this catches: a fan wider than the page drawn as one long row again, a
// line that jogs a few points on its way to a label, which its rounded corners
// draw as a hook doubling back on itself, a long chain drawn as one tall
// column again, or folded into columns that start at different heights, and a
// container of cards nothing connects drawn as one long row again, and a line
// into a wide container that aims at its middle and comes back to its port.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	corridorPoints,
	routeLabels,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import containerDetour from "./container-detour.json";

const TARGETS = ["one", "two", "three", "four", "five"];
/** How far past its ends a line may stand: one lane, where it turns beside a port. */
const SLACK = 16;

const fan = orderedFixture({
	nodes: ["hub", ...TARGETS].map((id) => ({ id, name: id, kind: "module" })),
	edges: TARGETS.map((to, index) => ({
		id: `e${index}`,
		from: "hub",
		to,
		kind: "call",
		label: `message ${index}`,
	})),
});

/**
 * Whether a drawn route doubles back along one straight line: two runs on
 * the same level (or upright) going opposite ways, one straight after the other.
 * @param points The route's path points, control points included.
 * @returns True when it doubles back anywhere.
 */
function doublesBack(points: readonly DrawnPoint[]): boolean {
	return points.slice(2).some((end, index) => {
		const [start, middle] = [points[index]!, points[index + 1]!];
		const level = start.y === middle.y && middle.y === end.y;
		const upright = start.x === middle.x && middle.x === end.x;
		const across = (middle.x - start.x) * (end.x - middle.x);
		const along = (middle.y - start.y) * (end.y - middle.y);
		return (level && across < 0) || (upright && along < 0);
	});
}

test("a fan wider than the page wraps its targets into rows", async () => {
	const drawing = await renderArchitecture({ content: fan, theme: "light", layout: "track" });
	const targets = TARGETS.map((id) => drawing.atlas.nodes[id]!);
	expect(new Set(targets.map(({ y }) => y)).size).toBeGreaterThan(1);
	expect(drawing.width).toBeLessThan(targets.reduce((sum, { width }) => sum + width, 0));
});

test("a line to its label runs without a hook", async () => {
	const drawing = await renderArchitecture({ content: fan, theme: "light", layout: "track" });
	const routes = routePoints(drawing.svg);
	expect(routes.size).toBe(TARGETS.length);
	for (const [id, points] of routes) expect(doublesBack(points), id).toBe(false);
});

test("a long chain folds into columns whose first cards stand on one line", async () => {
	const stages = Array.from({ length: 12 }, (_, index) => `s${index}`);
	const chain = orderedFixture({
		nodes: stages.map((id) => ({ id, name: `Stage ${id}`, kind: "module" })),
		edges: stages.slice(1).map((to, index) => ({
			id: `e${index}`,
			from: stages[index]!,
			to,
			kind: "call",
		})),
	});
	const drawing = await renderArchitecture({ content: chain, theme: "light", layout: "track" });
	const cards = stages.map((id) => drawing.atlas.nodes[id]!);
	const columns = [...new Set(cards.map(({ x }) => x))].toSorted((one, other) => one - other);
	expect(columns.length).toBeGreaterThan(1);
	const heads = columns.map((x) =>
		Math.min(...cards.filter((card) => card.x === x).map(({ y }) => y)),
	);
	expect(new Set(heads).size).toBe(1);
	// Down each column, then on at the head of the next.
	const order = cards.toSorted((one, other) => one.x - other.x || one.y - other.y);
	expect(order).toEqual(cards);
});

test.each(["track", "blocks"] as const)(
	"a container of cards nothing connects sets them out as a grid (%s)",
	async (layout) => {
		const apps = Array.from({ length: 11 }, (_, index) => `app${index}`);
		const portfolio = orderedFixture({
			nodes: [
				{ id: "apps", name: "Application portfolio", kind: "service" },
				...apps.map((id) => ({
					id,
					name: `Application ${id}`,
					kind: "module",
					parent: "apps",
				})),
			],
			edges: [],
		});
		const drawing = await renderArchitecture({ content: portfolio, theme: "light", layout });
		const cards = apps.map((id) => drawing.atlas.nodes[id]!);
		const rows = new Set(cards.map(({ y }) => y));
		const columns = new Set(cards.map(({ x }) => x));
		expect(rows.size).toBeGreaterThan(1);
		// Every row lines up under the first: no card stands off the grid's columns.
		expect(columns.size).toBe(Math.ceil(cards.length / rows.size));
	},
);

// Reduced from a real ingress board, names replaced: a line into a wide container
// crossed a band of other labels on its way and aimed at the container's middle.
test("a line into a wide container stays between its ends and its label", async () => {
	const pool = orderedFixture(containerDetour);
	const drawing = await renderArchitecture({ content: pool, theme: "light", layout: "track" });
	const labels = routeLabels(drawing.svg);
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const label = labels.get(id)!;
		// A line reaches as far as its two ends and the words it carries.
		const reached = [points[0]!.x, points.at(-1)!.x, label.x + label.width / 2];
		const [low, high] = [Math.min(...reached), Math.max(...reached)];
		for (const { x } of points) {
			expect(x, `${id} beyond its ends`).toBeGreaterThanOrEqual(low - SLACK);
			expect(x, `${id} beyond its ends`).toBeLessThanOrEqual(high + SLACK);
		}
	}
});
