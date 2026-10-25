// Lines between a group region's cards and a card beside the region, which
// cross the region's wall (crates/archboard-layout/src/blocks/walls.rs). Both fixtures are reduced from
// one board of a work vault, names replaced: g2 is a region of cards and n14
// (n21 in the second) a card beside it, to its right.

import { expect, test } from "bun:test";
import type { DiagramBox } from "@archboard/board/render-reply";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import {
	corridorPoints,
	distanceToRoute,
	routeLabels,
} from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import labelled from "#tests/runtime/support/fixtures/region-wall-label.json";
import ordered from "#tests/runtime/support/fixtures/region-wall-order.json";

/** The vocabulary of the reduced fixtures. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: Object.fromEntries(
		["app", "azure", "datastore", "external", "function", "module", "service"].map((kind) => [
			kind,
			{ name: kind, icon: "RiServerLine" },
		]),
	),
	relationshipKinds: {
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", color: "orange", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
	},
	// Each name measures as wide as the work vault's group name it replaces,
	// so its region's caption, and the layout, stay as they were.
	groups: {
		g1: { name: "Copper Side", color: "purple" },
		g2: { name: "Signal Paper Workloads", color: "teal" },
		g3: { name: "Upper Tools Systems", color: "amber" },
	},
});

/**
 * A fixture drawn on Blocks, with the boxes of region g2's cards.
 * @param fixture The fixture.
 * @returns The drawing, and the boxes of the region's cards.
 */
async function drawn(
	fixture: unknown,
): Promise<{ drawing: Awaited<ReturnType<typeof renderArchitecture>>; region: DiagramBox[] }> {
	const content = orderedFixture(fixture);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const members = content.nodes.filter((node) => node.groups?.includes("g2"));
	return { drawing, region: members.map(({ id }) => drawing.atlas.nodes[id]!) };
}

// The line from n19 to n14 joins n20's line to n14 on the way, so its label
// sits in the region, before the join (crates/archboard-layout/src/blocks/choosing.rs). What this catches: the
// region kept that line's port on its bottom, and the line ran from n19 down
// the region, along its foot below every card, and up its wall to n14.
test("a line that leaves a region by its wall carrying its label runs above the region's foot", async () => {
	const { drawing, region } = await drawn(labelled);
	const route = corridorPoints(drawing.svg).get("e6")!;
	const foot = Math.max(...region.map((box) => box.y + box.height));
	expect(Math.max(...route.map(({ y }) => y))).toBeLessThan(foot);
	expect(distanceToRoute(routeLabels(drawing.svg).get("e6")!, route)).toBe(0);
});

// n12 is reached only from n21, through the region's right wall. What this
// catches: Graphviz set n12 apart from the region's other cards in the order
// it met them, in the region's left half, and the line ran across the region.
test("a card reached only through its region's wall stands toward that wall", async () => {
	const { drawing, region } = await drawn(ordered);
	const [card, beside] = [drawing.atlas.nodes["n12"]!, drawing.atlas.nodes["n21"]!];
	const left = Math.min(...region.map((box) => box.x));
	const right = Math.max(...region.map((box) => box.x + box.width));
	expect(beside.x).toBeGreaterThan(right);
	expect(card.x + card.width / 2).toBeGreaterThan((left + right) / 2);
});
