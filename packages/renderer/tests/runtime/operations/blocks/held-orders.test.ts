import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { corridorPoints } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import boardRequestPath from "#tests/runtime/support/fixtures/board-request-path.json";
import durableWriteBoundary from "#tests/runtime/support/fixtures/durable-write-boundary.json";

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
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
	},
});

test("reserved boundary channels preserve the complete drawing across nested blocks", async () => {
	const content = orderedFixture(durableWriteBoundary);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expectDrawingIntact(drawing, content, "blocks");
});

// Taken from a board of this repository: two lines join on their way to Board
// routes. Held in order with the join parted, the parted drawing crossed less
// and was chosen, and one of its lines ran up and round Semantic renderer.
test("a held order does not part lines joined on their way to a card", async () => {
	const content = orderedFixture(boardRequestPath);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(corridorPoints(drawing.svg).get("3verBPcG")!.length).toBeLessThan(16);
});
