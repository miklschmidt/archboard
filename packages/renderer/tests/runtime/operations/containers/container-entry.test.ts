import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import containerEntry from "#tests/runtime/support/fixtures/container-entry.json";

const policy = SemanticPolicySchema.parse({
	levels: ["module"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
	},
	groups: {
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Pane state", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		agent: { name: "Agent", color: "fuchsia" },
	},
});

// A side entry into a packed group must turn around the container it reaches,
// rather than cross the child card before returning to the container's top.
test("a side entry reaches a container without crossing its children", async () => {
	const content = orderedFixture(containerEntry);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(routesThroughCards(drawing, content)).toEqual([]);
});
