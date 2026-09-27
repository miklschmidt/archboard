// A group draws a region round its only member in a container, or at the
// board level, as round several (ADR 0038, amended 2026-09-27). What this
// catches: a region round one card packed as a block of its own, holding the
// labels of the lines into its card and standing it off its rank; a region's
// caption painted over a line leaving its card; and a label lost from a line
// into a container that such a region gathers.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	bodyShift,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import oneBrowserTwoUses from "./one-browser-two-uses.json";
import oneCommandPath from "./one-command-path.json";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		service: { name: "Service", icon: "RiServerLine" },
		system: { name: "System", icon: "RiApps2Line" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		state: { name: "Server state", color: "teal" },
	},
});

/** A drawn box. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * A fixture with one more node in a group.
 * @param fixture The fixture.
 * @param fixture.nodes Its nodes.
 * @param id The node.
 * @param group The group it joins.
 * @returns The fixture's content.
 */
function joined(fixture: { nodes: readonly object[] }, id: string, group: string) {
	return orderedFixture({
		...fixture,
		nodes: fixture.nodes.map((node) =>
			(node as { id: string }).id === id ? { ...node, groups: [group] } : node,
		),
	});
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
 * How much two boxes overlap.
 * @param one A box.
 * @param other Another.
 * @returns The area they share.
 */
function shared(one: Box, other: Box): number {
	const across = Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x);
	const down = Math.min(one.y + one.height, other.y + other.height) - Math.max(one.y, other.y);
	return Math.max(0, across) * Math.max(0, down);
}

// Reduced from a dogfood view: the one command module in its group drew a
// region packed as a block of its own, twice its card's height, round the
// labels of both lines through it, and moved the card off the column the
// lines above and below it run down.
test.each(["track", "blocks"] as const)(
	"the %s engine draws a region round one card that holds none of its lines' labels",
	async (layout) => {
		const content = joined(oneCommandPath, "cWbvcIYa", "writes");
		const drawn = await renderArchitecture({ content, theme: "light", policy, layout });
		const { box } = regionsOf(drawn.svg, "writes")[0]!;
		for (const [id, label] of routeLabels(drawn.svg))
			expect(shared(label, box), `${id} inside the region`).toBe(0);
	},
);

// Reduced from a dogfood view: a region round one card, drawn inline in a
// block whose top ports the lines out of it leave by, was headed on the ports'
// rank; its caption, painted at the region's corner, stood over the port a
// line out of the card slid to.
test("a line out of a region round one card passes beside its caption", async () => {
	const content = joined(oneBrowserTwoUses, "ZAj4RMzN", "walkthrough");
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { caption } = regionsOf(drawn.svg, "walkthrough")[0]!;
	for (const [id, points] of routePoints(drawn.svg))
		for (const [index, point] of points.slice(1).entries()) {
			const previous = points[index]!;
			const struck =
				previous.x === point.x &&
				point.x >= caption.x &&
				point.x <= caption.x + caption.width &&
				Math.min(previous.y, point.y) < caption.y + caption.height &&
				Math.max(previous.y, point.y) > caption.y;
			expect(struck, `${id} through the caption`).toBeFalse();
		}
});

// A container its group's only member at the board level: its region, packed
// as a block, holds the container's frame alone and draws only trunks, and the
// label of the line into the container, given to that region, was lost.
test("a labelled line into a container its group's region gathers keeps its label", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "gate", name: "Gateway", kind: "service" },
			{ id: "pool", name: "Host pool", kind: "system", groups: ["state"] },
			{ id: "one", name: "First host", kind: "service", parent: "pool", groups: ["state"] },
			{ id: "two", name: "Second host", kind: "service", parent: "pool", groups: ["state"] },
		],
		edges: [{ id: "in", from: "gate", to: "pool", kind: "call", label: "forwards to" }],
	});
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect([...routeLabels(drawn.svg).keys()]).toEqual(["in"]);
});
