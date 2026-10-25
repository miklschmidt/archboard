// The track engine (TASK-349): what its own placement and routing promise.
// What this catches: a fan wider than the page drawn as one long row again, a
// line that jogs a few points on its way to a label, which its rounded corners
// draw as a hook doubling back on itself, a long chain drawn as one tall
// column again, or folded into columns that start at different heights, and a
// container of cards nothing connects drawn as one long row again, a line
// into a wide container that aims at its middle and comes back to its port,
// a tall board of containers drawn as one column, or folded through one,
// containers side by side sharing one border, a wrapped rank that sinks a
// card to a late row of its own, away from the cards it stands with, a deep
// wrap stepping diagonally, stacked cards out of one column or width, cards
// of one row on different tops, and a small page won by more rows.

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { SemanticPolicySchema, DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import {
	corridorPoints,
	routeEnds,
	routeLabels,
	routePoints,
	type DrawnPoint,
} from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import containerDetour from "#tests/runtime/support/fixtures/container-detour.json";
import variantReconciliation from "#tests/runtime/support/fixtures/variant-reconciliation.json";
import sunkWrap from "#tests/runtime/support/fixtures/sunk-wrap.json";

/** The room a container keeps round its members: archboard_layout::constants::CONTAINER_INSET. */
const CONTAINER_INSET = 20;

const TARGETS = ["one", "two", "three", "four", "five"];
/** How far past its ends a line may stand: one lane, where it turns beside a port. */
const SLACK = 16;
/** The most room a container keeps beside what it holds. */
const FRAME_ROOM = 24;

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
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: fan,
		theme: "light",
		layout: "track",
	});
	const targets = TARGETS.map((id) => drawing.atlas.nodes[id]!);
	expect(new Set(targets.map(({ y }) => y)).size).toBeGreaterThan(1);
	expect(drawing.width).toBeLessThan(targets.reduce((sum, { width }) => sum + width, 0));
});

test("a line to its label runs without a hook", async () => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: fan,
		theme: "light",
		layout: "track",
	});
	const routes = routePoints(drawing.svg);
	expect(routes.size).toBe(TARGETS.length);
	for (const [id, points] of routes) expect(doublesBack(points), id).toBe(false);
});

test("a long chain folds into columns whose first cards stand on one line", async () => {
	const stages = Array.from({ length: 14 }, (_, index) => `s${index}`);
	const chain = orderedFixture({
		nodes: stages.map((id) => ({ id, name: `Stage ${id}`, kind: "module" })),
		edges: stages.slice(1).map((to, index) => ({
			id: `e${index}`,
			from: stages[index]!,
			to,
			kind: "call",
		})),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: chain,
		theme: "light",
		layout: "track",
	});
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
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: portfolio,
			theme: "light",
			layout,
		});
		const cards = apps.map((id) => drawing.atlas.nodes[id]!);
		const rows = new Set(cards.map(({ y }) => y));
		const columns = new Set(cards.map(({ x }) => x));
		expect(rows.size).toBeGreaterThan(1);
		// Every row lines up under the first: no card stands off the grid's columns.
		expect(columns.size).toBe(Math.ceil(cards.length / rows.size));
		// And the container hugs its grid, with no more than its insets beside it.
		const frame = drawing.atlas.nodes["apps"]!;
		const span =
			Math.max(...cards.map(({ x, width }) => x + width)) - Math.min(...cards.map(({ x }) => x));
		expect(frame.width - span).toBeLessThanOrEqual(2 * FRAME_ROOM);
	},
);

// Reduced from a real ingress board, names replaced: a line into a wide container
// crossed a band of other labels on its way and aimed at the container's middle.
test("a line into a wide container stays between its ends and its label", async () => {
	const pool = orderedFixture(containerDetour);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: pool,
		theme: "light",
		layout: "track",
	});
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

test("a tall board of containers folds into columns that each hold a container whole", async () => {
	const stages = [0, 1, 2, 3, 4, 5];
	const tall = orderedFixture({
		nodes: stages.flatMap((stage) => [
			{ id: `f${stage}`, name: `Stage ${stage}`, kind: "service" },
			{ id: `a${stage}`, name: `Stage ${stage} intake`, kind: "module", parent: `f${stage}` },
			{ id: `b${stage}`, name: `Stage ${stage} output`, kind: "module", parent: `f${stage}` },
		]),
		edges: stages.flatMap((stage) => [
			{ id: `in${stage}`, from: `a${stage}`, to: `b${stage}`, kind: "call" },
			...(stage < 5
				? [{ id: `on${stage}`, from: `b${stage}`, to: `a${stage + 1}`, kind: "call" }]
				: []),
		]),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: tall,
		theme: "light",
		layout: "track",
	});
	const frames = stages.map((stage) => drawing.atlas.nodes[`f${stage}`]!);
	// Folded: some container stands beside another rather than under it.
	expect(new Set(frames.map(({ x }) => x)).size).toBeGreaterThan(1);
	for (const { id, parent } of tall.nodes) {
		if (parent === undefined) continue;
		const [card, frame] = [drawing.atlas.nodes[id]!, drawing.atlas.nodes[parent]!];
		expect(card.x, `${id} inside ${parent}`).toBeGreaterThanOrEqual(frame.x);
		expect(card.x + card.width, `${id} inside ${parent}`).toBeLessThanOrEqual(
			frame.x + frame.width,
		);
		expect(card.y + card.height, `${id} inside ${parent}`).toBeLessThanOrEqual(
			frame.y + frame.height,
		);
	}
});

// Two containers side by side at the top of a board once shared one border:
// Graphviz held top-level clusters only the root's margin apart, and that was 0.
test("containers side by side keep an inset between their borders", async () => {
	const sides = ["left", "right"];
	const content = orderedFixture({
		nodes: sides.flatMap((side) => [
			{ id: side, name: `${side} service`, kind: "service" },
			{ id: `${side}a`, name: `${side} intake`, kind: "module", parent: side },
			{ id: `${side}b`, name: `${side} output`, kind: "module", parent: side },
		]),
		edges: sides.map((side) => ({ id: side, from: `${side}a`, to: `${side}b`, kind: "call" })),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const [one, other] = sides
		.map((side) => drawing.atlas.nodes[side]!)
		.toSorted((a, b) => a.x - b.x);
	expect(one!.y).toBeLessThan(other!.y + other!.height);
	expect(other!.x - (one!.x + one!.width)).toBeGreaterThanOrEqual(CONTAINER_INSET);
});

// Reduced from the dogfood Codex session board: a wrap of the hub's wide rank
// stepped each row right of the one above, so the last card stood alone on a
// late row across an empty strip.
test("a wrapped rank stands each lowered card under one of its row above", async () => {
	const content = orderedFixture(sunkWrap);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const rank = content.edges.filter(({ from }) => from === "hub").map(({ to }) => to);
	const parentOf = new Map(content.nodes.map(({ id, parent }) => [id, parent]));
	const box = (id: string) => drawing.atlas.nodes[id]!;
	const top = (id: string): number => Math.round(box(id).y);
	const rows = [...new Set(rank.map(top))].toSorted((one, other) => one - other);
	const rowOf = (id: string): number => rows.indexOf(top(id));
	for (const card of rank.filter((id) => rowOf(id) > 0)) {
		const over = rank.filter(
			(other) =>
				rowOf(other) === rowOf(card) - 1 &&
				parentOf.get(other) === parentOf.get(card) &&
				box(other).x < box(card).x + box(card).width &&
				box(card).x < box(other).x + box(other).width,
		);
		expect(over.length, card).toBeGreaterThan(0);
	}
});

// A card whose note is a little narrower than the widest card stood a few
// points inside the column of the card under it, so their edges stepped.
test("two joined cards stacked on one centre take one width", async () => {
	const content = orderedFixture({
		nodes: [
			{
				id: "a",
				name: "Gateway",
				kind: "module",
				responsibility: "Answers every request the gateway sends on to it",
			},
			{
				id: "b",
				name: "Service",
				kind: "module",
				responsibility:
					"Holds every board the vault keeps and writes each one through one atomic write",
			},
		],
		edges: [{ id: "e", from: "a", to: "b", kind: "call", label: "requests" }],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const [upper, lower] = [drawing.atlas.nodes["a"]!, drawing.atlas.nodes["b"]!];
	expect(upper.x).toBeCloseTo(lower.x, 2);
	expect(upper.x + upper.width).toBeCloseTo(lower.x + lower.width, 2);
});

// Reduced from the dogfood CLI board: laid with its columns free, a wrap into
// three or four rows pushed each lowered card aside by the lines to the rows
// below it, so the cards stepped diagonally down the rows.
test("a wrap into three rows or more keeps its columns", async () => {
	const commands = Array.from({ length: 8 }, (_, index) => `c${index}`);
	const content = orderedFixture({
		nodes: [
			{ id: "hub", name: "Execution", kind: "module", responsibility: "Runs every command" },
			...commands.map((id, index) => ({
				id,
				name: `Command ${index}`,
				kind: "module",
				responsibility: `command ${index}: one thing a person can ask, with text that wraps`,
			})),
			{ id: "sink", name: "Client", kind: "module", responsibility: "Sends every request" },
		],
		edges: commands.flatMap((id, index) => [
			{ id: `in${index}`, from: "hub", to: id, kind: "call", label: "validated input" },
			{ id: `out${index}`, from: id, to: "sink", kind: "call", label: "operation" },
		]),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const boxes = commands.map((id) => drawing.atlas.nodes[id]!).toSorted((a, b) => a.y - b.y);
	// Cards that share some height stand in one row.
	const rows: (typeof boxes)[] = [];
	for (const box of boxes) {
		const row = rows.at(-1);
		if (row !== undefined && box.y < Math.max(...row.map(({ y, height }) => y + height)))
			row.push(box);
		else rows.push([box]);
	}
	expect(rows.length).toBeGreaterThanOrEqual(3);
	for (const [index, row] of rows.entries())
		for (const box of index === 0 ? [] : row)
			expect(rows[index - 1]!.some(({ x }) => Math.abs(x - box.x) <= 1)).toBeTrue();
});

// Reduced from the dogfood Variant reconciliation view: a short and a tall card
// on one rank were centred on one height, so their tops stepped and the lines
// into them from one label row ended at two heights.
test("cards on one rank stand on one top, and the lines into them end there", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "hub", name: "Transitions", kind: "module" },
			{
				id: "tall",
				name: "Adopt",
				kind: "module",
				responsibility:
					"Makes a settled draft current, or gives a board its first current variant; refuses a draft derived from an older architecture unless forced",
			},
			{ id: "short", name: "Shelve", kind: "module", responsibility: "Lets a proposal go" },
		],
		edges: [
			{ id: "a", from: "hub", to: "tall", kind: "call", label: "adopt a draft" },
			{ id: "s", from: "hub", to: "short", kind: "call", label: "shelve a proposal" },
		],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const [tall, short] = [drawing.atlas.nodes["tall"]!, drawing.atlas.nodes["short"]!];
	expect(tall.height).toBeGreaterThan(short.height);
	expect(short.y).toBe(tall.y);
	const ends = routeEnds(drawing.svg);
	expect(ends.get("s")!.y).toBe(ends.get("a")!.y);
});

// Taken from a board of this repository: a fan too wide for the pane wraps,
// and a wrap into two rows and a narrower one into three both fit the pane
// at full scale. Taking the smaller page stepped the fan down three rows as
// a staircase, where the wrap into two rows reads worse than the fan in one
// row with its group packed, and that is kept.
test("a fan never steps down three rows where two would do", async () => {
	const content = orderedFixture(variantReconciliation);
	const policy = SemanticPolicySchema.parse({
		levels: ["service"],
		nodeKinds: { function: { name: "Function", icon: "RiCodeLine" } },
		relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "filled" } },
		groups: { writes: { name: "Board writes", color: "orange" } },
	});
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const targets = content.edges.map(({ to }) => drawing.atlas.nodes[to]!);
	expect(new Set(targets.map(({ y }) => y)).size).toBeLessThanOrEqual(2);
});
