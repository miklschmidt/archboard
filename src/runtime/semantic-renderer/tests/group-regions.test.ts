// A group gathers the cards it places inside one container into one region,
// drawn in its colour with its name (TASK-347). What this catches: a group's
// members scattered among other cards, a region drawn around a card the
// group does not place, and a caption naming something other than the group.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: { module: { name: "Module", icon: "RiBox3Line" } },
	relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "filled" } },
	groups: {
		state: { name: "Server state", color: "teal" },
		routes: { name: "Routes", color: "violet" },
	},
});

const content = orderedFixture({
	nodes: [
		{ id: "cli", name: "Agent CLI", kind: "module" },
		{ id: "read", name: "Read route", kind: "module", groups: ["routes"] },
		{ id: "write", name: "Write route", kind: "module", groups: ["routes"] },
		{ id: "store", name: "Board store", kind: "module", groups: ["state"] },
		{ id: "lease", name: "Board lease", kind: "module", groups: ["state"] },
		{ id: "feed", name: "Change feed", kind: "module" },
	],
	edges: [
		{ id: "e1", from: "cli", to: "read", kind: "call", label: "read a board" },
		{ id: "e2", from: "cli", to: "write", kind: "call", label: "write a board" },
		{ id: "e3", from: "read", to: "store", kind: "call", label: "read" },
		{ id: "e4", from: "write", to: "lease", kind: "call", label: "hold the lease" },
		{ id: "e5", from: "write", to: "store", kind: "call", label: "commit" },
		{ id: "e6", from: "store", to: "feed", kind: "call", label: "announce" },
	],
});

/**
 * A region's band, read from the drawn document.
 * @param svg The document.
 * @param group The group.
 * @returns Its box.
 */
function regionBox(
	svg: string,
	group: string,
): { x: number; y: number; width: number; height: number } {
	const markup = new RegExp(
		`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>([\\s\\S]*?)</g>`,
		"u",
	).exec(svg)![1]!;
	const [x, y, width, height] = ["x", "y", "width", "height"].map((name) =>
		Number(new RegExp(`<rect[^>]* ${name}="([^"]+)"`, "u").exec(markup)![1]),
	);
	return { x: x!, y: y!, width: width!, height: height! };
}

test("the track engine gathers the cards a group places into one region, captioned with its name", async () => {
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "track" });
	for (const [group, members, name] of [
		["routes", ["read", "write"], "Routes"],
		["state", ["store", "lease"], "Server state"],
	] as const) {
		const band = regionBox(drawn.svg, group);
		const inside = (id: string): boolean => {
			const box = drawn.atlas.nodes[id]!;
			return (
				box.x >= band.x &&
				box.y >= band.y &&
				box.x + box.width <= band.x + band.width &&
				box.y + box.height <= band.y + band.height
			);
		};
		for (const id of members) expect(inside(id), `${id} inside ${group}`).toBeTrue();
		for (const id of ["cli", "feed"]) expect(inside(id), `${id} outside ${group}`).toBeFalse();
		expect(drawn.svg).toContain(`>${name}</text>`);
	}
});
