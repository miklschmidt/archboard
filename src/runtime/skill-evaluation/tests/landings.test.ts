// A fixture that draws a relationship onto a part with children teaches an
// author the shape the rubric marks a run down for (TASK-264, TASK-269). These
// own the refusal: which relationships land, on which variant, and when the
// child arrives in a later step than the relationship.

import { describe, expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { FixtureSchema, landingProblems, type Fixture } from "@/runtime/skill-evaluation/index";

const BOARD = "Flask JSON";
const app = { name: "Flask app", kind: "app" };
const helpers = { name: "JSON helpers", kind: "module" };
const dumps = { name: "dumps", kind: "function", parent: "JSON helpers" };
const call = { from: "Flask app", to: "JSON helpers", kind: "call", label: "jsonify" };
/** The board with the call drawn and no child under its target yet. */
const drawn = { op: "new", board: BOARD, input: { nodes: [app, helpers], edges: [call] } };

/**
 * A fixture as its file would hold it, parsed by the schema the loader uses.
 * @param steps The steps, before any placeholder resolves.
 * @returns The fixture.
 */
function fixtureOf(steps: unknown[]): Fixture {
	return FixtureSchema.parse({ registerRepo: false, steps });
}

/**
 * The problems one fixture has, under a scenario id no real one uses.
 * @param steps The fixture's steps.
 * @returns Its problems.
 */
function problems(steps: unknown[]): string[] {
	return landingProblems(new Map([["S99", fixtureOf(steps)]]));
}

/**
 * An edit to the board.
 * @param input What it states.
 * @returns The step.
 */
function edit(input: Record<string, unknown>): Record<string, unknown> {
	return { op: "edit", board: BOARD, input };
}

describe("a relationship landing on a part with children", () => {
	test("is refused, and the refusal names the scenario, both ends and the child", () => {
		const [problem, ...rest] = problems([
			{ op: "new", board: BOARD, input: { nodes: [app, helpers, dumps], edges: [call] } },
		]);
		expect(rest).toEqual([]);
		for (const named of ["S99", "Flask app", "JSON helpers", "dumps"])
			expect(problem).toContain(named);
	});

	test("is refused when a later step adds the child, however the parent is named", () => {
		// The relationship is clean where it is written; only what the steps
		// have accumulated says its target has children.
		expect(problems([drawn])).toEqual([]);
		expect(
			problems([drawn, edit({ nodes: [{ ...dumps, parent: "$node(JSON helpers)" }] })]),
		).toHaveLength(1);
		const renamed = { id: "$node(JSON helpers)", name: "Provider helpers", kind: "module" };
		const underNewName = { ...dumps, parent: "Provider helpers" };
		// The store places parents in a second pass, so a child may come first
		// even when the same step renames the parent it names.
		expect(problems([drawn, edit({ nodes: [renamed, underNewName] })])).toHaveLength(1);
		expect(problems([drawn, edit({ nodes: [underNewName, renamed] })])).toHaveLength(1);
		const byHandle = { ...dumps, parent: "helpers" };
		expect(
			problems([drawn, edit({ nodes: [byHandle, { ...helpers, as: "helpers" }] })]),
		).toHaveLength(1);
	});

	test("is refused for every configured kind but a dependency, which addresses the whole module", () => {
		for (const kind of Object.keys(DEFAULT_SEMANTIC_POLICY.relationshipKinds)) {
			const found = problems([
				{
					op: "new",
					board: BOARD,
					input: { nodes: [app, helpers, dumps], edges: [{ ...call, kind }] },
				},
			]);
			expect(found.length, kind).toBe(kind === "dependency" ? 0 : 1);
		}
	});
});

describe("variants", () => {
	test("a draft's removal does not hide a landing the current variant goes on to make", () => {
		expect(
			problems([
				drawn,
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", removeNodes: ["JSON helpers"] }),
				edit({ nodes: [dumps] }),
			]),
		).toHaveLength(1);
	});

	test("a child added on a draft makes the relationship it inherited a landing there", () => {
		expect(
			problems([
				drawn,
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", nodes: [dumps] }),
			]),
		).toHaveLength(1);
	});

	test("an edit to the current variant is carried into its drafts", () => {
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", edges: [call] }),
				edit({ nodes: [dumps] }),
			]),
		).toHaveLength(1);
	});

	test("a carried restatement does not take a draft's own parent away", () => {
		// The store keeps a field only the draft changed; a restatement from
		// above without a parent leaves the draft's child where the draft put it.
		const f = { name: "f", kind: "function" };
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers, f] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", nodes: [{ ...f, parent: "JSON helpers" }] }),
				edit({ nodes: [{ ...f, responsibility: "Formats" }], edges: [call] }),
			]),
		).toHaveLength(1);
	});

	test("a carried removal does not take away a part the draft changed itself", () => {
		// The store keeps a part the draft changed even when its predecessor
		// removed it, so the child is still under the target on the draft.
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers, dumps] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", nodes: [{ ...dumps, responsibility: "Serializes" }] }),
				edit({ removeNodes: ["dumps"] }),
				edit({ edges: [call] }),
			]),
		).toHaveLength(1);
	});

	test("a resolution may restore what the draft removed, so it is assumed to", () => {
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers, dumps] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", removeNodes: ["dumps"], edges: [call] }),
				{
					op: "resolve",
					board: BOARD,
					variant: "Draft",
					input: { choices: [{ subject: "$node(dumps)", side: "theirs" }] },
				},
			]),
		).toHaveLength(1);
	});

	test("sibling drafts do not combine: one's relationship and the other's child land nowhere", () => {
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers] } },
				{ op: "branch", board: BOARD, as: "Left" },
				{ op: "branch", board: BOARD, as: "Right" },
				edit({ variant: "Left", edges: [call] }),
				edit({ variant: "Right", nodes: [dumps] }),
			]),
		).toEqual([]);
	});
});
