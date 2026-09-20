// The content checks decide from saved boards alone and say what they found:
// a rename that minted a new id fails identity, traffic reads as off, default
// or stated, and a relationship landing on a container fails the receiver rule.

import { describe, expect, test } from "bun:test";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import { evaluateOutcomes, type Reading } from "@/runtime/skill-evaluation/index";
import { AFTER, passes, READING } from "@/runtime/skill-evaluation/tests/reading-fixture";

describe("identity checks", () => {
	test("a node restated under its id passes, a renamed identity fails, and kept fields pass while changed ones fail", () => {
		expect(
			passes([
				{ check: "node-id-retained", board: "Flask", node: "Flask app" },
				{ check: "node-id-retained", board: "Flask", node: "CLI" },
				{ check: "node-id-retained", board: "Flask", node: "Ghost" },
				{ check: "edge-ids-retained", board: "Flask" },
				{
					check: "node-field-retained",
					board: "Flask",
					node: "Flask app",
					fields: ["responsibility", "binding"],
				},
				{ check: "node-field-retained", board: "Flask", node: "Flask app", fields: ["groups"] },
			]),
		).toEqual([true, false, false, false, true, false]);
	});
});

describe("content checks", () => {
	test("groups, parent, kind, binding, drill-down, relationships, receivers and counts", () => {
		expect(
			passes([
				{
					check: "node-groups",
					board: "Flask",
					node: "Dispatch",
					groups: ["sansio-core", "request-lifecycle"],
				},
				{ check: "node-groups", board: "Flask", node: "CLI", groups: [] },
				{ check: "node-groups", board: "Flask", node: "CLI", groups: ["request-lifecycle"] },
				{ check: "node-parent", board: "Flask", node: "Dispatch", parent: "Flask app" },
				{ check: "node-kind", board: "Flask", node: "Provider", kind: "module" },
				{
					check: "node-binding",
					board: "Flask",
					node: "Flask app",
					pathIncludes: "src/flask/app.py",
				},
				{
					check: "node-drilldown",
					board: "Flask",
					node: "Provider",
					target: "Flask sansio",
					variantKind: "named",
					variantName: "Blueprint registration",
				},
				{
					check: "node-drilldown",
					board: "Flask",
					node: "Provider",
					target: "Flask sansio",
					variantKind: "current",
				},
				{ check: "edge-between", board: "Flask", from: "Flask app", to: "Provider", kind: "call" },
				{ check: "no-edge-between", board: "Flask", from: "Flask app", to: "Dispatch" },
				{ check: "no-edge-to-container-with-children", board: "Flask" },
				{ check: "container-has-children", board: "Flask", container: "Flask app", min: 1 },
				{ check: "node-count-between", board: "Flask", min: 2, max: 3 },
				{ check: "nodes-named", board: "Flask", names: ["Provider", "CLI"] },
				{ check: "nodes-absent", board: "Flask", variant: "No provider", names: ["Provider"] },
				{
					check: "node-field-equals",
					board: "Flask",
					node: "Flask app",
					field: "responsibility",
					expected: "The app",
				},
			]),
		).toEqual([
			true,
			true,
			false,
			true,
			true,
			true,
			true,
			false,
			true,
			true,
			true,
			true,
			false,
			true,
			true,
			true,
		]);
	});

	test("a relationship landing on a container fails the receiver rule and names the relationship", () => {
		const verdict = evaluateOutcomes(
			[{ check: "no-edge-to-container-with-children", board: "Flask" }],
			{ ...READING, boards: READING.snapshot },
		)[0];
		expect(verdict?.passed).toBe(false);
		expect(verdict?.detail).toContain("e2");
	});

	test("traffic: default before, stated after, off on a relationship without it", () => {
		const before: Reading = { ...READING, boards: READING.snapshot };
		expect(
			passes(
				[
					{
						check: "edge-traffic",
						board: "Flask",
						from: "CLI",
						to: "Dispatch",
						traffic: "default",
					},
				],
				before,
			),
		).toEqual([true]);
		expect(
			passes([
				{
					check: "edge-traffic",
					board: "Flask",
					from: "CLI",
					to: "Dispatch",
					traffic: { speed: 80, volume: 2 },
				},
				{ check: "edge-traffic", board: "Flask", from: "CLI", to: "Dispatch", traffic: "default" },
				{
					check: "edge-traffic",
					board: "Flask",
					from: "Flask app",
					to: "Provider",
					traffic: "off",
				},
			]),
		).toEqual([true, false, true]);
	});

	test("a missing board or variant is a failed finding that says which", () => {
		const verdicts = evaluateOutcomes(
			[
				{ check: "nodes-named", board: "Nope", names: ["x"] },
				{ check: "nodes-named", board: "Flask", variant: "Ghost", names: ["x"] },
			],
			READING,
		);
		expect(verdicts.map((verdict) => verdict.passed)).toEqual([false, false]);
		expect(verdicts[0]?.detail).toContain("Nope");
		expect(verdicts[1]?.detail).toContain("Ghost");
	});
});

/**
 * The board with more nodes on its current variant, so two of them can answer
 * to one name.
 * @param board The board.
 * @param names The names to add.
 * @returns The board, its current variant that much larger.
 */
function alsoNamed(board: SemanticBoard, names: readonly string[]): SemanticBoard {
	const [first, ...rest] = board.variants;
	if (first === undefined) return board;
	const added = names.map((name, index) => ({
		id: `add${index}`,
		order: (first.content.nodes.length + index + 1) * 1000,
		name,
		kind: "module",
	}));
	const nodes = [...first.content.nodes, ...added];
	return { ...board, variants: [{ ...first, content: { ...first.content, nodes } }, ...rest] };
}

describe("the name a check uses and the name the author wrote", () => {
	test("a subject spelled differently answers the check, and the verdict says which name", () => {
		const verdicts = evaluateOutcomes(
			[
				{ check: "nodes-named", board: "flask", names: ["Flask App"] },
				{ check: "node-kind", board: "Flask", node: "provider", kind: "module" },
				{ check: "node-parent", board: "Flask", node: "Dispatch", parent: "flask_app" },
				{
					check: "edge-between",
					board: "Flask",
					from: "flask-app",
					to: "Provider",
					kind: "call",
				},
			],
			READING,
		);
		expect(verdicts.map((verdict) => verdict.passed)).toEqual([true, true, true, true]);
		expect(verdicts[0]?.detail).toContain('"Flask App" matched "Flask app"');
		expect(verdicts[1]?.detail).toContain('"provider" matched "Provider"');
	});

	test("a check requiring absence fails on anything that could answer, and names it", () => {
		const verdicts = evaluateOutcomes(
			[
				{ check: "nodes-absent", board: "Flask", names: ["provider"] },
				{ check: "no-edge-between", board: "Flask", from: "flask_app", to: "provider" },
			],
			READING,
		);
		expect(verdicts.map((verdict) => verdict.passed)).toEqual([false, false]);
		expect(verdicts[0]?.detail).toContain("Provider");
		expect(verdicts[1]?.detail).toContain("Flask app -> Provider");
	});

	test("a name two subjects answer to equally well finds neither, and hides neither", () => {
		const confusable: Reading = {
			...READING,
			boards: new Map([
				["Flask", alsoNamed(AFTER, ["Default JSON provider", "Cached JSON provider"])],
			]),
		};
		const verdicts = evaluateOutcomes(
			[
				{ check: "nodes-named", board: "Flask", names: ["JSON provider"] },
				{ check: "nodes-absent", board: "Flask", names: ["JSON provider"] },
			],
			confusable,
		);
		expect(verdicts.map((verdict) => verdict.passed)).toEqual([false, false]);
		expect(verdicts[1]?.detail).toContain("Default JSON provider, Cached JSON provider");
	});
});

describe("relationships into a container", () => {
	test("edge-between matches a sender or receiver drawn inside the named part only when asked", () => {
		expect(
			passes([
				{ check: "edge-between", board: "Flask", from: "CLI", to: "Flask app" },
				{
					check: "edge-between",
					board: "Flask",
					from: "CLI",
					to: "Flask app",
					includeContained: true,
				},
				{
					check: "edge-between",
					board: "Flask",
					from: "CLI",
					to: "Flask app",
					kind: "data",
					includeContained: true,
				},
				{
					check: "edge-between",
					board: "Flask",
					from: "Provider",
					to: "Flask app",
					includeContained: true,
				},
			]),
		).toEqual([false, true, false, false]);
	});
});
