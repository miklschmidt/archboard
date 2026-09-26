// How the track engine lays a line again through the drawing, and where its
// label box may stand (visual polish): each test is a defect a visual review
// found in real boards, reduced to a fixture. What this catches: a line into
// a card inside a frame run round the outside of another card because it was
// kept out of the frame it ends in.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import frameDrop from "./frame-drop.json";

/** The vocabulary the fixtures reduced from dogfood boards draw with, its groups in the vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		drawing: { name: "Drawing", color: "violet" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
	},
});

// Reduced from a dogfood board, names replaced: Graphviz ran a line past its
// target frame's title row outside the frame, and the relay kept every lane
// out of the frame, so the line ran round a card beside the frame and back
// in, where it could drop into the frame through its title row.
test("a line into a frame drops into it rather than round what stands beside it", async () => {
	const content = orderedFixture(frameDrop);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const edge = content.edges.find(({ id }) => id === "FDMYhJSq")!;
	const target = content.nodes.find(({ id }) => id === edge.to)!;
	const ends = [drawing.atlas.nodes[edge.from]!, drawing.atlas.nodes[target.parent!]!];
	const low = Math.min(...ends.map(({ x }) => x));
	const high = Math.max(...ends.map(({ x, width }) => x + width));
	for (const { x } of routePoints(drawing.svg).get(edge.id)!)
		expect(x >= low && x <= high, `${x} outside ${low}..${high}`).toBe(true);
});
