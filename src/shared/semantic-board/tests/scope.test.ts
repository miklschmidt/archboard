import { describe, expect, test } from "bun:test";
import {
	scopedContent,
	VariantContentSchema,
	type VariantContent,
} from "@/shared/semantic-board/index";

/**
 * A variant's content, as a document holds it.
 * @param stated What is on it.
 * @returns The parsed content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(stated);

const PLATFORM = { id: "pl", name: "Platform", kind: "service" };
const GATEWAY = { id: "gw", name: "Gateway", kind: "module", parent: "pl" };
const LEDGER = { id: "ld", name: "Ledger", kind: "service" };

// Two ways the gateway reaches the ledger: directly, and through a queue.
const DIRECT = { id: "e1", from: "gw", to: "ld", kind: "call", label: "posts" };
const QUEUED = { id: "e2", from: "gw", to: "ld", kind: "queue", label: "retries" };

const BOARD = content({ nodes: [PLATFORM, GATEWAY, LEDGER], edges: [DIRECT, QUEUED] });

describe("what a view shows", () => {
	test("naming one relationship shows that relationship and not the other one beside it", () => {
		const shown = scopedContent(BOARD, { kind: "selection", nodes: [], edges: ["e1"], flows: [] });
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e1"]);
		// Both its ends are there, and the container the near end sits inside.
		expect(shown.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "ld", "pl"]);
	});

	test("naming no relationship shows every one between the nodes it kept", () => {
		const shown = scopedContent(BOARD, {
			kind: "selection",
			nodes: ["gw", "ld"],
			edges: [],
			flows: [],
		});
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e1", "e2"]);
	});

	test("a relationship with an end the view does not keep is not drawn", () => {
		const shown = scopedContent(BOARD, { kind: "selection", nodes: ["ld"], edges: [], flows: [] });
		expect(shown.edges).toEqual([]);
		expect(shown.nodes.map((node) => node.id)).toEqual(["ld"]);
	});

	test("a named relationship whose ends are not named still brings them, with their containers", () => {
		const shown = scopedContent(BOARD, { kind: "selection", nodes: [], edges: ["e2"], flows: [] });
		expect(shown.nodes.map((node) => node.id)).toEqual(["pl", "gw", "ld"]);
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e2"]);
	});

	test("a view of everything is the variant itself, relationships and all", () => {
		expect(scopedContent(BOARD, { kind: "all" })).toBe(BOARD);
	});
});

describe("a flow a view selects", () => {
	const WITH_FLOW = content({
		nodes: [PLATFORM, GATEWAY, LEDGER],
		edges: [DIRECT, QUEUED],
		flows: [
			{
				id: "f1",
				name: "Posting",
				participants: ["gw", "ld"],
				steps: [{ id: "s1", from: "gw", to: "ld", label: "post" }],
			},
		],
	});

	test("brings every node it names, and no relationship it did not ask for", () => {
		const shown = scopedContent(WITH_FLOW, {
			kind: "selection",
			nodes: [],
			edges: ["e1"],
			flows: ["f1"],
		});
		expect(shown.flows.map((flow) => flow.id)).toEqual(["f1"]);
		expect(shown.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "ld", "pl"]);
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e1"]);
	});

	test("a flow the view did not select is not drawn even when all its nodes survive", () => {
		const shown = scopedContent(WITH_FLOW, {
			kind: "selection",
			nodes: ["gw", "ld"],
			edges: [],
			flows: [],
		});
		expect(shown.flows).toEqual([]);
	});
});
