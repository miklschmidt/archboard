import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TRAFFIC_SPEED,
	DEFAULT_TRAFFIC_VOLUME,
	SemanticEdgeInputSchema,
	SemanticEdgeSchema,
	VariantContentSchema,
	compareVariants,
	effectiveTraffic,
	reconcileVariant,
	type VariantContent,
} from "@/shared/semantic-board/index";

const NODES = [
	{ id: "api", name: "API", kind: "service" },
	{ id: "db", name: "Database", kind: "datastore" },
];
const EDGE = { id: "call", from: "api", to: "db", kind: "call", emphasis: "normal" };
const EDGE_INPUT = { from: "API", to: "Database", kind: "call" };

/** Parse one content value through the persisted contract. */
function content(edge: Record<string, unknown>): VariantContent {
	return VariantContentSchema.parse({ nodes: NODES, edges: [edge] });
}

describe("traffic contract", () => {
	test("absence is off and presence fills both effective defaults", () => {
		expect(SemanticEdgeSchema.parse(EDGE)).not.toHaveProperty("traffic");
		expect(effectiveTraffic(undefined)).toBeUndefined();
		expect(effectiveTraffic({})).toEqual({
			speed: DEFAULT_TRAFFIC_SPEED,
			volume: DEFAULT_TRAFFIC_VOLUME,
		});
		expect(SemanticEdgeSchema.parse({ ...EDGE, traffic: {} }).traffic).toEqual({
			speed: DEFAULT_TRAFFIC_SPEED,
			volume: DEFAULT_TRAFFIC_VOLUME,
		});
		expect(SemanticEdgeInputSchema.parse({ ...EDGE_INPUT, traffic: {} }).traffic).toEqual({
			speed: DEFAULT_TRAFFIC_SPEED,
			volume: DEFAULT_TRAFFIC_VOLUME,
		});
	});

	test.each([0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
		"refuses a non-positive or non-finite speed: %s",
		(speed) => {
			expect(SemanticEdgeInputSchema.safeParse({ ...EDGE_INPUT, traffic: { speed } }).success).toBe(
				false,
			);
		},
	);

	test.each([0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
		"refuses a non-positive or non-finite volume: %s",
		(volume) => {
			expect(
				SemanticEdgeInputSchema.safeParse({ ...EDGE_INPUT, traffic: { volume } }).success,
			).toBe(false);
		},
	);
});

describe("traffic in comparisons", () => {
	test("enabling traffic changes the relationship once", () => {
		const before = content(EDGE);
		const after = content({ ...EDGE, traffic: {} });
		expect(compareVariants(before, after).edges.get("call")?.fields).toEqual([
			{
				field: "traffic",
				before: undefined,
				after: { speed: DEFAULT_TRAFFIC_SPEED, volume: DEFAULT_TRAFFIC_VOLUME },
			},
		]);
	});

	test("empty and explicitly defaulted traffic are equivalent", () => {
		const before = content({ ...EDGE, traffic: {} });
		const after = content({
			...EDGE,
			traffic: { volume: DEFAULT_TRAFFIC_VOLUME, speed: DEFAULT_TRAFFIC_SPEED },
		});
		expect(compareVariants(before, after).edges.get("call")?.kind).toBe("unchanged");
	});

	test("structured traffic compares by value independent of key order", () => {
		const before = content({ ...EDGE, traffic: { speed: 72, volume: 2 } });
		const parsedAfter = content({ ...EDGE, traffic: { speed: 72, volume: 2 } });
		const after = {
			...parsedAfter,
			edges: [
				{
					...parsedAfter.edges[0]!,
					traffic: { volume: 2, speed: 72 },
				},
			],
		};
		expect(compareVariants(before, after).edges.get("call")?.kind).toBe("unchanged");
	});
});

describe("traffic in reconciliation", () => {
	test("inherits a predecessor traffic change", () => {
		const base = content(EDGE);
		const mine = content({ ...EDGE, label: "reads" });
		const theirs = content({ ...EDGE, traffic: { speed: 64, volume: 1 } });
		const result = reconcileVariant({ base, mine, theirs });
		expect(result.issues).toEqual([]);
		expect(result.content.edges[0]).toMatchObject({
			label: "reads",
			traffic: { speed: 64, volume: 1 },
		});
	});

	test("holds independently changed traffic as one competing field", () => {
		const base = content({ ...EDGE, traffic: {} });
		const mine = content({ ...EDGE, traffic: { speed: 80 } });
		const theirs = content({ ...EDGE, traffic: { volume: 1 } });
		const result = reconcileVariant({ base, mine, theirs });
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toMatchObject({
			subject: "call",
			kind: "competing-field",
			field: "traffic",
		});
		expect(result.content.edges[0]?.traffic).toEqual({ speed: 80, volume: 0.5 });
	});
});
