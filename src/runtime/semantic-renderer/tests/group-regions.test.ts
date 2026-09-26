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
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
	},
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

test.each(["track", "blocks"] as const)(
	"the %s engine gathers the cards a group places into one region, captioned with its name",
	async (layout) => {
		const drawn = await renderArchitecture({ content, theme: "light", policy, layout });
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
	},
);

test("a group region inside a container starts on the rank just above its first member", async () => {
	// Each region's one card no line inside it holds is entered from cards
	// several ranks down; the region's caption must not float above them.
	const nested = orderedFixture({
		nodes: [
			{ id: "bench", name: "Workbench", kind: "service" },
			{ id: "ctx", name: "Context", kind: "module", parent: "bench" },
			{ id: "deliver", name: "Delivery", kind: "module", parent: "bench", groups: ["routes"] },
			{ id: "link", name: "Link", kind: "module", parent: "bench", groups: ["routes"] },
			{ id: "session", name: "Session", kind: "module", parent: "bench", groups: ["state"] },
			{ id: "wire", name: "Wire", kind: "module", parent: "bench", groups: ["state"] },
			{ id: "server", name: "Server", kind: "module" },
		],
		edges: [
			{ id: "e1", from: "ctx", to: "deliver", kind: "call", label: "a change" },
			{ id: "e2", from: "deliver", to: "link", kind: "call", label: "check the link" },
			{ id: "e3", from: "deliver", to: "session", kind: "call", label: "inject into the session" },
			{
				id: "e4",
				from: "link",
				to: "session",
				kind: "call",
				label: "list and read the candidates",
			},
			{ id: "e5", from: "session", to: "wire", kind: "call", label: "one request per method" },
			{ id: "e6", from: "wire", to: "server", kind: "call", label: "over stdio" },
		],
	});
	const drawn = await renderArchitecture({
		content: nested,
		theme: "light",
		policy,
		layout: "track",
	});
	for (const [group, members] of [
		["state", ["session", "wire"]],
		["routes", ["deliver", "link"]],
	] as const) {
		const band = regionBox(drawn.svg, group);
		const first = Math.min(...members.map((id) => drawn.atlas.nodes[id]!.y));
		const between = Object.entries(drawn.atlas.nodes)
			.filter(([, box]) => box.y > band.y && box.y + box.height < first)
			.map(([id]) => id);
		expect(between, `nothing stands above the first member of ${group}`).toEqual([]);
	}
});
