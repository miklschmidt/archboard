// Ports a block of cards holds in the order its parent settles them in
// (orders.ts). What this catches: two lines that cross inside a block because
// settling swapped their ports after Graphviz had ordered the block's cards
// and labels for the old order, and a held order that lets the board choose
// to part lines joined on their way to a card and run one round a block.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { corridorPoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { scorecardOf } from "@/runtime/semantic-renderer/tests/drawn-scorecard";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import boardRequestPath from "./board-request-path.json";
import durableWriteBoundary from "./durable-write-boundary.json";

/** The vocabulary of the dogfood vault the fixtures are taken from. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: Object.fromEntries(
		["module", "service", "route", "external", "ui", "function", "system"].map((kind) => [
			kind,
			{ name: kind, icon: "RiBox3Line" },
		]),
	),
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
	},
});

// Taken from a board of this repository: settling stood the ports on Board
// writes' top in another order than Graphviz had laid its cards for, and the
// lines crossed each other inside the region on their way to them.
test("a block's ports keep the order its parent settles them in, and its lines cross less", async () => {
	const content = orderedFixture(durableWriteBoundary);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const crossings = scorecardOf(drawing, content).find(({ name }) => name === "crossings")!;
	expect(crossings.value).toBeLessThanOrEqual(8);
});

// Taken from a board of this repository: two lines join on their way to Board
// routes. Held in order with the join parted, the parted drawing crossed less
// and was chosen, and one of its lines ran up and round Semantic renderer.
test("a held order does not part lines joined on their way to a card", async () => {
	const content = orderedFixture(boardRequestPath);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(corridorPoints(drawing.svg).get("3verBPcG")!.length).toBeLessThan(16);
});
