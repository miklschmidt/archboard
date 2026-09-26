// Where the track engine stands a card sideways (TASK-349). What this
// catches: a chain of one-in, one-out cards stepping sideways rank by rank,
// its lines leaving and entering its cards off centre, and a fan whose
// wrap lowers a group region whole refused, so the region stands on a row
// of its own above the fan's other cards.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import loweredRegion from "./lowered-region.json";

const WORDS = "alpha bravo delta eagle falcon garden harbor island jungle kettle lantern meadow";

/**
 * A card's centre across the page.
 * @param box The card's box.
 * @param box.x Its left edge.
 * @param box.width Its width.
 * @returns Its centre.
 */
function centre({ x, width }: { x: number; width: number }): number {
	return x + width / 2;
}

// Reduced from a real operations board, names replaced: a chain pulled right
// at its head by a line back into it and left at its foot by a wide fan.
test("a chain between a pull and a fan stands on one column", async () => {
	const chain = ["c0", "c1", "c2", "c3", "c4"];
	const fan = ["f0", "f1", "f2", "f3"];
	const content = orderedFixture({
		nodes: [...chain, ...fan, "f4", "alone"].map((id) => ({
			id,
			name: `Part ${id}`,
			kind: "service",
			responsibility: WORDS,
		})),
		edges: [
			...chain.slice(1).map((to, index) => ({
				id: `c${index}`,
				from: chain[index]!,
				to,
				kind: "data",
				label: `hand over ${index}`,
			})),
			...fan.map((to, index) => ({
				id: `f${index}`,
				from: "c4",
				to,
				kind: "dependency",
				label: `start stage ${index}`,
			})),
			{ id: "on", from: "f1", to: "f4", kind: "data", label: "next stage" },
			{ id: "back", from: "f3", to: "c2", kind: "data", label: "stop and plan again" },
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track" });
	const centres = chain.map((id) => centre(drawing.atlas.nodes[id]!));
	for (const at of centres) expect(Math.abs(at - centres[0]!)).toBeLessThan(1);
});

/**
 * Whether two boxes share some height, side by side.
 * @param one A box.
 * @param one.y Its top.
 * @param one.height Its height.
 * @param other Another.
 * @param other.y Its top.
 * @param other.height Its height.
 * @returns True when they do.
 */
function beside(one: { y: number; height: number }, other: { y: number; height: number }): boolean {
	return one.y < other.y + other.height && other.y < one.y + one.height;
}

// Reduced from a board of this repository, names replaced: a hub fans out to
// four cards and to two cards of one group region, one of which a line from
// above also enters.
test("a wrapped fan stands a group region beside its other cards", async () => {
	const policy = SemanticPolicySchema.parse({
		levels: ["service"],
		nodeKinds: { module: { name: "Module", icon: "RiBox3Line" } },
		relationshipKinds: {
			call: { name: "Call", dash: "solid", arrowhead: "filled" },
			uses: { name: "Uses", dash: "dotted", arrowhead: "open" },
		},
		groups: {
			inner: { name: "Inner", color: "indigo" },
			outer: { name: "Outer", color: "yellow" },
		},
	});
	const content = orderedFixture(loweredRegion);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "track" });
	const [members, others] = [
		["n5", "n6"],
		["n2", "n3", "n4", "n7"],
	].map((ids) => ids.map((id) => drawing.atlas.nodes[id]!));
	expect(members!.some((member) => others!.some((other) => beside(member, other)))).toBe(true);
});
