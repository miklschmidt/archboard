// A group gathers the cards it places inside one container into one region,
// drawn in its colour with its name (TASK-347). What this catches: a group's
// members scattered among other cards, a region drawn around a card the
// group does not place, a caption naming something other than the group, a
// nested region's caption floating ranks above its members, and a frame
// keeping the strip Graphviz reserved for a label the router moved.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import {
	bodyShift,
	boxesOverlap,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import codexWorkhorse from "./codex-workhorse.json";
import nestedRegion from "./nested-region.json";
import sideSlack from "./side-slack.json";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
	},
	groups: {
		state: { name: "Server state", color: "teal" },
		routes: { name: "Routes", color: "violet" },
		drawing: { name: "Drawing", color: "violet" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
	},
});

const content = orderedFixture({
	nodes: [
		{ id: "cli", name: "Agent CLI", kind: "module" },
		{ id: "read", name: "Read route", kind: "module", groups: ["routes"] },
		{ id: "write", name: "Write route", kind: "module", groups: ["routes"] },
		{ id: "store", name: "Board store", kind: "module", groups: ["state"] },
		{ id: "lease", name: "Board lease", kind: "module", groups: ["state"] },
		{ id: "feed", name: "Change feed", kind: "module" },
	],
	edges: [
		{ id: "e1", from: "cli", to: "read", kind: "call", label: "read a board" },
		{ id: "e2", from: "cli", to: "write", kind: "call", label: "write a board" },
		{ id: "e3", from: "read", to: "store", kind: "call", label: "read" },
		{ id: "e4", from: "write", to: "lease", kind: "call", label: "hold the lease" },
		{ id: "e5", from: "write", to: "store", kind: "call", label: "commit" },
		{ id: "e6", from: "store", to: "feed", kind: "call", label: "announce" },
	],
});

/** A drawn box. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * Every region one group draws, read from the drawn document.
 * @param svg The document.
 * @param group The group.
 * @returns Their boxes, in drawing order.
 */
function regionBoxes(svg: string, group: string): Box[] {
	const markups = svg.matchAll(
		new RegExp(
			`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>([\\s\\S]*?)</g>`,
			"gu",
		),
	);
	return [...markups].map(([, markup]) => {
		const [x, y, width, height] = ["x", "y", "width", "height"].map((name) =>
			Number(new RegExp(`<rect[^>]* ${name}="([^"]+)"`, "u").exec(markup!)![1]),
		);
		return { x: x!, y: y!, width: width!, height: height! };
	});
}

/**
 * A group's first region, read from the drawn document.
 * @param svg The document.
 * @param group The group.
 * @returns Its box.
 */
function regionBox(svg: string, group: string): Box {
	return regionBoxes(svg, group)[0]!;
}

/**
 * Whether one box lies wholly inside another.
 * @param box The inner box.
 * @param band The outer box.
 * @returns True when it does.
 */
function within(box: Box, band: Box): boolean {
	return (
		box.x >= band.x &&
		box.y >= band.y &&
		box.x + box.width <= band.x + band.width &&
		box.y + box.height <= band.y + band.height
	);
}

test.each(["track", "blocks"] as const)(
	"the %s engine gathers the cards a group places into one outlined region, captioned with its name",
	async (layout) => {
		const drawn = await renderArchitecture({ content, theme: "light", policy, layout });
		for (const [group, members, name] of [
			["routes", ["read", "write"], "Routes"],
			["state", ["store", "lease"], "Server state"],
		] as const) {
			const band = regionBox(drawn.svg, group);
			// It names what it holds, which a viewer lights it with.
			const named = new RegExp(`data-group="${group}" data-members="([^"]*)"`, "u").exec(drawn.svg);
			expect(named?.[1]?.split(" ")).toEqual([...members]);
			const inside = (id: string): boolean => within(drawn.atlas.nodes[id]!, band);
			for (const id of members) expect(inside(id), `${id} inside ${group}`).toBeTrue();
			for (const id of ["cli", "feed"]) expect(inside(id), `${id} outside ${group}`).toBeFalse();
			expect(drawn.svg).toContain(`>${name}</text>`);
			// An outline, never a tinted band: what it holds reads on the page as elsewhere.
			const outline = new RegExp(
				`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>\\s*<rect[^>]*>`,
				"u",
			).exec(drawn.svg)![0];
			expect(outline).toMatch(/fill(:|=")none/u);
			// From far away its caption grows with the cards' names.
			const sizes = [
				...new RegExp(
					`data-group="${group}"[\\s\\S]*?class="ab-near"[\\s\\S]*?font-size="([\\d.]+)"[\\s\\S]*?class="ab-far"[\\s\\S]*?font-size="([\\d.]+)"`,
					"u",
				).exec(drawn.svg)!,
			].slice(1);
			expect(Number(sizes[1])).toBeGreaterThan(Number(sizes[0]));
		}
	},
);

// The user's request of 2026-09-27 (ADR 0038): a group whose members are
// spread over several containers and the board level draws a region in each,
// round a lone member too, and the lone member takes the group's colour.
test.each(["track", "blocks"] as const)(
	"the %s engine draws a group's region in every container holding a member, one member or more",
	async (layout) => {
		const spread = orderedFixture({
			nodes: [
				{ id: "cli", name: "Agent CLI", kind: "module" },
				{ id: "lone", name: "Board store", kind: "module", groups: ["state"] },
				{ id: "one", name: "Read service", kind: "service" },
				{ id: "a", name: "Read cache", kind: "module", parent: "one", groups: ["state"] },
				{ id: "r", name: "Read route", kind: "module", parent: "one" },
				{ id: "two", name: "Write service", kind: "service" },
				{ id: "b", name: "Board lease", kind: "module", parent: "two", groups: ["state"] },
				{ id: "c", name: "Change feed", kind: "module", parent: "two", groups: ["state"] },
			],
			edges: [
				{ id: "e1", from: "cli", to: "r", kind: "call" },
				{ id: "e2", from: "r", to: "a", kind: "call" },
				{ id: "e3", from: "cli", to: "b", kind: "call" },
				{ id: "e4", from: "b", to: "c", kind: "call" },
				{ id: "e5", from: "c", to: "lone", kind: "call" },
			],
		});
		const drawn = await renderArchitecture({ content: spread, theme: "light", policy, layout });
		const cards = Object.keys(drawn.atlas.nodes);
		const held = regionBoxes(drawn.svg, "state").map((band) =>
			cards.filter((id) => within(drawn.atlas.nodes[id]!, band)).toSorted(),
		);
		expect(held.toSorted()).toEqual([["a"], ["b", "c"], ["lone"]]);
		for (const id of ["lone", "a"])
			expect(groupOf(drawn.svg, "node", id)!.markup).toContain('data-body-color="teal"');
	},
);

// The rule of 2026-09-27 (ADR 0038): a container a group places stands in
// that group's region, and so does every member of the group inside it. A
// second region of the group round those members, as the ingress board drew
// round the hosts of a pool its group placed, says nothing the outer one does
// not; the members keep the group's colour.
test.each(["track", "blocks"] as const)(
	"the %s engine draws no region of a group inside that group's region",
	async (layout) => {
		const pooled = orderedFixture({
			nodes: [
				{ id: "gate", name: "Gateway", kind: "service" },
				{ id: "pool", name: "Host pool", kind: "service", groups: ["state"] },
				{ id: "one", name: "First host", kind: "module", parent: "pool", groups: ["state"] },
				{ id: "two", name: "Second host", kind: "module", parent: "pool", groups: ["state"] },
				{ id: "spare", name: "Spare host", kind: "module", parent: "pool" },
			],
			edges: [
				{ id: "e1", from: "gate", to: "one", kind: "call" },
				{ id: "e2", from: "gate", to: "two", kind: "call" },
				{ id: "e3", from: "gate", to: "spare", kind: "call" },
			],
		});
		const drawn = await renderArchitecture({ content: pooled, theme: "light", policy, layout });
		const regions = regionBoxes(drawn.svg, "state");
		expect(regions.length).toBe(1);
		expect(within(drawn.atlas.nodes["pool"]!, regions[0]!)).toBeTrue();
		for (const id of ["one", "two"])
			expect(groupOf(drawn.svg, "node", id)!.markup).toContain('data-body-color="teal"');
	},
);

// What a region lists is what a viewer lights it for, so it is what the region holds: a card
// in two groups is drawn with the first one `config.yaml` lists and nowhere else, and a card in
// the group inside a container the region holds is inside the region too.
test.each(["track", "blocks"] as const)(
	"the %s engine lists in each region the cards drawn in it that are in its group",
	async (layout) => {
		const mixed = orderedFixture({
			nodes: [
				{ id: "read", name: "Read route", kind: "module", groups: ["routes"] },
				{ id: "both", name: "Session route", kind: "module", groups: ["routes", "state"] },
				{ id: "pool", name: "Store pool", kind: "service", groups: ["state"] },
				{ id: "one", name: "First store", kind: "module", parent: "pool", groups: ["state"] },
				{ id: "spare", name: "Spare store", kind: "module", parent: "pool" },
			],
			edges: [
				{ id: "e1", from: "read", to: "one", kind: "call" },
				{ id: "e2", from: "both", to: "spare", kind: "call" },
			],
		});
		const drawn = await renderArchitecture({ content: mixed, theme: "light", policy, layout });
		const listed = (group: string): string[] =>
			new RegExp(`data-group="${group}" data-members="([^"]*)"`, "u")
				.exec(drawn.svg)![1]!
				.split(" ");
		expect(listed("routes")).toEqual(["read"]);
		expect(listed("state")).toEqual(["both", "pool", "one"]);
	},
);

// Reduced from a dogfood view, names replaced: each region's one card no line
// inside it holds is entered from cards several ranks down, and the region's
// caption floated above them over an empty band.
test("a group region inside a container starts on the rank just above its first member", async () => {
	const nested = orderedFixture(nestedRegion);
	const drawn = await renderArchitecture({
		content: nested,
		theme: "light",
		policy,
		layout: "track",
	});
	for (const group of ["state", "routes"]) {
		const band = regionBox(drawn.svg, group);
		const members = nested.nodes.filter(({ groups }) => groups?.includes(group));
		const first = Math.min(...members.map(({ id }) => drawn.atlas.nodes[id]!.y));
		const between = Object.entries(drawn.atlas.nodes)
			.filter(([, box]) => box.y > band.y && box.y + box.height < first)
			.map(([id]) => id);
		expect(between, `nothing stands above the first member of ${group}`).toEqual([]);
	}
});

// Reduced from a dogfood view, names replaced: Graphviz sized the frame to
// hold a label where it first stood it, the router slid the label onto its
// line, and the frame kept an empty strip down its left side.
test("a frame's side walls keep one inset from what it holds once lines are routed", async () => {
	const slack = orderedFixture(sideSlack);
	const drawn = await renderArchitecture({
		content: slack,
		theme: "light",
		policy,
		layout: "track",
	});
	const frame = drawn.atlas.nodes["n0"]!;
	const groups = [
		...drawn.svg.matchAll(/data-semantic-kind="group-region" data-group="([^"]+)"/gu),
	];
	const held = [
		...slack.nodes.filter(({ parent }) => parent === "n0").map(({ id }) => drawn.atlas.nodes[id]!),
		...routeLabels(drawn.svg).values(),
		...[...routePoints(drawn.svg).values()].flat().map(({ x }) => ({ x, width: 0 })),
		...groups.map(([, group]) => regionBox(drawn.svg, group!)),
	].filter(({ x, width }) => x >= frame.x && x + width <= frame.x + frame.width);
	const left = Math.min(...held.map(({ x }) => x)) - frame.x;
	const right = frame.x + frame.width - Math.max(...held.map(({ x, width }) => x + width));
	expect(left).toBeCloseTo(CONTAINER_INSET, 0);
	expect(right).toBeCloseTo(CONTAINER_INSET, 0);
});

// Taken from a board of this repository: a line's label, moved onto the one
// column its line runs down, stood beside a group region's caption, in the
// region's title band, where it reads as part of the caption.
test("a label moved onto its line keeps out of a group region's title band", async () => {
	const drawn = await renderArchitecture({
		content: orderedFixture(codexWorkhorse),
		theme: "light",
		policy,
		layout: "track",
	});
	const shift = bodyShift(drawn.svg);
	const groups = [
		...drawn.svg.matchAll(/data-semantic-kind="group-region" data-group="([^"]+)"/gu),
	].map(([, group]) => group!);
	for (const group of groups) {
		const { x, y, width } = regionBox(drawn.svg, group);
		// The caption row: 20 px words under the region's top edge.
		const title = { x: x + shift.x, y: y + shift.y, width, height: 40 };
		for (const [id, label] of routeLabels(drawn.svg))
			expect(boxesOverlap(label, title), `${id} in the title band of ${group}`).toBeFalse();
	}
});

// Reduced from a real ingress board, names replaced: a container gathered
// with its own members into one group region, and a line into the container
// itself. Settling the region's pins read a box for the container, which is
// no card of the region's block, and the drawing failed.
test("a line into a container grouped with its members is drawn", async () => {
	const drawn = await renderArchitecture({
		content: orderedFixture({
			nodes: [
				{ id: "gate", name: "Gateway", kind: "service" },
				{ id: "host", name: "Web host", kind: "service", groups: ["state"] },
				{ id: "one", name: "First site", kind: "module", parent: "host", groups: ["state"] },
				{ id: "two", name: "Second site", kind: "module", parent: "host", groups: ["state"] },
			],
			edges: [{ id: "in", from: "gate", to: "host", kind: "call", label: "falls back to" }],
		}),
		theme: "light",
		policy,
		layout: "track",
	});
	expect(routePoints(drawn.svg).get("in")?.length).toBeGreaterThan(1);
});
