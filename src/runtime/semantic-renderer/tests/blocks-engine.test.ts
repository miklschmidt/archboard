// The blocks engine lays every container and group region out as a block of
// its own and joins the lines between blocks through ports on their edges.
// What this catches: room a block keeps for trunks that do not use it, and
// lines between blocks that turn back on themselves or run along a border.

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
	groups: { state: { name: "Server state", color: "teal" } },
});

/**
 * A group region's band, read from the drawn document.
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

test("a container of blocks keeps no more room under its title than a container of cards", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "grouped", name: "Board server", kind: "service" },
			{ id: "store", name: "Board store", kind: "module", parent: "grouped", groups: ["state"] },
			{ id: "lease", name: "Board lease", kind: "module", parent: "grouped", groups: ["state"] },
			{ id: "plain", name: "Board worker", kind: "service" },
			{ id: "queue", name: "Work queue", kind: "module", parent: "plain" },
			{ id: "runner", name: "Work runner", kind: "module", parent: "plain" },
		],
		edges: [
			{ id: "e1", from: "store", to: "lease", kind: "call" },
			{ id: "e2", from: "queue", to: "runner", kind: "call" },
		],
	});
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { nodes } = drawn.atlas;
	const packed = regionBox(drawn.svg, "state").y - nodes["grouped"]!.y;
	const carded = nodes["queue"]!.y - nodes["plain"]!.y;
	expect(packed).toBeLessThanOrEqual(carded);
});
