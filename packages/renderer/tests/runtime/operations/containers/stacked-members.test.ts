import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import heldLabel from "#tests/runtime/support/fixtures/held-label.json";
import heldMember from "#tests/runtime/support/fixtures/held-member.json";

/** The room a container keeps round its members: archboard_layout::constants::CONTAINER_INSET. */
const CONTAINER_INSET = 20;

const policy = SemanticPolicySchema.parse({
	levels: ["system"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeLine" },
		system: { name: "System", icon: "RiServerLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", dash: "dashed", arrowhead: "filled" },
	},
	groups: { g0: { name: "Child", color: "violet" }, g1: { name: "Work", color: "sky" } },
});

// Reduced from a board of this repository, names replaced: a group region's
// lower member held below its caption, past the member above.
test("a group region's members share a column or stand clearly apart", async () => {
	const content = orderedFixture(heldMember);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "track" });
	const [upper, lower] = [drawing.atlas.nodes["n3"]!, drawing.atlas.nodes["n4"]!];
	// Packing can put these independent members beside each other. The old
	// defect left a member one invisible hold's slot out of its column.
	const offset = Math.abs(upper.x - lower.x);
	expect(offset === 0 || offset >= Math.min(upper.width, lower.width) + 40).toBe(true);
});

/** Six kinds of card and four of line, as the reduced board below draws them. */
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

// Reduced from a real board, names replaced: a line from another container
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
