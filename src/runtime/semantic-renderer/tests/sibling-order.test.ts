import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";
import input from "@/runtime/semantic-renderer/tests/sibling-order-graph.json";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";

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
		renderArchitecture({ content, theme: "light" }),
		renderArchitecture({ content: proposal, theme: "light" }),
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

// Captured measured placement from a real proposal: reserving one VM's database
// label made native title ordering reverse VM 1 and 2 despite their shared row.
test("reserved labels follow the order of equal sibling slots in a compound proposal", async () => {
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
	const result = solve(input.graph, input.options);
	const pool = result.children!.find((node) => node.id === "j6TdeSth")!;
	const row = pool.children!.toSorted((one, other) => one.x! - other.x!);
	expect(row.map((node) => node.id)).toEqual(["6cWbMS1Q", "TqDUcCHV", "WMA3YdsD", "yPJ2pkH0"]);
	expect(new Set(row.map((node) => node.y)).size).toBe(1);
	const labels = row.flatMap(
		(node) => result.edges!.find((edge) => edge.sources[0] === node.id)!.labels ?? [],
	);
	expect(labels.length).toBeGreaterThan(1);
	const labelPositions = labels.map((label) => label.x!);
	expect(labelPositions).toEqual(labelPositions.toSorted((one, other) => one - other));
});
