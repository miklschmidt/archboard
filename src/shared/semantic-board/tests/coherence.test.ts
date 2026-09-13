import { describe, expect, test } from "bun:test";
import {
	FlowStepInputSchema,
	FlowStepSchema,
	parseSemanticBoard,
	SemanticEdgeInputSchema,
} from "@/shared/semantic-board/index";

/**
 * A board that is coherent, so each case below can break exactly one thing.
 * @param over What to change about it.
 * @returns The board document.
 */
const board = (over: Record<string, unknown> = {}) => ({
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "bd1",
	name: "Pipeline",
	version: 1,
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{ id: "v1", name: "Initial", lifecycle: "current", content: { nodes: [], edges: [] } },
	],
	...over,
});

/**
 * The one variant of a board, with the stated content.
 * @param content What is on it.
 * @returns The variant list.
 */
const withContent = (content: Record<string, unknown>) => [
	{ id: "v1", name: "Initial", lifecycle: "current", content },
];

/**
 * Why a document was refused.
 * @param value The document.
 * @returns The reason, or "" when it was accepted.
 */
const refusal = (value: unknown): string => {
	const parsed = parseSemanticBoard(value);
	return parsed.ok ? "" : parsed.problem;
};

describe("what a board has to be before it is drawn", () => {
	test("a coherent board is accepted", () => {
		expect(parseSemanticBoard(board()).ok).toBe(true);
	});

	test("a document written for a different major contract is refused", () => {
		expect(refusal(board({ schemaVersion: "999.0.0" }))).toContain("999.0.0");
		expect(parseSemanticBoard(board({ schemaVersion: "2.7.0" })).ok).toBe(true);
	});

	test("two variants claiming to be the implemented architecture is refused", () => {
		expect(
			refusal(
				board({
					variants: [
						{ id: "v1", name: "Initial", lifecycle: "current", content: { nodes: [], edges: [] } },
						{ id: "v2", name: "other", lifecycle: "current", content: { nodes: [], edges: [] } },
					],
				}),
			),
		).toContain("exactly one");
	});

	test("two variants sharing a name is refused, because a name is an address", () => {
		expect(
			refusal(
				board({
					variants: [
						{ id: "v1", name: "Initial", lifecycle: "current", content: { nodes: [], edges: [] } },
						{ id: "v2", name: "Initial", lifecycle: "draft", content: { nodes: [], edges: [] } },
					],
				}),
			),
		).toContain("two variants are called");
	});

	test("a state named after the movable designation is refused", () => {
		expect(
			refusal(
				board({
					variants: [
						{ id: "v1", name: "current", lifecycle: "current", content: { nodes: [], edges: [] } },
					],
				}),
			),
		).toContain("cannot be a variant's lasting name");
	});

	test("a designation naming no variant is refused", () => {
		expect(refusal(board({ current: "nope" }))).toContain("not a variant");
	});

	test("a variant descended from itself is refused", () => {
		expect(
			refusal(
				board({
					variants: [
						{
							id: "v1",
							name: "Initial",
							lifecycle: "current",
							parent: "v1",
							content: { nodes: [], edges: [] },
						},
					],
				}),
			),
		).toContain("closes on itself");
	});

	test("containment that closes on itself is refused", () => {
		expect(
			refusal(
				board({
					variants: withContent({
						nodes: [
							{ id: "n1", name: "A", kind: "module", parent: "n2" },
							{ id: "n2", name: "B", kind: "module", parent: "n1" },
						],
						edges: [],
					}),
				}),
			),
		).toContain("containment closes on itself");
	});

	test("an edge whose endpoint is not on the board is refused", () => {
		expect(
			refusal(
				board({
					variants: withContent({
						nodes: [{ id: "n1", name: "A", kind: "module" }],
						edges: [{ id: "e1", from: "n1", to: "n9", kind: "call", emphasis: "normal" }],
					}),
				}),
			),
		).toContain('"n9" is not a node');
	});

	test("two nodes sharing an id is refused", () => {
		expect(
			refusal(
				board({
					variants: withContent({
						nodes: [
							{ id: "n1", name: "A", kind: "module" },
							{ id: "n1", name: "B", kind: "module" },
						],
						edges: [],
					}),
				}),
			),
		).toContain("two nodes share the id");
	});

	test("an edge taking an id a node already answers to is refused", () => {
		expect(
			refusal(
				board({
					variants: withContent({
						nodes: [{ id: "n1", name: "A", kind: "module" }],
						edges: [{ id: "n1", from: "n1", to: "n1", kind: "call", emphasis: "normal" }],
					}),
				}),
			),
		).toContain('a relationship and a node both answer to the id "n1"');
	});

	test("an authored coordinate is refused, because presentation is not the board's to state", () => {
		expect(
			refusal(
				board({
					variants: withContent({
						nodes: [{ id: "n1", name: "A", kind: "module", x: 10, y: 20 }],
						edges: [],
					}),
				}),
			),
		).not.toBe("");
	});
});

describe("what an agent may write, against what a board may hold", () => {
	const TOO_LONG = "x".repeat(61);

	test("a step label the document would refuse is refused where it is written", () => {
		// Otherwise ingress accepts a payload the write then refuses as invalid
		// content, and the caller learns about it one round trip too late.
		expect(FlowStepInputSchema.safeParse({ from: "a", to: "b", label: TOO_LONG }).success).toBe(
			false,
		);
		expect(
			FlowStepSchema.safeParse({ id: "s1", from: "a", to: "b", label: TOO_LONG }).success,
		).toBe(false);
		expect(
			FlowStepInputSchema.safeParse({ from: "a", to: "b", label: "x".repeat(60) }).success,
		).toBe(true);
	});

	test("a relationship label is held to the same length in both spellings", () => {
		expect(SemanticEdgeInputSchema.safeParse({ from: "a", to: "b", label: TOO_LONG }).success).toBe(
			false,
		);
	});
});

describe("what a reader can address by name", () => {
	const NODES = [
		{ id: "n1", name: "A", kind: "module" },
		{ id: "n2", name: "B", kind: "module" },
	];
	/**
	 * A variant holding two nodes and whatever explanations are stated.
	 * @param content The flows on it.
	 * @param views The board-wide views.
	 * @returns The board document.
	 */
	const explaining = (
		content: Record<string, unknown>,
		views: readonly Record<string, unknown>[] = [],
	) =>
		board({
			views,
			variants: [
				{
					id: "v1",
					name: "Initial",
					lifecycle: "current",
					content: { nodes: NODES, edges: [], flows: [], ...content },
				},
			],
		});

	test("two flows called the same thing are refused, because a scope names one by name", () => {
		expect(
			refusal(
				explaining({
					flows: [
						{
							id: "f1",
							name: "Placing an order",
							participants: ["n1", "n2"],
							steps: [{ id: "s1", from: "n1", to: "n2", label: "place" }],
						},
						{
							id: "f2",
							name: "Placing an order",
							participants: ["n1", "n2"],
							steps: [{ id: "s2", from: "n2", to: "n1", label: "confirm" }],
						},
					],
				}),
			),
		).toContain('two flows are called "Placing an order"');
	});

	test("two views called the same thing are refused, because the viewer asks for one by name", () => {
		expect(
			refusal(
				explaining({}, [
					{ id: "w1", name: "The parts", grammar: "architecture" },
					{ id: "w2", name: "The parts", grammar: "architecture" },
				]),
			),
		).toContain('two views are called "The parts"');
	});

	test("two nodes may share a name; which one is meant is settled where it is used", () => {
		expect(
			parseSemanticBoard(
				explaining({
					nodes: [
						{ id: "n1", name: "client", kind: "module", parent: undefined },
						{ id: "n2", name: "client", kind: "module" },
					],
				}),
			).ok,
		).toBe(true);
	});
});

describe("one namespace for every subject of a variant", () => {
	/**
	 * A variant whose content is stated directly, for cases an edit could not
	 * produce but a hand-written or copied file can.
	 * @param content What is on the variant.
	 * @returns The board document.
	 */
	const holding = (content: Record<string, unknown>) =>
		board({
			variants: [{ id: "v1", name: "Initial", lifecycle: "current", content }],
		});

	const NODE = { id: "n1", name: "A", kind: "module" };
	const FLOW = {
		id: "n1",
		name: "One exchange",
		participants: ["n1"],
		steps: [{ id: "s1", from: "n1", to: "n1", label: "think", kind: "self" }],
	};

	test("a flow may not answer to a node's id", () => {
		expect(refusal(holding({ nodes: [NODE], edges: [], flows: [FLOW] }))).toContain(
			'a flow and a node both answer to the id "n1"',
		);
	});

	test("a step may not answer to a node's id", () => {
		expect(
			refusal(
				holding({
					nodes: [NODE],
					edges: [],
					flows: [{ ...FLOW, id: "f1", steps: [{ ...FLOW.steps[0], id: "n1" }] }],
				}),
			),
		).toContain('a step and a node both answer to the id "n1"');
	});

	test("a board-wide view may not answer to a node's id", () => {
		expect(
			refusal(
				board({
					views: [{ id: "n1", name: "The parts", grammar: "architecture" }],
					variants: withContent({ nodes: [NODE], edges: [], flows: [] }),
				}),
			),
		).toContain('the view answers to "n1"');
	});

	test("two steps of different flows may not share an identity", () => {
		// Each flow read on its own sees nothing wrong here, which is exactly why
		// the rule cannot live inside a flow: the atlas box, the selection and the
		// comparison all key on the id alone.
		expect(
			refusal(
				holding({
					nodes: [NODE],
					edges: [],
					flows: [
						{ ...FLOW, id: "f1" },
						{ ...FLOW, id: "f2", name: "Another exchange" },
					],
				}),
			),
		).toContain('two steps share the id "s1"');
	});

	test("two flows of one variant may not share an identity", () => {
		expect(
			refusal(
				holding({
					nodes: [NODE],
					edges: [],
					flows: [
						{ ...FLOW, id: "f1" },
						{
							...FLOW,
							id: "f1",
							name: "Another exchange",
							steps: [{ ...FLOW.steps[0], id: "s2" }],
						},
					],
				}),
			),
		).toContain('two flows share the id "f1"');
	});

	test("the board may not answer to an id something on a variant holds", () => {
		expect(
			refusal(
				board({
					id: "n1",
					variants: [
						{
							id: "v1",
							name: "Initial",
							lifecycle: "current",
							content: { nodes: [NODE], edges: [], flows: [] },
						},
					],
				}),
			),
		).toContain('the board answers to "n1"');
	});

	test("a variant may not answer to an id something on a variant holds", () => {
		expect(
			refusal(
				board({
					variants: [
						{
							id: "n1",
							name: "Initial",
							lifecycle: "current",
							content: { nodes: [NODE], edges: [], flows: [] },
						},
					],
					current: "n1",
				}),
			),
		).toContain('the variant answers to "n1"');
	});

	test("two variants may hold the same entity, which is what makes them comparable", () => {
		expect(
			parseSemanticBoard(
				board({
					variants: [
						{
							id: "v1",
							name: "Initial",
							lifecycle: "current",
							content: { nodes: [NODE], edges: [], flows: [] },
						},
						{
							id: "v2",
							name: "Proposed",
							lifecycle: "draft",
							parent: "v1",
							content: { nodes: [NODE], edges: [], flows: [] },
						},
					],
				}),
			).ok,
		).toBe(true);
	});
});
