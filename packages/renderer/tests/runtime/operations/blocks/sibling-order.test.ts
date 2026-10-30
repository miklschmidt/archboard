// These regressions own Track placement, independent of the default engine.
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const MEMBERS = ["vm1", "vm2", "vm3", "vm4"];
// Relationship IDs are independent of the cards' stable ordering.
const QUERIES = ["query1", "query0", "query3", "query2"];

/**
 * Read the sibling cards in their visible horizontal order.
 * @param drawing A fresh rendering of either variant.
 * @returns The semantic identities in left-to-right order.
 */
function horizontalOrder(drawing: RenderedDiagram): string[] {
	return MEMBERS.toSorted(
		(one, other) => drawing.atlas.nodes[one]!.x - drawing.atlas.nodes[other]!.x,
	);
}

test("unchanged sibling identities keep their horizontal order when a proposal changes surrounding content", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "pool", name: "Application pool", kind: "service" },
			...MEMBERS.map((id, index) => ({
				id,
				name: `Application ${index + 1}`,
				responsibility: "Serve the application portfolio",
				kind: "service",
				parent: "pool",
			})),
			{ id: "db1", name: "Primary database", kind: "datastore" },
			{ id: "db2", name: "Secondary database", kind: "datastore" },
			{ id: "gateway", name: "Gateway", kind: "service" },
			{ id: "client", name: "Clients", kind: "external" },
			{ id: "proxy", name: "Proxy", kind: "service" },
		],
		edges: [
			{ id: "entry", from: "gateway", to: "pool", kind: "call" },
			{ id: "request", from: "client", to: "proxy", kind: "call" },
			{ id: "forward", from: "proxy", to: "gateway", kind: "call" },
			...MEMBERS.map((id, index) => ({
				id: QUERIES[index]!,
				from: id,
				to: index < 2 ? "db1" : "db2",
				kind: "data",
				label: "Database connection",
			})),
		],
	});
	const proposal = orderedFixture({
		...content,
		// Array order carries no positioning intent; these identities are unchanged.
		nodes: [
			...content.nodes.toReversed(),
			{ id: "audit", name: "Request audit", kind: "datastore" },
		],
		edges: [...content.edges, { id: "auditlog", from: "gateway", to: "audit", kind: "data" }],
	});
	const [before, after] = await Promise.all([
		renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout: "track",
		}),
		renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: proposal,
			theme: "light",
			layout: "track",
		}),
	]);
	for (const drawing of [before, after]) {
		expect(drawing.readingDirection).toBe("down");
		expect(horizontalOrder(drawing)).toEqual(MEMBERS);
		const centers = MEMBERS.map((id) => drawing.atlas.nodes[id]!.y);
		expect(new Set(centers).size).toBe(1);
	}
	// The ordering is stable, while the proposal still receives fresh placement.
	expect(after.atlas.nodes["gateway"]).not.toEqual(before.atlas.nodes["gateway"]);
});
