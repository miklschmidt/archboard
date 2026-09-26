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

/**
 * A region's band, read from the drawn document.
 * @param svg The document.
 * @param group The group.
 * @returns Its box.
 */
function regionBox(
	svg: string,
	group: string,
): { x: number; y: number; width: number; height: number } {
	const markup = new RegExp(
		`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>([\\s\\S]*?)</g>`,
		"u",
	).exec(svg)![1]!;
	const [x, y, width, height] = ["x", "y", "width", "height"].map((name) =>
		Number(new RegExp(`<rect[^>]* ${name}="([^"]+)"`, "u").exec(markup)![1]),
	);
	return { x: x!, y: y!, width: width!, height: height! };
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
			const inside = (id: string): boolean => {
				const box = drawn.atlas.nodes[id]!;
				return (
					box.x >= band.x &&
					box.y >= band.y &&
					box.x + box.width <= band.x + band.width &&
					box.y + box.height <= band.y + band.height
				);
			};
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
