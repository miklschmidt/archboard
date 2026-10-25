// A region round one node is laid out as the node with a larger box (layout
// rules, section 44), so a board with one is laid out in as many solves as
// the board without it. What this catches: the board laid out once more
// without its regions round one node to decide how to lay it out, which drew
// the first render of Command interface (Blocks) 45% slower.
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import type { VariantContent } from "@archboard/board/content";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: { module: { name: "Module", icon: "RiBox3Line" } },
	relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "filled" } },
	groups: { state: { name: "Server state", color: "teal" } },
});

/**
 * A board of two cards, the first alone in its group's region or in none.
 * @param grouped Whether the first card is in the group.
 * @returns The board.
 */
function board(grouped: boolean): VariantContent {
	return orderedFixture({
		nodes: [
			{ id: "one", name: "One", kind: "module", ...(grouped ? { groups: ["state"] } : {}) },
			{ id: "two", name: "Two", kind: "module" },
		],
		edges: [{ id: "on", from: "one", to: "two", kind: "call" }],
	});
}

test.each(["track", "blocks"] as const)(
	"the %s engine lays a region round one card out in no more solves than the card alone",
	async (layout) => {
		// Drawn first so the Bun host is installed; a board already drawn is not laid out again.
		const warm = orderedFixture({ nodes: [{ id: "warm", name: "Warm", kind: "module" }] });
		await renderArchitecture({ content: warm, theme: "light", policy, layout });
		const host = rendererHost();
		let solves = 0;
		installRendererHost({
			...host,
			solve: (graph, signal) => {
				solves += 1;
				return host.solve(graph, signal);
			},
		});
		try {
			const count = async (grouped: boolean): Promise<number> => {
				solves = 0;
				await renderArchitecture({ content: board(grouped), theme: "light", policy, layout });
				return solves;
			};
			expect(await count(true)).toBe(await count(false));
		} finally {
			installRendererHost(host);
		}
	},
);
