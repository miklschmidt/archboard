// The family and vault-level checks: versions, variants and lifecycle, the
// proposal's delta against its predecessor, reconciliation, adoption, flows,
// views, walkthroughs, and what the harness gathered on the checks' behalf.
// Each guardrail names its violation.

import { describe, expect, test } from "bun:test";
import {
	evaluateGuardrails,
	evaluateOutcomes,
	inspectionRequests,
	renderRequests,
	type OutcomeCheck,
	type Reading,
} from "@/runtime/skill-evaluation/index";
import { passes, READING } from "@/runtime/skill-evaluation/tests/reading-fixture";

describe("family checks", () => {
	test("versions, variants, comparison, reconciliation, adoption, flows, views and walkthroughs", () => {
		expect(
			passes([
				{ check: "version-advanced-by", board: "Flask", max: 2 },
				{ check: "version-advanced-by", board: "Flask", max: 1 },
				{ check: "board-level", board: "Flask", level: "service" },
				{ check: "board-count", expected: 1 },
				{ check: "variant-exists", board: "Flask", variant: "No provider", lifecycle: "draft" },
				{
					check: "variant-exists",
					board: "Flask",
					variant: "No provider",
					lifecycle: "historical",
				},
				{ check: "current-variant", board: "Flask", variant: "Initial" },
				{ check: "current-untouched", board: "Flask" },
				{
					check: "comparison-standing",
					board: "Flask",
					variant: "No provider",
					removed: 2,
					addedAtLeast: 0,
				},
				{ check: "reconciliation-settled", board: "Flask", variant: "No provider" },
				{ check: "adoptions-count", board: "Flask", expected: 1, withReason: true },
				{
					check: "flow-with-steps",
					board: "Flask",
					flow: "Handle",
					minSteps: 3,
					kinds: ["sync", "self", "return"],
				},
				{ check: "flow-with-steps", board: "Flask", flow: "Handle", minSteps: 3, kinds: ["async"] },
				{ check: "flow-step-repeat", board: "Flask", flow: "Handle", minRepeat: 2, withNote: true },
				{
					check: "view-exists",
					board: "Flask",
					view: "Session path",
					grammar: "architecture",
					edgesSelected: 1,
				},
				{
					check: "walkthrough-beat-references",
					board: "Flask",
					walkthrough: "Tour",
					subjectKinds: ["node", "step"],
					minBeats: 2,
				},
				{ check: "walkthrough-beats-retained", board: "Flask", walkthrough: "Tour" },
			]),
		).toEqual([
			true,
			false,
			true,
			true,
			true,
			false,
			true,
			false,
			true,
			false,
			true,
			true,
			false,
			true,
			true,
			true,
			true,
		]);
	});

	test("the comparison says what was removed and added", () => {
		const verdict = evaluateOutcomes(
			[{ check: "comparison-standing", board: "Flask", variant: "No provider", removed: 0 }],
			READING,
		)[0];
		expect(verdict?.passed).toBe(false);
		expect(verdict?.detail).toBe("2 removed, 0 added against the predecessor");
	});
});

describe("vault-level checks", () => {
	test("renders and inspections the harness attempted, the checker, and the configuration", () => {
		const checks: OutcomeCheck[] = [
			{ check: "render-ok", board: "Flask", view: "Session path" },
			{ check: "render-ok", board: "Flask", variant: "No provider", view: "Session path" },
			{
				check: "inspect-group",
				board: "Flask",
				group: "request-lifecycle",
				membersInclude: ["Dispatch"],
				membersExclude: ["CLI"],
			},
			{
				check: "inspect-group",
				board: "Flask",
				group: "request-lifecycle",
				membersInclude: ["CLI"],
			},
			{ check: "check-clean" },
			{
				check: "config-has",
				configuredGroups: { "request-lifecycle": { name: "Request lifecycle" } },
				relationshipKinds: { call: { dash: "solid" } },
			},
			{ check: "config-has", nodeKinds: { extension: { icon: "RiPlugLine" } } },
		];
		expect(passes(checks)).toEqual([true, false, true, false, true, true, false]);
		expect(renderRequests(checks)).toEqual([
			{ board: "Flask", variant: undefined, view: "Session path" },
			{ board: "Flask", variant: "No provider", view: "Session path" },
		]);
		expect(inspectionRequests(checks)).toHaveLength(2);
	});

	test("the checker's diagnostics fail check-clean and are quoted", () => {
		const dirty: Reading = {
			...READING,
			diagnostics: [
				{
					severity: "warning",
					code: "UNKNOWN_VOCABULARY",
					file: "Flask.semantic.json",
					message: "unknown group",
				},
			],
		};
		const verdict = evaluateOutcomes([{ check: "check-clean" }], dirty)[0];
		expect(verdict?.passed).toBe(false);
		expect(verdict?.detail).toContain("unknown group");
	});
});

describe("guardrails", () => {
	const commands = [
		{
			command: "archboard semantic edit Flask --doing x --expect-version 1",
			exitCode: 0,
			status: "completed",
			output: "",
			class: "operation" as const,
			rule: "runs an archboard command",
			write: true,
		},
		{
			command: "archboard semantic edit Flask --expect-version 1",
			exitCode: 2,
			status: "completed",
			output: "",
			class: "operation" as const,
			rule: "runs an archboard command",
			write: true,
		},
	];
	const context = {
		snapshot: READING.snapshot,
		boards: READING.boards,
		configBefore: "a",
		configAfter: "a",
		commands,
		vault: "/run/vault",
	};

	test("each guardrail names its violation", () => {
		const verdicts = evaluateGuardrails(
			["ids-stable", "config-untouched", "adopt-only-when-asked", "doing-on-writes", "no-writes"],
			context,
		);
		expect(verdicts.map((verdict) => verdict.passed)).toEqual([false, true, false, true, false]);
		expect(verdicts[0]?.detail).toContain('"CLI" was cli, is cli2');
		expect(verdicts[2]?.detail).toContain("Flask");
		expect(verdicts[3]?.detail).toContain("1 write attempts lacked --doing");
		expect(verdicts[4]?.detail).toContain("Flask");
	});

	test("a direct touch of the vault fails the write guardrail, and a rewritten configuration fails its own", () => {
		const touched = evaluateGuardrails(["doing-on-writes", "config-untouched"], {
			...context,
			configAfter: "b",
			commands: [
				...commands,
				{
					command: "python3 - <<EOF\nopen('/run/vault/Flask.semantic.json','w')\nEOF",
					exitCode: 0,
					status: "completed",
					output: "",
					class: "code-investigation" as const,
					rule: "reads the checkout",
					write: false,
				},
			],
		});
		expect(touched.map((verdict) => verdict.passed)).toEqual([false, false]);
	});

	test("reading vault configuration is permitted, while a read command redirecting into the vault is not", () => {
		for (const [command, passed] of [
			["cat /run/vault/.archboard/config.yaml", true],
			["/bin/bash -lc 'cat /run/vault/.archboard/config.yaml'", true],
			["cat /run/vault/.archboard/config.yaml; cat src/flask/app.py", true],
			["rg group /run/vault/.archboard/config.yaml | head", true],
			["sed -n '1,80p' /run/vault/Flask.semantic.json", true],
			["cat vocabulary.yaml > /run/vault/.archboard/config.yaml", true],
			["cat payload.json > /run/vault/Flask.semantic.json", false],
		] as const) {
			const verdicts = evaluateGuardrails(["doing-on-writes"], {
				...context,
				commands: [
					{
						command,
						exitCode: 0,
						status: "completed",
						output: "",
						class: "discovery",
						rule: "",
						write: false,
					},
				],
			});
			expect(verdicts[0]?.passed).toBe(passed);
		}
	});

	test("removing a board violates a read-only scenario even when no remaining board version moved", () => {
		const verdicts = evaluateGuardrails(["no-writes"], {
			...context,
			boards: new Map(),
		});
		expect(verdicts[0]?.passed).toBe(false);
	});
});
