// A group draws a region round its only member in a container, or at the
// board level, as round several (ADR 0038, amended 2026-09-27). Such a region
// is laid out as its card with a larger box (layout rules, section 44). What
// this catches: a region round one card or container laid out as a cluster
// or block of its own, which reordered the board's ranks, stood a container
// off the lines into it and ran lines through cards; a line that stops on the
// region's wall short of its card; a caption painted over a line into the
// card; and a label lost from a line into a container a packed region holds.

import { expect, test } from "bun:test";
import type { RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import type { VariantContent } from "@/shared/semantic-board/index";
import { routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import {
	bodyShift,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import legacyRouting from "./legacy-routing.json";
import recordingAWalkthrough from "./recording-a-walkthrough.json";
import startingAWorkhorse from "./starting-a-workhorse.json";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		system: { name: "System", icon: "RiApps2Line" },
		ui: { name: "Interface", icon: "RiLayoutLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
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
 * @returns The drawing.
 */
function drawn(content: VariantContent, layout: Engine): Promise<RenderedDiagram> {
	return renderArchitecture({ content, theme: "light", policy, layout });
}

/**
 * The cards a group alone places in their container or at the board level.
 * @param content The board.
 * @returns Their ids.
 */
function loneCards(content: VariantContent): string[] {
	const parents = new Set(
		content.nodes.flatMap(({ parent }) => (parent === undefined ? [] : [parent])),
	);
	return content.nodes
		.filter(({ id, groups }) => groups?.[0] !== undefined && !parents.has(id))
		.filter(
			(node) =>
				!content.nodes.some(
					(other) =>
						other !== node && other.parent === node.parent && other.groups?.[0] === node.groups![0],
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
	const lone = new Set(loneCards(content));
	return {
		...content,
		nodes: content.nodes.map(({ groups, ...node }) =>
			lone.has(node.id) || groups === undefined ? node : { ...node, groups },
		),
	};
}

/**
 * One number attribute of a tag.
 * @param tag The tag's attributes.
 * @param name The attribute.
 * @returns Its value.
 */
function read(tag: string, name: string): number {
	return Number(new RegExp(` ${name}="([^"]+)"`, "u").exec(tag)![1]);
}

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
			`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>\\s*<rect([^>]*)>\\s*<g class="ab-near"><text([^>]*)>([^<]*)<`,
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
 * Whether a point stands on a box's outline.
 * @param point The point.
 * @param point.x Its x.
 * @param point.y Its y.
 * @param box The box.
 * @returns True when it does.
 */
function onOutline({ x, y }: { x: number; y: number }, box: Box): boolean {
	const across = x > box.x - 2 && x < box.x + box.width + 2;
	const down = y > box.y - 2 && y < box.y + box.height + 2;
	return (
		(across && (near(y, box.y) || near(y, box.y + box.height))) ||
		(down && (near(x, box.x) || near(x, box.x + box.width)))
	);
}

/**
 * The cards of a drawing, read row by row: every card's id, ordered by the
 * rank its top stands on, then from left to right.
 * @param drawing The drawing.
 * @param cards The cards to read.
 * @returns Their ids, in reading order.
 */
function readingOrder(drawing: RenderedDiagram, cards: readonly string[]): string[] {
	const boxes = cards.map((id) => ({ id, box: drawing.atlas.nodes[id]! }));
	const rows = [...new Set(boxes.map(({ box }) => box.y))].toSorted((one, other) => one - other);
	const rowOf = (box: Box): number =>
		rows.findIndex((top) => box.y < top + 1 && box.y + box.height > top - 1);
	return boxes
		.toSorted((one, other) => rowOf(one.box) - rowOf(other.box) || one.box.x - other.box.x)
		.map(({ id }) => id);
}

// Reduced from a dogfood view: three regions round one card each, laid out
// as clusters of their own, pulled their cards off the ranks the board stood
// them on, stood the voice region as a tall sparse band and bent the lines
// round it.
test.each(["track", "blocks"] as const)(
	"the %s engine reads the cards of a board as it does without its regions round one card",
	async (layout) => {
		const content = orderedFixture(recordingAWalkthrough);
		expect(loneCards(content).length).toBeGreaterThan(0);
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

// Reduced from a dogfood view: the region round one card drawn inline in a
// block of cards packed on its own ran three lines through the card beside it.
test.each(["track", "blocks"] as const)(
	"the %s engine runs no line through a card and carries every line to its card alone in a region",
	async (layout) => {
		const content = orderedFixture(startingAWorkhorse);
		const drawing = await drawn(content, layout);
		expect(routesThroughCards(drawing, content)).toEqual([]);
		const lone = new Set(loneCards(content));
		const routes = routePoints(drawing.svg);
		for (const edge of content.edges) {
			const points = routes.get(edge.id)!;
			if (lone.has(edge.from))
				expect(onOutline(points[0]!, drawing.atlas.nodes[edge.from]!), edge.id).toBeTrue();
			if (lone.has(edge.to))
				expect(onOutline(points.at(-1)!, drawing.atlas.nodes[edge.to]!), edge.id).toBeTrue();
		}
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
		expect(regionsOf(drawing.svg, "walkthrough").length).toBe(2);
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
