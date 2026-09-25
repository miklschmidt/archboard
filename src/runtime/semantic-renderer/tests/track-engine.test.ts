// The track engine (TASK-349): what its own placement and routing promise.
// What this catches: a fan wider than the page drawn as one long row again, a
// line that jogs a few points on its way to a label, which its rounded corners
// draw as a hook doubling back on itself, a line that steps sideways by less
// than its two bends need on its way between cards, a line rising into the
// card above whose arrowhead sits on its last bend, labels on a crowded band
// shifted together until every line through them jogs, a labelled fan whose
// trunk turns once and whose labels then turn it a second time, two labelled
// lines entering one card unevenly, one hugging its corner, a line crossing
// a container's heading through its painted words, a long chain drawn as one tall
// column again, or folded into columns that start at different heights, and a
// container of cards nothing connects drawn as one long row again, a line
// into a wide container that aims at its middle and comes back to its port,
// and a tall board of containers drawn as one column, or folded through one.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import {
	corridorPoints,
	routeLabels,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import containerDetour from "./container-detour.json";
import headingCrossing from "./heading-crossing.json";
import risingLine from "./rising-line.json";
import trunkFan from "./trunk-fan.json";
import shortStep from "./short-step.json";

const TARGETS = ["one", "two", "three", "four", "five"];
/** How far past its ends a line may stand: one lane, where it turns beside a port. */
const SLACK = 16;
/** The most room a container keeps beside what it holds. */
const FRAME_ROOM = 24;
/** The straight run an arrowhead sits on after a line's last bend. */
const APPROACH = 12;
/** The sideways room a line's two fixed 8 px bends need to step aside and on. */
const TWO_BENDS = 16;

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

/**
 * How far a drawn route steps sideways between each of its upright runs and the next.
 * @param points The route's path points, control points included.
 * @returns The steps, in order.
 */
function sidewaysSteps(points: readonly DrawnPoint[]): number[] {
	const uprights = points
		.slice(1)
		.flatMap((point, index) =>
			point.x === points[index]!.x && point.y !== points[index]!.y ? [point.x] : [],
		);
	return uprights.slice(1).map((x, index) => Math.abs(x - uprights[index]!));
}

// Reduced from a dogfood board, names replaced: lines leaving one shared port
// stepped a few points aside where a lane or a label stood just off their column.
test("a line steps sideways by no less than its two bends need, or runs straight", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(shortStep),
		theme: "light",
		layout: "track",
	});
	for (const [id, points] of routePoints(drawing.svg))
		for (const step of sidewaysSteps(points))
			expect(step > 0.5 && step < TWO_BENDS, `${id} steps ${step}`).toBe(false);
});

// Reduced from a dogfood board, names replaced: a line rising into the card
// above turned on the channel's first track, 8 px under that card.
test("every line's arrowhead sits on a straight run, rising lines' too", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(risingLine),
		theme: "light",
		layout: "track",
	});
	for (const [id, points] of routePoints(drawing.svg)) {
		const [before, end] = [points.at(-2)!, points.at(-1)!];
		expect(Math.hypot(end.x - before.x, end.y - before.y), id).toBeGreaterThanOrEqual(APPROACH);
	}
});

// Shaped like a real ingress board's band, names replaced: four labelled lines
// between two rows, whose label boxes cannot all stand where their lines run
// straight. Sharing the displacement out made every line but one jog.
test("labels crowding one band leave as many of their lines straight as fit", async () => {
	const band = orderedFixture({
		nodes: [
			["dns", "Name service", "Names one balancer's public address for the whole traffic cutover"],
			["probe", "Probe", "Synthetic requests from engineers"],
			["old", "Old balancer", "Forwards traffic to the old pool without opening it"],
			["new", "New balancer", "Separate balancer with its own public address"],
		].map(([id, name, responsibility]) => ({ id, name, kind: "module", responsibility })),
		edges: [
			["fallback", "dns", "old", "event", "If the proxy is down: falls back here"],
			["today", "dns", "old", "call", "Today: points here"],
			["stage2", "dns", "new", "call", "Stage 2: points here instead"],
			["stage1", "probe", "new", "call", "Stage 1: plain HTTP on a preview port"],
		].map(([id, from, to, kind, label]) => ({ id, from, to, kind, label })),
	});
	const drawing = await renderArchitecture({ content: band, theme: "light", layout: "track" });
	const jogging = [...routePoints(drawing.svg)].filter(([, points]) =>
		points.some((point, index) => index > 0 && Math.abs(point.x - points[index - 1]!.x) > 0.5),
	);
	expect(jogging.length).toBeLessThanOrEqual(1);
});

// Reduced from a dogfood board, names replaced: labelled lines leaving one
// card through a shared trunk. Each label stood over the edge of the source's
// face, so each line ran sideways on the trunk's track and again below its label.
test("a labelled line leaving through a trunk runs sideways on one level only", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(trunkFan),
		theme: "light",
		layout: "track",
	});
	for (const [id, points] of routePoints(drawing.svg)) {
		const levels = points
			.slice(1)
			.filter((point, index) => point.y === points[index]!.y && point.x !== points[index]!.x)
			.map(({ y }) => y);
		expect(new Set(levels).size, id).toBeLessThanOrEqual(1);
	}
});

// Shaped like a real board, names replaced: two hosts side by side each send a
// labelled line into the store under them. Where Graphviz stood a label is
// arbitrary, and one line entered 20 px from the store's corner.
test("two labelled lines into one card enter it evenly", async () => {
	const fork = orderedFixture({
		nodes: [
			["left", "Host three", "Legacy services"],
			["right", "Host four", "Legacy services"],
			["store", "Shared store", "Existing shared production database."],
		].map(([id, name, responsibility]) => ({ id, name, kind: "module", responsibility })),
		edges: ["left", "right"].map((from) => ({
			id: from,
			from,
			to: "store",
			kind: "data",
			label: "Database connection",
		})),
	});
	const drawing = await renderArchitecture({ content: fork, theme: "light", layout: "track" });
	const store = drawing.atlas.nodes["store"]!;
	const routes = routePoints(drawing.svg);
	const [left, right] = ["left", "right"].map((id) => routes.get(id)!.at(-1)!.x);
	expect(Math.abs(left! - store.x - (store.x + store.width - right!))).toBeLessThanOrEqual(2);
});

/**
 * Where a container's heading words are painted: each line of its title and
 * summary, from its x to a width no narrower than its characters at 0.4 em.
 * @param svg The drawing.
 * @returns Each line's box, top to bottom.
 */
function headingLines(svg: string): { x: number; end: number; top: number; bottom: number }[] {
	return [
		...svg.matchAll(
			/data-depiction="container"[^>]*>([\s\S]*?)(?=<g data-semantic-kind=|$)/gu,
		),
	].flatMap(([, head]) =>
		[
			...head!.matchAll(
				/<text[^>]*x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</gu,
			),
		].map(([, x, y, size, words]) => ({
			x: Number(x),
			end: Number(x) + words!.length * Number(size) * 0.4,
			top: Number(y) - Number(size),
			bottom: Number(y),
		})),
	);
}

// Reduced from a dogfood board, names replaced: Graphviz stands a frame's
// heading row wherever it likes and runs lines beside it, but the words are
// painted from the frame's left edge, where those lines ran.
test("a line crossing a container's heading passes beside its words", async () => {
	const policy = SemanticPolicySchema.parse({
		levels: ["service"],
		nodeKinds: {
			module: { name: "Module", icon: "RiBox3Line" },
			function: { name: "Function", icon: "RiCodeSSlashLine" },
			external: { name: "External", icon: "RiExternalLinkLine" },
		},
		relationshipKinds: {
			call: { name: "Call", dash: "solid", arrowhead: "filled" },
			rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		},
		groups: {
			drawing: { name: "Drawing", color: "violet" },
			walkthrough: { name: "Walkthroughs", color: "cyan" },
		},
	});
	const content = orderedFixture(headingCrossing);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const lines = headingLines(drawing.svg);
	expect(lines.length).toBeGreaterThan(0);
	for (const [id, points] of routePoints(drawing.svg))
		points.slice(1).forEach((point, index) => {
			const previous = points[index]!;
			if (previous.x !== point.x) return;
			const struck = lines.some(
				(line) =>
					point.x >= line.x &&
					point.x <= line.end &&
					Math.min(previous.y, point.y) < line.bottom &&
					Math.max(previous.y, point.y) > line.top,
			);
			expect(struck, `${id} through a heading`).toBe(false);
		});
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
	const drawing = await renderArchitecture({ content: tall, theme: "light", layout: "track" });
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
