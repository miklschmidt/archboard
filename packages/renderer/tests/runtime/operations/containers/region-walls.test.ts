// Lines between a group region's cards and a card beside the region, which
// cross the region's wall (crates/archboard-layout/src/blocks/walls.rs). Both fixtures are reduced from
// one board of a work vault, names replaced: g2 is a region of cards and n14
// (n21 in the second) a card beside it, to its right.

import { test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
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

test.each([labelled, ordered])(
	"lines crossing a region reach their cards with their labels",
	async (fixture) => {
		const content = orderedFixture(fixture);
		const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
		expectDrawingIntact(drawing, content, "blocks");
	},
);
