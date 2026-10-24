// Where the track engine stands a card sideways (TASK-349). What this
// catches: a card fed by a fan standing off its middle, so the fan's lines
// land unevenly on it; and a wrap standing a card in a line's way, or away
// from the port its one line leaves; and the label of a line leaving a container standing beside
// it, where the card the line leads into follows it out past the container's
// wall; and a board's containers stacked or not by a near tie, given to the
// page that fits the pane better however little, at the cost of a crossing;
// and a group region's ports held where its parent settled them, off their
// lines.

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { SemanticPolicySchema, DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { LAYOUT_ASPECT } from "#shared/constants/shell-geometry.ts";
import {
	corridorPoints,
	routeLabels,
	routePoints,
	routesCross,
} from "#tests/runtime/support/drawn-routes.ts";
import underPort from "#tests/runtime/support/fixtures/under-port.json";
import browserApplication from "#tests/runtime/support/fixtures/browser-application.json";
import grading from "#tests/runtime/support/fixtures/grading.json";
import reservedLane from "#tests/runtime/support/fixtures/reserved-label-lane.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";
import wrappedBlocker from "#tests/runtime/support/fixtures/wrapped-blocker.json";

/**
 * A card's centre across the page.
 * @param box The card's box.
 * @param box.x Its left edge.
 * @param box.width Its width.
 * @returns Its centre.
 */
function centre({ x, width }: { x: number; width: number }): number {
	return x + width / 2;
}

// Reduced from a real hosting board, names replaced: two mirrored pairs of
// servers, each pair feeding one database through labelled lines. Graphviz
// left one database anywhere between its two servers.
test("a card two cards of one rank feed stands midway under them", async () => {
	const feeds = { da: ["v0", "v1"], db: ["v2", "v3"] };
	const content = orderedFixture({
		nodes: ["v0", "v1", "v2", "v3", "da", "db"].map((id) => ({
			id,
			name: `Part ${id}`,
			kind: "service",
			responsibility: "legacy work",
		})),
		edges: Object.entries(feeds).flatMap(([to, from]) =>
			from.map((one) => ({
				id: `${one}${to}`,
				from: one,
				to,
				kind: "data",
				label: "Database connection",
			})),
		),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	for (const [to, from] of Object.entries(feeds)) {
		const [one, other] = from.map((id) => centre(drawing.atlas.nodes[id]!));
		expect(Math.abs(centre(drawing.atlas.nodes[to]!) - (one! + other!) / 2)).toBeLessThan(1);
	}
});

/** The vocabulary the reduced wrap fixtures draw with. */
const wrapPolicy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: Object.fromEntries(
		["module", "function", "service", "external"].map((kind) => [
			kind,
			{ name: kind, icon: "RiBox3Line" },
		]),
	),
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		inner: { name: "Inner", color: "purple" },
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		checks: { name: "Vault checks", color: "pink" },
	},
});

/**
 * Whether a drawn line runs straight down, with no bend.
 * @param svg The drawing.
 * @param id The line.
 * @returns True when every point of it stands on one column.
 */
function dropsStraight(svg: string, id: string): boolean {
	const points = routePoints(svg).get(id)!;
	return points.every((point) => Math.abs(point.x - points[0]!.x) < 0.5);
}

// Reduced from a board of this repository, names replaced: a wrap stood a
// card with no line of its own to either end in the column between a card
// and the card its line drops to, and the line stepped around it.
test("a wrapped card stands aside from a line that drops straight past it", async () => {
	const content = orderedFixture(wrappedBlocker);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: wrapPolicy,
		layout: "track",
	});
	expect(dropsStraight(drawing.svg, "e6")).toBe(true);
});

// Reduced from a board of this repository, names replaced: two cards below a
// group region, each with one line from inside it, were wrapped under
// unrelated cards, and both lines stepped across to them.
test("a wrapped card whose one line leaves a region stands under it", async () => {
	const content = orderedFixture(underPort);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: wrapPolicy,
		layout: "track",
	});
	for (const id of ["e3", "e6"]) expect(dropsStraight(drawing.svg, id), id).toBe(true);
});

// Two chained cards in a container, both with a labelled line to a card below
// it: the first line's label stood beside the container on the second card's
// rank, and the card below followed it out past the container's wall.
test("a line leaving a container stands its label below the container", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "lib", name: "Shared library", kind: "system", responsibility: "One shared release" },
			{
				id: "a",
				name: "Customer behaviour",
				kind: "module",
				parent: "lib",
				responsibility: "Public contract rules live inside the monolith",
			},
			{
				id: "b",
				name: "Ambient glue",
				kind: "module",
				parent: "lib",
				responsibility: "Caches, auth and logging create implicit runtime dependencies",
			},
			{ id: "x", name: "Data library", kind: "module", responsibility: "Generated model" },
		],
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call", label: "uses ambient helpers" },
			{ id: "ax", from: "a", to: "x", kind: "call", label: "uses generated model" },
			{ id: "bx", from: "b", to: "x", kind: "call", label: "reads the model too" },
		],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const frame = drawing.atlas.nodes["lib"]!;
	const label = routeLabels(drawing.svg).get("ax")!;
	expect(label.y).toBeGreaterThanOrEqual(frame.y + frame.height);
});

// Reduced from a real library board: pulling the labels of lines leaving a
// container below it answered with another ranking of the whole block, on a
// page 170 px wider and 30 px taller, which the score alone did not refuse.
test("a leaving label is pulled below its container only on no more page", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(reservedLane),
		theme: "light",
		policy: SemanticPolicySchema.parse({
			levels: ["service"],
			nodeKinds: Object.fromEntries(
				["external", "service", "datastore", "module"].map((kind) => [
					kind,
					{ name: kind, icon: "RiBox3Line" },
				]),
			),
			relationshipKinds: {
				http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
				call: { name: "Call", dash: "solid", arrowhead: "filled" },
				dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
				data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
			},
		}),
		layout: "track",
	});
	expect(drawing.width).toBeLessThan(2100);
});

/** The vocabulary of the Browser application board's fixtures. */
const browserPolicy = SemanticPolicySchema.parse({
	levels: ["system", "service", "module"],
	nodeKinds: Object.fromEntries(
		["system", "service", "module", "ui"].map((kind) => [kind, { name: kind, icon: "RiBox3Line" }]),
	),
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		agent: { name: "Agent", color: "fuchsia" },
	},
});

// Taken from a board of this repository: its containers laid stacked scored
// within a twentieth of laid as Graphviz ranks them, on a page far taller
// than the pane's proportions, and a wider clearance off group regions'
// walls tipped it to the tall page.
test("a board that reads about as well stacked keeps the page that fits the pane better", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(browserApplication),
		theme: "light",
		policy: browserPolicy,
		layout: "track",
	});
	expect(drawing.width / drawing.height).toBeGreaterThan(LAYOUT_ASPECT);
});

// Taken from a board of this repository: its containers laid stacked scored
// within a twentieth of laid as Graphviz ranks them, one crossing more on a
// page that fit the pane only a little better, and a wider clearance off a
// container's wall tipped it to the stacked layout, its lines through a group
// region they have no card in: 'the pane socket: registration and news'
// crossed 'controllers over the focused pane's'. Fit never buys a crossing.
test("a board stays as Graphviz ranks its containers where stacking them crosses more", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: browserPolicy,
		layout: "track",
	});
	const routes = corridorPoints(drawing.svg);
	expect(routesCross(routes.get("PuILGsjg")!, routes.get("kZtsu0nq")!)).toBe(false);
});

// Taken from a board of this repository: a group region packed as a block of
// its own is routed again from where its parent settled its ports, and those
// ports were held there, so three lines out of it through its bottom wall
// stepped aside where each could run straight down from its card.
test("a group region routed again slides its settled ports onto their lines", async () => {
	const content = orderedFixture(grading);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: SemanticPolicySchema.parse({
			levels: ["service"],
			nodeKinds: Object.fromEntries(
				["module", "external"].map((kind) => [kind, { name: kind, icon: "RiBox3Line" }]),
			),
			relationshipKinds: {
				call: { name: "Call", dash: "solid", arrowhead: "filled" },
				data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
			},
			groups: { grading: { name: "Grading", color: "purple" } },
		}),
		layout: "track",
	});
	const members = new Set(
		content.nodes.filter(({ groups }) => groups?.includes("grading")).map(({ id }) => id),
	);
	const leaving = content.edges.filter(({ from, to }) => members.has(from) && !members.has(to));
	expect(leaving.length).toBeGreaterThan(0);
	for (const { id } of leaving) expect(dropsStraight(drawing.svg, id), id).toBe(true);
});
