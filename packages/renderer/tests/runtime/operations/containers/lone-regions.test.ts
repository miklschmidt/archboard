// A group draws a region round its only member in a container, or at the
// board level, as round several (ADR 0038, amended 2026-09-27). Such a region
// is laid out as its card with a larger box (layout rules, section 44). What
// this catches: a region round one card or container laid out as a cluster
// or block of its own, which reordered the board's ranks, stood a container
// off the lines into it and ran lines through cards; a line that stops on the
// region's wall, or in its inset beside the node, short of its node; a
// container alone in its region fitted tighter round what it holds; a caption
// painted over a line into the card; a label lost from a line into a
// container a packed region holds; and a caption run past the wall of a
// region round a container.
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { placingGroups, type VariantContent } from "@archboard/board/content";
import { routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import {
	bodyShift,
	routeLabels,
	routePoints,
	turnsOf,
} from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import aSpokenInstruction from "#tests/runtime/support/fixtures/a-spoken-instruction.json";
import boardRequestPath from "#tests/runtime/support/fixtures/board-request-path.json";
import commandInterface from "#tests/runtime/support/fixtures/command-interface.json";
import legacyRouting from "#tests/runtime/support/fixtures/legacy-routing.json";
import liveServerState from "#tests/runtime/support/fixtures/live-server-state.json";
import readingABoard from "#tests/runtime/support/fixtures/reading-a-board-panes.json";
import recordingAWalkthrough from "#tests/runtime/support/fixtures/recording-a-walkthrough.json";
import startingAWorkhorse from "#tests/runtime/support/fixtures/starting-a-workhorse.json";
import whatTheCliCanBeAsked from "#tests/runtime/support/fixtures/what-the-cli-can-be-asked.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		system: { name: "System", icon: "RiApps2Line" },
		ui: { name: "Interface", icon: "RiLayoutLine" },
		function: { name: "Function", icon: "RiCodeLine" },
		route: { name: "Route", icon: "RiRouteLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		agent: { name: "Agent", color: "pink" },
		voice: { name: "Voice", color: "yellow" },
		child: { name: "Codex child", color: "violet" },
		state: { name: "Server state", color: "teal" },
		panes: { name: "Live panes", color: "teal" },
		checks: { name: "Vault checks", color: "pink" },
		workhorse: { name: "Workhorse", color: "sky" },
	},
});

/** A drawn box. */
type Box = { x: number; y: number; width: number; height: number };

/** An engine that lays regions out. */
type Engine = "track" | "blocks";

/**
 * Draw a fixture.
 * @param content The board.
 * @param layout The engine.
 * @param under The policy, if not the fixtures' own.
 * @returns The drawing.
 */
function drawn(content: VariantContent, layout: Engine, under = policy): Promise<RenderedDiagram> {
	return renderArchitecture({ content, theme: "light", policy: under, layout });
}

/**
 * The cards and containers a group alone places in their container or at
 * the board level.
 * @param content The board.
 * @returns Their ids.
 */
function loneNodes(content: VariantContent): string[] {
	const placing = placingGroups(content.nodes, policy);
	return content.nodes
		.filter(({ id }) => placing.has(id))
		.filter(
			(node) =>
				!content.nodes.some(
					(other) =>
						other !== node &&
						other.parent === node.parent &&
						placing.get(other.id) === placing.get(node.id),
				),
		)
		.map(({ id }) => id);
}

/**
 * A fixture with the memberships of its cards alone in their regions taken out.
 * @param content The board.
 * @returns It, with no region round one card.
 */
function ungrouped(content: VariantContent): VariantContent {
	const lone = new Set(loneNodes(content));
	return {
		...content,
		nodes: content.nodes.map(({ groups, ...node }) =>
			lone.has(node.id) || groups === undefined ? node : { ...node, groups },
		),
	};
}

/** One number attribute of a tag's attributes. */
const read = (tag: string, name: string): number =>
	Number(new RegExp(` ${name}="([^"]+)"`, "u").exec(tag)![1]);

/**
 * Every region one group draws, read from the drawn document, on the page:
 * its outline and where its caption's words are painted, from their x to a
 * width no narrower than their characters at 0.4 em.
 * @param svg The document.
 * @param group The group.
 * @returns Each region's box and caption.
 */
function regionsOf(svg: string, group: string): { box: Box; caption: Box }[] {
	const shift = bodyShift(svg);
	const found = svg.matchAll(
		new RegExp(
			// The region's box is its mat's first shape; its words follow the tab they are printed on.
			`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>\\s*<rect([^>]*)>[\\s\\S]*?<g class="ab-near">(?:<(?!text)[^>]*>\\s*)*<text([^>]*)>([^<]*)<`,
			"gu",
		),
	);
	return [...found].map(([, rect, text, words]) => {
		const size = read(text!, "font-size");
		return {
			box: {
				x: read(rect!, "x") + shift.x,
				y: read(rect!, "y") + shift.y,
				width: read(rect!, "width"),
				height: read(rect!, "height"),
			},
			caption: {
				x: read(text!, "x") + shift.x,
				y: read(text!, "y") + shift.y - size,
				width: words!.length * size * 0.4,
				height: size,
			},
		};
	});
}

/**
 * Whether two coordinates are one, as drawn.
 * @param one A coordinate.
 * @param other Another.
 * @returns True when they are.
 */
function near(one: number, other: number): boolean {
	return Math.abs(one - other) < 2;
}

/**
 * Whether a point stands on a card's face, clear of its rounded corners.
 * @param point The point.
 * @param point.x Its x.
 * @param point.y Its y.
 * @param box The card's box.
 * @param corner The radius of its corners.
 * @returns True when it does.
 */
function onFace({ x, y }: { x: number; y: number }, box: Box, corner: number): boolean {
	const across = x > box.x + corner + 0.5 && x < box.x + box.width - corner - 0.5;
	const down = y > box.y + corner + 0.5 && y < box.y + box.height - corner - 0.5;
	return (
		(across && (near(y, box.y) || near(y, box.y + box.height))) ||
		(down && (near(x, box.x) || near(x, box.x + box.width)))
	);
}

/**
 * The radius of a card's corners, as drawn.
 * @param svg The document.
 * @param card The card.
 * @returns The radius.
 */
function cornerOf(svg: string, card: string): number {
	const deck = new RegExp(
		`<g data-semantic-kind="node" data-semantic-id="${card}"[^>]*>\\s*(?:<rect class="ab-halo"[^>]*>\\s*)?<rect(?! class="ab-halo")[^>]* rx="([^"]+)"`,
		"u",
	).exec(svg);
	return Number(deck![1]);
}

/**
 * Whether a point stands in a box or on its outline.
 * @param point The point.
 * @param point.x Its x.
 * @param point.y Its y.
 * @param box The box.
 * @returns True when it does.
 */
function within({ x, y }: { x: number; y: number }, box: Box): boolean {
	return x > box.x - 2 && x < box.x + box.width + 2 && y > box.y - 2 && y < box.y + box.height + 2;
}

/**
 * The cards of a drawing, read row by row: every card's id, ordered by the
 * row it stands on, then from left to right. A row is the height of the
 * topmost card on it, and a card stands on the first row it shares some
 * height with: a card a region round it lowers under its caption stays on
 * its rank's row.
 * @param drawing The drawing.
 * @param cards The cards to read.
 * @returns Their ids, in reading order.
 */
function readingOrder(drawing: RenderedDiagram, cards: readonly string[]): string[] {
	const boxes = cards
		.map((id) => ({ id, box: drawing.atlas.nodes[id]! }))
		.toSorted((one, other) => one.box.y - other.box.y);
	const rows: Box[] = [];
	const rowOf = new Map<string, number>();
	for (const { id, box } of boxes) {
		const at = rows.findIndex((row) => box.y < row.y + row.height && box.y + box.height > row.y);
		if (at === -1) rows.push(box);
		rowOf.set(id, at === -1 ? rows.length - 1 : at);
	}
	return boxes
		.toSorted((one, other) => rowOf.get(one.id)! - rowOf.get(other.id)! || one.box.x - other.box.x)
		.map(({ id }) => id);
}

// Reduced from dogfood views. Recording a walkthrough: three regions round
// one card each, laid out as clusters of their own, pulled their cards off
// the ranks the board stood them on, stood the voice region as a tall sparse
// band and bent the lines round it. A spoken instruction becomes work: a port
// settled on the inset beside the card alone in its region stepped the line
// out of it, and for that bend the board kept a port order that stood the
// cards of a container the other way round. The room regions round one card
// take moves the routes round them, and the choices weighed on those routes
// turned: What the CLI can be asked parted four lines into Board client for a
// hop more and 21% more line, and wrapped its widest rank's cards into other
// rows; Working with an agent moved four more ports to side walls and stood
// Pane session off to the middle.
const readAsWithout = [
	["Recording a walkthrough", "track", recordingAWalkthrough],
	["Recording a walkthrough", "blocks", recordingAWalkthrough],
	["A spoken instruction becomes work", "blocks", aSpokenInstruction],
	["What the CLI can be asked", "blocks", whatTheCliCanBeAsked],
	["Working with an agent", "blocks", workingWithAnAgent],
] as const;
test.each(readAsWithout)(
	"%s: the %s engine reads the cards as it does without its regions round one node",
	async (_board, layout, fixture) => {
		const content = orderedFixture(fixture);
		expect(loneNodes(content).length).toBeGreaterThan(0);
		const cards = content.nodes
			.filter(({ id }) => !content.nodes.some(({ parent }) => parent === id))
			.map(({ id }) => id);
		const [grouped, plain] = await Promise.all([
			drawn(content, layout),
			drawn(ungrouped(content), layout),
		]);
		expect(readingOrder(grouped, cards)).toEqual(readingOrder(plain, cards));
	},
);

/**
 * The line ends at a card or container alone in its region that stop short
 * of it: off a card's face or in its rounded corner, or outside a container,
 * whose lines may meet its title row.
 * @param content The board.
 * @param drawing Its drawing.
 * @returns Each such end, by its line's id.
 */
function endsOffNode(content: VariantContent, drawing: RenderedDiagram): string[] {
	const lone = new Set(loneNodes(content));
	const containers = new Set(content.nodes.flatMap(({ parent }) => parent ?? []));
	const routes = routePoints(drawing.svg);
	const meets = (node: string, at: { x: number; y: number }): boolean => {
		const box = drawing.atlas.nodes[node]!;
		return containers.has(node) ? within(at, box) : onFace(at, box, cornerOf(drawing.svg, node));
	};
	return content.edges.flatMap((edge) => {
		const points = routes.get(edge.id)!;
		const ends = [
			{ node: edge.from, at: points[0]!, end: "from" },
			{ node: edge.to, at: points.at(-1)!, end: "to" },
		];
		return ends
			.filter(({ node, at }) => lone.has(node) && !meets(node, at))
			.map(({ end }) => `${edge.id} ${end}`);
	});
}

// Reduced from a dogfood view: the region round one card drawn inline in a
// block of cards packed on its own ran three lines through the card beside it.
test.each(["track", "blocks"] as const)(
	"the %s engine runs no line through a card and carries every line to its card alone in a region",
	async (layout) => {
		const content = orderedFixture(startingAWorkhorse);
		const drawing = await drawn(content, layout);
		expect(routesThroughCards(drawing, content)).toEqual([]);
		expect(endsOffNode(content, drawing)).toEqual([]);
	},
);

// A container alone in its region, inside another container.
const loneContainer = {
	nodes: [
		{ id: "outer", name: "Outer", kind: "system" },
		{ id: "inner", name: "Inner", kind: "system", parent: "outer", groups: ["state"] },
		{ id: "kid", name: "Kid", kind: "module", parent: "inner" },
		{ id: "sib", name: "Sib", kind: "module", parent: "outer" },
		{ id: "top", name: "Top", kind: "service" },
	],
	edges: [
		{ id: "in", from: "top", to: "inner", kind: "call" },
		{ id: "down", from: "sib", to: "kid", kind: "call" },
		{ id: "out", from: "inner", to: "sib", kind: "call" },
	],
};

// A line may reach the wall of a region round one node anywhere along it,
// the region's inset beside the node included: into a container drawn
// inline alone in its region, and between cards alone in theirs in two
// containers packed apart, it stopped in that inset, beside its node. Live
// server state, reduced from a dogfood view: a port settled against the one
// card alone in its region its line runs to, over the region's box, ended
// the line into Codex workbench in the card's rounded corner.
const besideTheNode = {
	"a container alone in its region inside another": loneContainer,
	"Live server state": liveServerState,
	"cards alone in their regions in two containers": {
		nodes: [
			{ id: "left", name: "Left", kind: "system" },
			{ id: "reader", name: "Reader", kind: "module", parent: "left", groups: ["state"] },
			{ id: "other", name: "Other", kind: "module", parent: "left" },
			{ id: "right", name: "Right", kind: "system" },
			{ id: "writer", name: "Writer", kind: "module", parent: "right", groups: ["state"] },
			{ id: "second", name: "Other two", kind: "module", parent: "right" },
		],
		edges: [
			{ id: "across", from: "reader", to: "writer", kind: "call" },
			{ id: "in", from: "other", to: "reader", kind: "call" },
			{ id: "on", from: "writer", to: "second", kind: "call" },
			{ id: "back", from: "second", to: "reader", kind: "call" },
		],
	},
};
test.each(
	Object.keys(besideTheNode).flatMap((board) =>
		(["track", "blocks"] as const).map((layout) => [board, layout] as const),
	),
)("%s: the %s engine carries every line on to the node", async (board, layout) => {
	const content = orderedFixture(besideTheNode[board as keyof typeof besideTheNode]);
	expect(endsOffNode(content, await drawn(content, layout))).toEqual([]);
});

// Reduced from dogfood boards. Board request path: a line whose lane stood a little inside the
// face of a card alone in its region, nearer its corner than a port is moved to, stepped aside
// above the region to reach the card. Command interface: its ports settled as the board without
// its regions round one card settled them, the four 'board operation' lines into Board writes
// stepped twice more each. Reading a board: a port a margin in from Pane session's own face
// stepped its line aside under the region. Lines alike in emphasis and traffic: unlike ones part
// lanes.
const turnsAsWithout = {
	"Board request path": boardRequestPath,
	"Command interface": commandInterface,
	"Reading a board": readingABoard,
};
async function turns(content: VariantContent): Promise<Map<string, number>> {
	const picture = await drawn(content, "track");
	return new Map([...routePoints(picture.svg)].map(([id, points]) => [id, turnsOf(points)]));
}

test.each(Object.keys(turnsAsWithout))(
	"%s: the track engine turns no line more than without its regions round one card",
	async (board) => {
		const content = orderedFixture(turnsAsWithout[board as keyof typeof turnsAsWithout]);
		for (const e of content.edges) Object.assign(e, { emphasis: "normal", traffic: undefined });
		const [grouped, plain] = await Promise.all([turns(content), turns(ungrouped(content))]);
		for (const [id, count] of grouped) expect(count, id).toBeLessThanOrEqual(plain.get(id)!);
	},
);

// A container alone in its region, drawn inline, was fitted to what it holds
// by a container's inset from the region's walls, and its own walls then
// stood that much less round what it holds. Drawn as a block with a port on
// its bottom, it stood the region's inset more below what it holds.
test.each(["track", "blocks"] as const)(
	"the %s engine keeps a container alone in its region as far round what it holds as without the region",
	async (layout) => {
		const content = orderedFixture(loneContainer);
		const margins = async (board: VariantContent): Promise<number[]> => {
			const { atlas } = await drawn(board, layout);
			const [inner, kid] = [atlas.nodes["inner"]!, atlas.nodes["kid"]!];
			return [
				kid.x - inner.x,
				inner.x + inner.width - kid.x - kid.width,
				inner.y + inner.height - kid.y - kid.height,
			].map(Math.round);
		};
		expect(await margins(content)).toEqual(await margins(ungrouped(content)));
	},
);

// Reduced from a dogfood view: the one line into the voice region's card
// arrives near its left wall, where the caption's words stand.
test("a region round one card paints its caption beside the lines into the card", async () => {
	const drawing = await drawn(orderedFixture(startingAWorkhorse), "track");
	const { caption } = regionsOf(drawing.svg, "voice")[0]!;
	for (const [id, points] of routePoints(drawing.svg))
		for (const [index, point] of points.slice(1).entries()) {
			const previous = points[index]!;
			const struck =
				Math.abs(previous.x - point.x) < 0.5 &&
				point.x >= caption.x &&
				point.x <= caption.x + caption.width &&
				Math.min(previous.y, point.y) < caption.y + caption.height &&
				Math.max(previous.y, point.y) > caption.y;
			expect(struck, `${id} through the caption`).toBeFalse();
		}
});

// Reduced from a board of a work vault, letters replaced: a chain of cards
// above a wide pool that is its group's only member at the board level. Its
// region, laid out as a cluster or a block of its own, stood the pool off the
// chain, and the line into it ran across to reach it.
test.each(["track", "blocks"] as const)(
	"the %s engine stands a chain over the middle of a container alone in its region",
	async (layout) => {
		const drawing = await drawn(orderedFixture(legacyRouting), layout);
		const [balancer, pool] = [drawing.atlas.nodes["zYCHWE5R"]!, drawing.atlas.nodes["2cGTPFaw"]!];
		expect(Math.abs(balancer.x + balancer.width / 2 - (pool.x + pool.width / 2))).toBeLessThan(1);
	},
);

// Two containers their group gathers at the board level: packed as a block,
// their region holds their frames alone and draws only trunks, and the label
// of a line into one of them, given to that region, was lost.
test("a labelled line into a container its group's region packs keeps its label", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "gate", name: "Gateway", kind: "service" },
			{ id: "pool", name: "Host pool", kind: "system", groups: ["state"] },
			{ id: "one", name: "First host", kind: "service", parent: "pool" },
			{ id: "spare", name: "Spare pool", kind: "system", groups: ["state"] },
			{ id: "two", name: "Second host", kind: "service", parent: "spare" },
		],
		edges: [{ id: "in", from: "gate", to: "pool", kind: "call", label: "forwards to" }],
	});
	const drawing = await drawn(content, "blocks");
	expect([...routeLabels(drawing.svg).keys()]).toEqual(["in"]);
});

// A caption wider than the node alone in its region widens the region, not the
// node, which stands in its middle with its lines ending on it. A card stood
// stretched across the region; round a container the region stood no wider
// than the container, and the caption ran past its wall.
const captioned = SemanticPolicySchema.parse({
	...policy,
	groups: { state: { name: "A group whose caption runs far wider than its node", color: "teal" } },
});
const part = (id: string, more = {}) => ({ id, name: id, kind: "module", ...more });
const alone = { groups: ["state"] };
const underCaption = {
	card: [part("one", alone), part("two")],
	container: [part("a"), part("box", { ...alone, kind: "system" }), part("k", { parent: "box" })],
};
test.each(["track", "blocks"].flatMap((by) => ["card", "container"].map((round) => [by, round])))(
	"the %s engine widens the region round a %s alone in it for its caption",
	async (layout, round) => {
		const nodes = underCaption[round as keyof typeof underCaption];
		const edges = [{ id: "on", from: nodes[0]!.id, to: nodes.at(-1)!.id, kind: "call" }];
		const content = orderedFixture({ nodes, edges });
		const [drawing, plain] = await Promise.all(
			[content, ungrouped(content)].map((board) => drawn(board, layout as Engine, captioned)),
		);
		const { box: region, caption } = regionsOf(drawing!.svg, "state")[0]!;
		const [lone] = loneNodes(content);
		const own = drawing!.atlas.nodes[lone!]!;
		expect(caption.x + caption.width).toBeLessThanOrEqual(region.x + region.width);
		expect(own.width).toBe(plain!.atlas.nodes[lone!]!.width);
		expect(Math.abs(own.x + own.width / 2 - region.x - region.width / 2)).toBeLessThan(1);
		expect(endsOffNode(content, drawing!)).toEqual([]);
	},
);
