// The content checks decide from saved boards alone and say what they found:
// a rename that minted a new id fails identity, traffic reads as off, default
// or stated, and a relationship landing on a container fails the receiver rule.

import { describe, expect, test } from "bun:test";
import { evaluateOutcomes, type Reading } from "@/runtime/skill-evaluation/index";
import { passes, READING } from "@/runtime/skill-evaluation/tests/reading-fixture";

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
