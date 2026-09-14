// The canonical inputs the human-run evaluation starts from are whole: they
// load under the live schemas, every fixture step is something the CLI would
// accept once its placeholders resolve, and the inventory maps onto scenarios
// that exist. None of this runs a model.

import { describe, expect, test } from "bun:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SemanticBoardSchema } from "@/shared/semantic-board/index";
import {
	FixtureStepSchema,
	inspectionRequests,
	loadSuite,
	renderRequests,
	resolvePlaceholders,
	stepCommand,
	suiteProblems,
} from "@/runtime/skill-evaluation/index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const loaded = loadSuite(join(root, "skills", "archboard", "evals"));

const BOARD = SemanticBoardSchema.parse({
	schemaVersion: "2.2.0",
	kind: "semantic-board",
	id: "b",
	name: "Flask JSON",
	level: "service",
	version: 4,
	createdAt: "2026-09-14T00:00:00.000Z",
	updatedAt: "2026-09-14T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "helpers", name: "JSON helpers", kind: "module" },
					{ id: "app", name: "Flask app", kind: "app" },
					{ id: "tag", name: "Tagged JSON", kind: "module" },
				],
				edges: [],
				flows: [],
				walkthroughs: [],
			},
		},
		{
			id: "v2",
			name: "Provider rewrite",
			lifecycle: "draft",
			parent: "v1",
			content: {
				nodes: [
					{ id: "helpers", name: "JSON helpers", kind: "module" },
					{ id: "app", name: "Flask app", kind: "app" },
					{ id: "tag", name: "Tagged JSON", kind: "module" },
				],
				edges: [],
				flows: [],
				walkthroughs: [],
			},
		},
	],
});

describe("the canonical suite", () => {
	test("loads whole: every scenario has a fixture, every coverage part and scenario reference exists", () => {
		expect(suiteProblems(loaded)).toEqual([]);
		expect(loaded.suite.evals.length).toBeGreaterThanOrEqual(15);
		expect(loaded.coverage.parts.map((part) => part.part)).toEqual(
			Array.from({ length: 14 }, (_, index) => index + 1),
		);
	});

	test("every scenario is reached by the inventory, reports as primary or broad, and pins a revision the pins hold", () => {
		const covered = new Set(
			loaded.coverage.parts.flatMap((part) => part.entries.flatMap((entry) => entry.scenarios)),
		);
		for (const scenario of loaded.suite.evals) {
			expect(covered.has(scenario.id), scenario.id).toBe(true);
			expect(loaded.pins.flask.revisions[scenario.flask]).toMatch(/^[0-9a-f]{40}$/u);
		}
		expect(
			loaded.suite.evals
				.filter((scenario) => scenario.report === "broad")
				.map((scenario) => scenario.id),
		).toEqual(["S14"]);
	});

	test("the grouping and traffic scenarios ask for the TASK-207 contract and the three traffic states", () => {
		const checks = loaded.suite.evals.flatMap((scenario) =>
			scenario.outcomes.map((check) => ({ scenario: scenario.id, ...check })),
		);
		const groups = checks.filter(
			(check) => check.check === "node-groups" && (check.groups?.length ?? 0) > 1,
		);
		expect(groups.length).toBeGreaterThan(0);
		expect(checks.some((check) => check.check === "inspect-group")).toBe(true);
		const traffic = new Set(
			checks
				.filter((check) => check.check === "edge-traffic")
				.map((check) => (typeof check.traffic === "string" ? check.traffic : "custom")),
		);
		expect([...traffic].toSorted()).toEqual(["custom", "default", "off"]);
	});

	test("render and inspection requests derive from the checks, so the harness gathers exactly what the checks read", () => {
		for (const scenario of loaded.suite.evals) {
			expect(renderRequests(scenario.outcomes).length).toBe(
				scenario.outcomes.filter((check) => check.check === "render-ok").length,
			);
			expect(inspectionRequests(scenario.outcomes).every((request) => request.group !== "")).toBe(
				true,
			);
		}
	});
});

describe("fixtures", () => {
	test("every step becomes the CLI call the version it read demands, and placeholders resolve to product ids", () => {
		for (const [id, fixture] of loaded.fixtures) {
			for (const step of fixture.steps) {
				const variant =
					step.op === "edit" && typeof step.input["variant"] === "string"
						? step.input["variant"]
						: undefined;
				const resolved = FixtureStepSchema.parse(
					resolvePlaceholders(step, { repo: "github.com/pallets/flask", board: BOARD, variant }),
				);
				expect(JSON.stringify(resolved), id).not.toContain("$");
				const call = stepCommand(resolved, step.op === "new" ? null : 4);
				expect(call.args[0], id).toBe("semantic");
				expect(call.args.includes("--doing"), id).toBe(true);
				expect(call.args.includes("--expect-version"), id).toBe(step.op !== "new");
				expect(call.stdin === undefined, id).toBe(step.op === "branch" || step.op === "adopt");
			}
		}
	});

	test("a $node placeholder resolves on the targeted variant and is refused when the name is not there", () => {
		expect(
			resolvePlaceholders(
				{ id: "$node(JSON helpers)" },
				{ repo: null, board: BOARD, variant: "Provider rewrite" },
			),
		).toEqual({ id: "helpers" });
		expect(() =>
			resolvePlaceholders("$node(Nobody)", { repo: null, board: BOARD, variant: undefined }),
		).toThrow(/Nobody/u);
		expect(() =>
			resolvePlaceholders("$FLASK", { repo: null, board: BOARD, variant: undefined }),
		).toThrow(/register/u);
	});
});
