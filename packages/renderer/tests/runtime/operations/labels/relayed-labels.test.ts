// Where the relay may stand a label box when it lays a line again (visual
// polish): each case is reduced from a dogfood board. Graphviz stands a label
// in the regions around both ends of its line, and the relay moved it into
// another group region's last band, where it hung over the region's bottom
// edge (Archboard server routes). And the relay stood a label across a line
// drawn straight from a card's side to its block's wall, which it did not see,
// so the line ran under the label (Agent workbench).
// What this catches: a relaid label across a group region's edge, and a line
// drawn straight to a wall under a relaid label.

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { labelsAcrossWalls, runsUnderLabels } from "#tests/runtime/support/drawn-checks.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import labelBeside from "#tests/runtime/support/fixtures/relayed-label-beside.json";
import labelRegion from "#tests/runtime/support/fixtures/relayed-label-region.json";

/** The vocabulary the fixtures draw with, its groups in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine", color: "blue" },
		module: { name: "Module", icon: "RiBox3Line", color: "violet" },
		route: { name: "Route", icon: "RiRouteLine", color: "teal" },
		external: { name: "External", icon: "RiExternalLinkLine", color: "pink" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Pane state", color: "teal" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
		agent: { name: "Agent", color: "fuchsia" },
	},
});

test("a relaid label stays out of a group region its line's ends are not in", async () => {
	const content = orderedFixture(labelRegion);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	expect(labelsAcrossWalls(drawing)).toEqual([]);
});

test("a relaid label stays off a line drawn straight to its block's wall", async () => {
	const content = orderedFixture(labelBeside);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "blocks", policy });
	expect(runsUnderLabels(drawing)).toEqual([]);
});
