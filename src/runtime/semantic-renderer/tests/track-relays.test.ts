// How the track engine lays a line again through the drawing, and where its
// label box may stand (visual polish): each test is a defect a visual review
// found in real boards, reduced to a fixture. What this catches: a line into
// a card inside a frame run round the outside of another card because it was
// kept out of the frame it ends in, and a labelled line run out to the edge
// of the drawing and back because its label's band had room only there.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import frameDrop from "./frame-drop.json";
import labelBand from "./label-band.json";

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
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
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
	expectBetween(drawing, edge.id, [edge.from, target.parent!]);
});

// Reduced from a real board, names replaced: Graphviz ranked a label on a
// band of cards whose only free slot was at the drawing's left edge, and the
// line ran out there and back although the bands above and below held room
// for the label on the line's own column.
test("a labelled line keeps between its ends when another band holds its label", async () => {
	const content = orderedFixture(labelBand);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const edge = content.edges.find(({ id }) => id === "Wa0ROBSq")!;
	expectBetween(drawing, edge.id, [edge.from, edge.to]);
});

/**
 * Expect a line's every point to stand between the left and right edges of
 * some boxes: its ends, or what holds them.
 * @param drawing The rendered board.
 * @param id The line.
 * @param between The ids whose boxes bound it.
 */
function expectBetween(
	drawing: Awaited<ReturnType<typeof renderArchitecture>>,
	id: string,
	between: readonly string[],
): void {
	const boxes = between.map((one) => drawing.atlas.nodes[one]!);
	const low = Math.min(...boxes.map(({ x }) => x));
	const high = Math.max(...boxes.map(({ x, width }) => x + width));
	for (const { x } of routePoints(drawing.svg).get(id)!)
		expect(x >= low && x <= high, `${x} outside ${low}..${high}`).toBe(true);
}
