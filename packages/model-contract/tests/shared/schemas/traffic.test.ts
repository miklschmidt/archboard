import { describe, expect, test } from "bun:test";
import { parseDocument, type VariantContent } from "@archboard/model-contract";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

const NODES = [
	{ id: "api", name: "API", kind: "service" },
	{ id: "db", name: "Database", kind: "datastore" },
];
const EDGE = { id: "call", from: "api", to: "db", kind: "call", emphasis: "normal", order: 1000 };

/**
 * Read one content value through the persisted contract.
 * @param edge The one relationship on it.
 * @returns The content, or the reason it is not one.
 */
function read(edge: Record<string, unknown>) {
	return parseDocument("variantContent", withFixtureOrders({ nodes: NODES, edges: [edge] }));
}

/**
 * The relationship of a content value that must be accepted.
 * @param edge The one relationship on it.
 * @returns The relationship as read.
 */
function edgeOf(edge: Record<string, unknown>): VariantContent["edges"][number] {
	const parsed = read(edge);
	if (!parsed.success) throw new Error(String(parsed.error));
	return parsed.data.edges[0]!;
}

describe("traffic contract", () => {
	test("absence is off and presence fills both defaults", () => {
		const defaults = parseDocument("edgeTraffic", {});
		expect(defaults.success).toBe(true);
		if (!defaults.success) return;
		expect(defaults.data.speed).toBeGreaterThan(0);
		expect(defaults.data.volume).toBeGreaterThan(0);
		expect(edgeOf(EDGE)).not.toHaveProperty("traffic");
		expect(edgeOf({ ...EDGE, traffic: {} }).traffic).toEqual(defaults.data);
	});

	test.each([0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
		"refuses a non-positive or non-finite speed: %s",
		(speed) => {
			expect(read({ ...EDGE, traffic: { speed } }).success).toBe(false);
		},
	);

	test.each([0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
		"refuses a non-positive or non-finite volume: %s",
		(volume) => {
			expect(read({ ...EDGE, traffic: { volume } }).success).toBe(false);
		},
	);
});
