import { describe, expect, test } from "bun:test";
import { CliUsageError } from "@/cli/command-contract/contract";
import {
	besideVariants,
	comparisonAnswer,
	described,
	VariantComparisonResultSchema,
} from "@/cli/commands/semantic-compare";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticVariant,
	type VariantContent,
} from "@/shared/semantic-board/index";

// The interface measures of competing proposals, side by side (ADR 0044): what
// an agent reads to design a module twice. The counts themselves belong to
// `inspectContainer` and are owned in the shared module; what is owned here is
// the answer: every container on every variant read, in the order read, the
// counts of each variant read off that variant alone, and nothing ranked.

/**
 * One variant of the lease board.
 * @param id Its identity.
 * @param name What it is called.
 * @param content Its architecture.
 * @param parent The variant it came from, when it came from one.
 * @returns The variant.
 */
function variant(
	id: string,
	name: string,
	content: VariantContent,
	parent?: string,
): SemanticVariant {
	return {
		id,
		name,
		lifecycle: parent === undefined ? "current" : "draft",
		content,
		...(parent === undefined ? {} : { parent }),
	};
}

/**
 * A lock store with a container, and two parts outside it.
 * @param stated What differs between the states.
 * @param stated.nodes The parts besides the routes, the watcher and the store.
 * @param stated.edges The relationships.
 * @returns The content.
 */
function store(stated: Pick<VariantContent, "nodes" | "edges">): VariantContent {
	return {
		nodes: [
			{ id: "hold", order: 1000, name: "holdBoard", kind: "route" },
			{ id: "watch", order: 2000, name: "Lock watcher", kind: "job" },
			{ id: "store", order: 3000, name: "Lock store", kind: "module" },
			...stated.nodes,
		],
		edges: stated.edges,
		flows: [],
		walkthroughs: [],
	};
}
const child = (id: string, name: string, order: number) => ({
	id,
	order,
	name,
	kind: "function",
	parent: "store",
});
const call = (id: string, from: string, to: string, order: number) => ({
	id,
	order,
	from,
	to,
	kind: "call",
	emphasis: "normal" as const,
});
const STORE = [child("acq", "acquire", 4000), child("rel", "release", 5000)];

describe("the interface measures of competing proposals, side by side", () => {
	const current = variant(
		"v1",
		"Lock files",
		store({
			nodes: STORE,
			edges: [call("e1", "hold", "acq", 1000)],
		}),
	);
	// Two proposals off one base: one widens the store's interface, one forwards each acquire on.
	const widened = variant(
		"v2",
		"Watched",
		store({
			nodes: STORE,
			edges: [call("e1", "hold", "acq", 1000), call("e2", "watch", "rel", 2000)],
		}),
		"v1",
	);
	const forwarded = variant(
		"v3",
		"Forwarded",
		store({
			nodes: STORE,
			edges: [call("e1", "hold", "acq", 1000), call("e4", "acq", "watch", 2000)],
		}),
		"v1",
	);
	// A third folds the store into one part and draws a connection pool as a container instead.
	const pooled = variant(
		"v4",
		"Pooled",
		store({
			nodes: [
				{ id: "pool", order: 5000, name: "Connection pool", kind: "module" },
				{ id: "conn", order: 6000, name: "connect", kind: "function", parent: "pool" },
			],
			edges: [],
		}),
		"v1",
	);
	const answer = VariantComparisonResultSchema.parse(
		comparisonAnswer(
			{ name: "Board lease", version: 7 },
			widened,
			current,
			[],
			[forwarded, pooled],
		),
	);
	const section = answer.interfaceMeasures;
	const measuredOn = (container: string, variantId: string) =>
		section.containers
			.find((entry) => entry.container.id === container)
			?.byVariant.find((on) => on.variant === variantId);

	test("reads the variant, the one it is read against, then each one put beside them", () => {
		expect(section.variants.map((one) => one.id)).toEqual(["v2", "v1", "v3", "v4"]);
		expect(section.containers.map((entry) => entry.container.name)).toEqual([
			"Lock store",
			"Connection pool",
		]);
		for (const entry of section.containers) {
			expect(entry.byVariant.map((on) => on.variant)).toEqual(["v2", "v1", "v3", "v4"]);
		}
	});

	test("each variant carries the five counts of each container, read off that variant alone", () => {
		expect(measuredOn("store", "v1")).toMatchObject({
			holdsParts: true,
			measures: { entryPoints: 1, hiddenParts: 1, callers: 1, outgoing: 0, passThrough: 0 },
		});
		expect(measuredOn("store", "v2")).toMatchObject({
			holdsParts: true,
			measures: { entryPoints: 2, hiddenParts: 0, callers: 2, outgoing: 0, passThrough: 0 },
		});
		const onForwarded = measuredOn("store", "v3");
		expect(onForwarded).toMatchObject({
			holdsParts: true,
			measures: { entryPoints: 1, hiddenParts: 1, callers: 1, outgoing: 1, passThrough: 1 },
		});
		// The pass-through entry point is named beside the counts, as a question for the reader.
		expect(onForwarded?.holdsParts === true && onForwarded.passThrough.map((p) => p.name)).toEqual([
			"acquire",
		]);
	});

	test("a node with no children on a variant holds no parts there, not zero entry points", () => {
		expect(measuredOn("store", "v4")).toEqual({ variant: "v4", holdsParts: false });
		expect(measuredOn("pool", "v1")).toEqual({ variant: "v1", holdsParts: false });
		expect(measuredOn("pool", "v4")).toMatchObject({ holdsParts: true, measures: { callers: 0 } });
	});

	test("the measures mark no change, set no standing and combine into no score", () => {
		expect(JSON.stringify(section)).not.toContain("standing");
		const on = measuredOn("store", "v2");
		expect(on?.holdsParts === true && Object.keys(on.measures).toSorted()).toEqual([
			"callers",
			"entryPoints",
			"hiddenParts",
			"outgoing",
			"passThrough",
		]);
	});

	test("the measures are said after the interface changes and before the other changes", () => {
		const lines = described(answer);
		const measured = lines.filter((line) => line.includes('"Forwarded"'));
		expect(measured).toHaveLength(2);
		const other = lines.findIndex((line) => line.startsWith("Other changes"));
		expect(lines.indexOf(measured[0]!)).toBeGreaterThan(0);
		expect(lines.indexOf(measured[1]!)).toBeLessThan(other);
	});
});

describe("which variants go beside the comparison", () => {
	const content = store({ nodes: STORE, edges: [] });
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Board lease",
		level: "system",
		version: 4,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "v1",
		variants: [
			variant("v1", "Lock files", content),
			variant("v2", "Lease table", content, "v1"),
			variant("v3", "Watched locks", content, "v1"),
		],
	});
	const [base, proposal] = board.variants;

	test("each named variant comes once, in the order named, leaving out the two already read", () => {
		const beside = besideVariants(
			board,
			["Watched locks", "v3", "current", "Lease table"],
			[proposal!, base!],
		);
		expect(beside.map((one) => one.id)).toEqual(["v3"]);
	});

	test("a name that is no variant of the board is refused", () => {
		expect(() => besideVariants(board, ["nowhere"], [proposal!, base!])).toThrow(CliUsageError);
	});
});
