import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { SemanticPolicySchema } from "@archboard/model/policy";
import heldLabel from "#tests/runtime/support/fixtures/held-label.json";

/** The room a container keeps round its members: archboard_layout::constants::CONTAINER_INSET. */
const CONTAINER_INSET = 20;

/** Six kinds of card and four of line, as the reduced document below draws them. */
const plain = SemanticPolicySchema.parse({
	levels: ["k0"],
	nodeKinds: Object.fromEntries(
		["k0", "k1", "k2", "k3", "k4", "k5", "k6"].map((kind) => [
			kind,
			{ name: kind, icon: "RiBox3Line" },
		]),
	),
	relationshipKinds: Object.fromEntries(
		["r0", "r1", "r2", "r3"].map((kind) => [
			kind,
			{ name: kind, dash: "solid", arrowhead: "filled" },
		]),
	),
});

// Reduced from a real document, names replaced: a line from another container
// enters a frame into a card a line inside the frame also leads into.
test("a frame's members an entering label is held above stand on one column", async () => {
	const content = orderedFixture(heldLabel);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: plain,
		layout: "track",
	});
	const [upper, lower, frame] = ["n7", "n8", "n6"].map((id) => drawing.atlas.nodes[id]!);
	expect(upper!.x).toBe(lower!.x);
	expect(upper!.x - frame!.x).toBeGreaterThanOrEqual(CONTAINER_INSET);
	expect(frame!.x + frame!.width - upper!.x - upper!.width).toBeGreaterThanOrEqual(CONTAINER_INSET);
});
