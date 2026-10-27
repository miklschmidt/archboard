import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { placingGroups, type VariantContent } from "@archboard/board/content";
import { routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import { bodyShift, routeLabels, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import legacyRouting from "#tests/runtime/support/fixtures/legacy-routing.json";
import liveServerState from "#tests/runtime/support/fixtures/live-server-state.json";
import startingAWorkhorse from "#tests/runtime/support/fixtures/starting-a-workhorse.json";

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

test("the track engine stands a chain over the middle of a container alone in its region", async () => {
	const drawing = await drawn(orderedFixture(legacyRouting), "track");
	const [balancer, pool] = [drawing.atlas.nodes["zYCHWE5R"]!, drawing.atlas.nodes["2cGTPFaw"]!];
	expect(Math.abs(balancer.x + balancer.width / 2 - (pool.x + pool.width / 2))).toBeLessThan(1);
});

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
