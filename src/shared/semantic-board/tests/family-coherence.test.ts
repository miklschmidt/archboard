import { describe, expect, test } from "bun:test";
import { parseSemanticBoard } from "@/shared/semantic-board/index";

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
/**
 * Why a document was refused.
 * @param value The document.
 * @returns The reason, or "" when it was accepted.
 */
const refusal = (value: unknown): string => {
	const parsed = parseSemanticBoard(value);
	return parsed.ok ? "" : parsed.problem;
};

describe("the frame a board addresses itself by", () => {
	test("a board and one of its variants may not answer to one id", () => {
		// A claim, a render request and an announcement each carry an id and
		// nothing else, so an id with two answers is two different things being
		// asked for by the same name.
		expect(
			refusal(
				board({
					id: "same",
					current: "same",
					variants: [
						{
							id: "same",
							name: "Initial",
							lifecycle: "current",
							content: { nodes: [], edges: [] },
						},
					],
				}),
			),
		).toContain('the variant answers to "same", and so does the board itself');
	});
});

describe("what a variant says it is waiting on", () => {
	const ISSUE = {
		subject: "n1",
		what: "node",
		kind: "competing-field",
		field: "name",
		mine: "Gateway",
		theirs: "Public API",
		repair: "Say which one this proposal means.",
	};

	/**
	 * A board holding a draft that says it is waiting on something.
	 * @param over What to change about that standing.
	 * @returns The board document.
	 */
	const waiting = (over: Record<string, unknown>) =>
		board({
			variants: [
				{ id: "v1", name: "Initial", lifecycle: "current", content: { nodes: [], edges: [] } },
				{
					id: "v2",
					name: "Proposed",
					lifecycle: "draft",
					parent: "v1",
					content: { nodes: [], edges: [] },
					reconciliation: {
						against: "v1",
						atVersion: 1,
						base: { nodes: [], edges: [] },
						issues: [ISSUE],
						...over,
					},
				},
			],
		});

	test("a draft waiting on a variant this board has not got is refused", () => {
		expect(refusal(waiting({ against: "zz" }))).toContain('waiting on "zz"');
	});

	test("a draft waiting on something that is not what it came from is refused", () => {
		// A variant is derived from exactly one other, and that is the only one it
		// can be out of step with.
		expect(refusal(waiting({ against: "v2" }))).toContain("not the variant it was derived from");
	});

	test("a standing recorded at a version this board has never reached is refused", () => {
		expect(refusal(waiting({ atVersion: 102 }))).toContain("recorded at version 102");
	});

	test("a draft waiting on something real is a board that opens", () => {
		expect(parseSemanticBoard(waiting({})).ok).toBe(true);
	});
});
