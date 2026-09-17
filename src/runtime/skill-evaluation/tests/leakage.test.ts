import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { leakageProblems } from "@/runtime/skill-evaluation/index";

// A skill package that carries an evaluation's names hands every author the
// answer without a read the harness could flag, so the input check refuses it.

const root = mkdtempSync(path.join(tmpdir(), "skill-leakage-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * A skill package on disk.
 * @param name Its directory.
 * @param files Its files, by relative path.
 * @returns Its root.
 */
function skillPackage(name: string, files: Record<string, string>): string {
	const dir = path.join(root, name);
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
		writeFileSync(path.join(dir, file), text);
	}
	return dir;
}

const SCENARIOS = [
	{
		id: "S01",
		prompt: "Explain `Handle a request` on the `Order pipeline` board through `Checkout.submit`.",
		outcomes: [{ check: "view-exists", board: "Order pipeline", view: "Dispatch exchange" }],
	},
];
const FIXTURES = [
	{
		policy: { groups: { "request-lifecycle": { name: "Lifecycle" } } },
		steps: [
			{
				op: "new",
				board: "Order pipeline",
				input: { nodes: [{ name: "Shell" }, { name: "run_simple" }] },
			},
		],
	},
];

test("a package naming the evaluated framework, a graded board, a quoted symbol or a group id is refused, each where it is named", () => {
	const leaky = skillPackage("leaky", {
		"SKILL.md": "Draw the Werkzeug server.\nA clean line.\n",
		"references/example.md": [
			'archboard semantic new "Order pipeline"',
			"calls Checkout.submit",
			"then run_simple",
			"joins request-lifecycle",
			"through the Dispatch exchange view",
		].join("\n"),
	});
	const problems = leakageProblems(SCENARIOS, FIXTURES, new Map([["candidate", leaky]]));
	expect(problems.map((problem) => problem.split(": ")[0])).toEqual([
		"candidate/SKILL.md:1",
		"candidate/references/example.md:1",
		"candidate/references/example.md:2",
		"candidate/references/example.md:3",
		"candidate/references/example.md:4",
		"candidate/references/example.md:5",
	]);
});

test("ordinary words, identifiers that merely contain a term, and names the product's generated contract defines are not leaks", () => {
	const clean = skillPackage("clean", {
		"SKILL.md":
			"A Shell calls the CLI. The icon is RiFlaskLine.\nUse `Dispatch exchange` from the schema.\n",
		"references/generated/schema.json": '{ "description": "Dispatch exchange" }',
	});
	expect(leakageProblems(SCENARIOS, FIXTURES, new Map([["baseline", clean]]))).toEqual([]);
});
