// A group region keeps as much room under its caption's tab as at its sides
// and below (TASK-420, layout rules section 46), on both engines: round
// several cards, round one card, round containers and round one container.
// What this catches: a first row standing closer under the tab than the
// region's walls stand from its members, as a region round one card stood
// 4 px under its tab and a region of cards 20 px, against 14 at its sides.
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { bodyShift, pointsOf } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

/** The room a group region keeps round its members: archboard_layout::constants::REGION_INSET. */
const REGION_INSET = 14;

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: { service: { name: "Service", icon: "RiServerLine" } },
	relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "filled" } },
	groups: {
		cards: { name: "Cards", color: "teal" },
		card: { name: "Card", color: "violet" },
		frames: { name: "Frames", color: "sky" },
		frame: { name: "Frame", color: "pink" },
	},
});

// Nothing runs between a tab and the first row, so nothing needs more room there.
const content = orderedFixture({
	nodes: [
		{ id: "a", name: "Alpha", kind: "service", groups: ["cards"] },
		{ id: "b", name: "Beta", kind: "service", groups: ["cards"] },
		{ id: "c", name: "Gamma", kind: "service", groups: ["card"] },
		{ id: "p", name: "Pool", kind: "service", groups: ["frames"] },
		{ id: "p1", name: "Pool member", kind: "service", parent: "p" },
		{ id: "q", name: "Queue", kind: "service", groups: ["frames"] },
		{ id: "q1", name: "Queue member", kind: "service", parent: "q" },
		{ id: "r", name: "Relay", kind: "service", groups: ["frame"] },
		{ id: "r1", name: "Relay member", kind: "service", parent: "r" },
		{ id: "z", name: "Loose", kind: "service" },
	],
	edges: [],
});

/** A drawn box. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * One group's region, read from the drawn document, on the page: its box,
 * the foot of its caption's tab as drawn near, and its members.
 * @param svg The document.
 * @param group The group.
 * @returns The region.
 */
function regionOf(svg: string, group: string): { box: Box; tabFoot: number; members: string[] } {
	const shift = bodyShift(svg);
	const found = new RegExp(
		`<g data-semantic-kind="group-region" data-group="${group}" data-members="([^"]*)"[^>]*>\\s*<rect([^>]*)>[\\s\\S]*?<g class="ab-near"><path d="([^"]+)"`,
		"u",
	).exec(svg);
	expect(found, `the region of ${group}`).not.toBeNull();
	const [, members, rect, tab] = found!;
	const read = (name: string): number =>
		Number(new RegExp(` ${name}="([^"]+)"`, "u").exec(rect!)![1]);
	return {
		box: {
			x: read("x") + shift.x,
			y: read("y") + shift.y,
			width: read("width"),
			height: read("height"),
		},
		// The tab reaches down from the region's top to its lowest point.
		tabFoot: Math.max(...pointsOf(tab!).map(({ y }) => y)) + shift.y,
		members: members!.split(" "),
	};
}

for (const layout of LayoutEngineSchema.options)
	test(`a region keeps its inset under its tab as at its sides and below (${layout})`, async () => {
		const drawing = await renderArchitecture({ content, theme: "light", policy, layout });
		for (const group of ["cards", "card", "frames", "frame"]) {
			const { box, tabFoot, members } = regionOf(drawing.svg, group);
			const held = members.map((id) => drawing.atlas.nodes[id]!);
			const top = Math.min(...held.map(({ y }) => y)) - tabFoot;
			const bottom = box.y + box.height - Math.max(...held.map(({ y, height }) => y + height));
			const sides = [
				Math.min(...held.map(({ x }) => x)) - box.x,
				box.x + box.width - Math.max(...held.map(({ x, width }) => x + width)),
			];
			expect(top, `${group} under its tab`).toBeCloseTo(REGION_INSET, 0);
			expect(bottom, `${group} below`).toBeCloseTo(REGION_INSET, 0);
			// A region packed round containers on Track stands them 8 px further
			// in, the room Graphviz leaves round a cluster in its graph.
			for (const side of sides)
				expect(side, `${group} beside`).toBeGreaterThanOrEqual(REGION_INSET - 0.5);
		}
	});
