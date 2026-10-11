// A fixture that draws a relationship onto a part with children teaches an
// author the shape the rubric marks a run down for (TASK-264, TASK-269), and
// one that does not lay would fail hours into a paid batch (TASK-272). These
// own both refusals, laid through the store's own transitions: which
// relationships land, on which variant, when the child arrives in a later step
// than the relationship, and a step the store refuses.

import { describe, expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { FixtureSchema, layingProblems, type Fixture } from "@/runtime/skill-evaluation/index";

const BOARD = "Flask JSON";
const app = { name: "Flask app", kind: "app" };
const helpers = { name: "JSON helpers", kind: "module" };
const dumps = { name: "dumps", kind: "function", parent: "JSON helpers" };
const call = { from: "Flask app", to: "JSON helpers", kind: "call", label: "jsonify" };
/** The board with the call drawn and no child under its target yet. */
const drawn = { op: "new", board: BOARD, input: { nodes: [app, helpers], edges: [call] } };

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True when it is.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * A fixture as its file would hold it, parsed by the schema the loader uses.
 * @param steps The steps, before any placeholder resolves.
 * @returns The fixture.
 */
function fixtureOf(steps: unknown[]): Fixture {
	// The store needs a board's level, which none of these cases is about.
	const levelled = steps.map((step) =>
		isRecord(step) && step["op"] === "new" && isRecord(step["input"])
			? { ...step, input: { level: "service", ...step["input"] } }
			: step,
	);
	return FixtureSchema.parse({ registerRepo: false, steps: levelled });
}

/**
 * Every problem one fixture has, under a scenario id no real one uses.
 * @param steps The fixture's steps.
 * @returns Its problems.
 */
function refusals(steps: unknown[]): string[] {
	return layingProblems(new Map([["S99", fixtureOf(steps)]]));
}

/**
 * The landings one fixture has. A fixture that does not lay at all fails here
 * rather than counting as a landing, so a case cannot pass by not laying.
 * @param steps The fixture's steps.
 * @returns Its landings.
 */
function problems(steps: unknown[]): string[] {
	const found = refusals(steps);
	expect(found.filter((line) => line.includes("does not lay"))).toEqual([]);
	return found;
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

	test("a new part reusing a renamed part's old name is a new part", () => {
		// The store matches a name against the parts as they are named now, so
		// the old name names nothing and it mints a new part, leaving the
		// renamed one where it was.
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers, dumps] } },
				edit({
					nodes: [
						{ id: "$node(dumps)", name: "dumps_json", kind: "function", parent: "JSON helpers" },
					],
				}),
				edit({ nodes: [{ name: "dumps", kind: "function" }] }),
				edit({ edges: [call] }),
			]),
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

	test("a carried removal takes nothing away from a draft, even a part it did not state", () => {
		// The store keeps a part the draft built on, here by adding a child
		// under it, even though only the child was stated.
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", nodes: [dumps] }),
				edit({ removeNodes: ["JSON helpers"] }),
				edit({ variant: "Draft", edges: [call] }),
			]),
		).toHaveLength(1);
	});

	test("a carried removal the draft cannot take keeps the whole draft", () => {
		// The store keeps the whole draft when the removal would leave it naming
		// a part that is gone, so a part the draft never stated stays too.
		const tag = { name: "Tagged JSON", kind: "module" };
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers, tag, dumps] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({ variant: "Draft", edges: [{ ...call, to: "Tagged JSON" }] }),
				edit({ removeNodes: ["dumps", "Tagged JSON"] }),
				edit({ variant: "Draft", edges: [call] }),
			]),
		).toHaveLength(1);
	});

	test("a draft's rename survives edits carried down by the old name", () => {
		// The predecessor still calls the part by its old name; the store merges
		// by identity, so the child it adds there lands under the draft's
		// renamed part, onto which the draft drew its relationship.
		expect(
			problems([
				{ op: "new", board: BOARD, input: { nodes: [app, helpers] } },
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({
					variant: "Draft",
					nodes: [{ id: "$node(JSON helpers)", name: "Helpers", kind: "module" }],
					edges: [{ ...call, to: "Helpers" }],
				}),
				edit({ nodes: [{ ...helpers, responsibility: "Serializes responses" }] }),
				edit({ nodes: [dumps] }),
			]),
		).toHaveLength(1);
	});

	test("a resolution that takes the predecessor's parent for a part lands the draft's relationship", () => {
		// Both variants moved the same part, so the draft is in conflict until a
		// choice settles it; taking the current variant's side puts the part
		// under the relationship's target.
		const part = { name: "dumps", kind: "function" };
		const other = { name: "Other", kind: "module" };
		expect(
			problems([
				{
					op: "new",
					board: BOARD,
					input: { nodes: [app, helpers, other, { ...part, parent: "Other" }] },
				},
				{ op: "branch", board: BOARD, as: "Draft" },
				edit({
					variant: "Draft",
					nodes: [{ ...part, parent: "Flask app" }],
					edges: [call],
				}),
				edit({ nodes: [{ ...part, parent: "JSON helpers" }] }),
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

describe("a name a draft and its predecessor disagree about", () => {
	/** A board with a part a draft renames and relates to, while the current variant restates it by its old name. */
	const renamedOnDraft = [
		{ op: "new", board: BOARD, input: { nodes: [app, helpers] } },
		{ op: "branch", board: BOARD, as: "Draft" },
		edit({
			variant: "Draft",
			nodes: [{ id: "$node(JSON helpers)", name: "Helpers", kind: "module" }],
			edges: [{ ...call, to: "Helpers" }],
		}),
		edit({ nodes: [{ ...helpers, responsibility: "Serializes" }] }),
	];

	test("a child the current variant adds under the old name lands the draft's relationship (R2)", () => {
		expect(problems([...renamedOnDraft, edit({ nodes: [dumps] })])).toHaveLength(1);
	});

	test("a child the draft adds under its own name lands it too (R3)", () => {
		const childOfHelpers = { name: "dumps", kind: "function", parent: "Helpers" };
		expect(
			problems([
				...renamedOnDraft,
				edit({
					variant: "Draft",
					nodes: [{ name: "Helpers", kind: "module", responsibility: "Formats" }, childOfHelpers],
				}),
			]),
		).toHaveLength(1);
	});
});

describe("a fixture that does not lay", () => {
	test("is refused, and the refusal names the scenario and step", () => {
		// The parent names a part nothing created, which only the store can know.
		const [problem, ...rest] = refusals([
			{ op: "new", board: BOARD, input: { nodes: [app] } },
			edit({ nodes: [{ ...dumps, parent: "Nobody" }] }),
		]);
		expect(rest).toEqual([]);
		expect(problem).toContain("S99 step 1");
	});

	test("stops at the first failing step, so later steps do not pile up refusals", () => {
		expect(
			refusals([
				{ op: "new", board: BOARD, input: { nodes: [app] } },
				edit({ variant: "Missing", nodes: [helpers] }),
				edit({ nodes: [{ ...dumps, parent: "Nobody" }] }),
			]),
		).toHaveLength(1);
	});
});
