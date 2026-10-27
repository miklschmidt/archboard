import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { corridorPoints, routesCross } from "#tests/runtime/support/drawn-routes.ts";
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

test("a block's ports keep the order its parent settles them in, and its lines cross less", async () => {
	const content = orderedFixture(durableWriteBoundary);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const routes = corridorPoints(drawing.svg);
	for (const id of ["i6pk24Ov", "smLdyKlp"])
		for (const other of ["9O4o9jcE", "C0t1t0gb", "E4f3pKJb", "V478HCgq"])
			expect(routesCross(routes.get(id)!, routes.get(other)!), `${id} ${other}`).toBe(false);
});

// Taken from a board of this repository: two lines join on their way to Board
// routes. Held in order with the join parted, the parted drawing crossed less
// and was chosen, and one of its lines ran up and round Semantic renderer.
test("a held order does not part lines joined on their way to a card", async () => {
	const content = orderedFixture(boardRequestPath);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(corridorPoints(drawing.svg).get("3verBPcG")!.length).toBeLessThan(16);
});
