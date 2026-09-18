// What grading cites must land: every expected feature names a passage the
// skill holds, and the catalogue the grader answers in is the skill's and the
// rubric's alike. A suite that has come loose is refused at `eval:skill check`
// rather than graded. None of this runs a model.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	CATALOGUE_ROWS,
	anchorsOf,
	catalogueProblems,
	catalogueRowsOf,
	citationProblem,
	keepBatchSkill,
	loadSuite,
	rubricSectionProblems,
	ScenarioSchema,
	suiteProblems,
} from "@/runtime/skill-evaluation/index";

const checkout = path.resolve(import.meta.dir, "../../../..");
const loaded = loadSuite(path.join(checkout, "evals"));

/**
 * A skill tree holding one file.
 * @param text The file's text.
 * @returns The skill root; removed by the caller.
 */
function skillWith(text: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-citations-"));
	fs.mkdirSync(path.join(root, "references"));
	fs.writeFileSync(path.join(root, "references", "edit.md"), text);
	return root;
}

/**
 * A catalogue table over the given keys.
 * @param keys The row keys.
 * @returns The table's lines.
 */
const table = (keys: readonly string[]): string =>
	["| Row | When |", "| --- | --- |", ...keys.map((key) => `| \`${key}\` | x |`)].join("\n");

describe("a citation", () => {
	test("resolves to a heading of a skill file, and anything else is a problem", () => {
		const root = skillWith(
			"# Edit an existing board\n\n## Handles, and removals\n\n```md\n## Not a heading\n```\n\n## Handles, and removals\n",
		);
		try {
			expect(citationProblem(root, "references/edit.md#edit-an-existing-board")).toBeNull();
			expect(citationProblem(root, "references/edit.md#handles-and-removals")).toBeNull();
			// A repeated heading is numbered, as a renderer numbers its anchor.
			expect(citationProblem(root, "references/edit.md#handles-and-removals-1")).toBeNull();
			expect(citationProblem(root, "references/edit.md#not-a-heading")).not.toBeNull();
			expect(citationProblem(root, "references/edit.md#nowhere")).not.toBeNull();
			expect(citationProblem(root, "references/read.md#edit-an-existing-board")).not.toBeNull();
			expect(citationProblem(root, "../outside.md#x")).not.toBeNull();
			expect(citationProblem(root, "references/edit.md")).not.toBeNull();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("anchors ignore fenced code", () => {
		expect([...anchorsOf("# A b\n~~~\n# C\n~~~\n### D (e)\n")]).toEqual(["a-b", "d-e"]);
	});
});

describe("the catalogue", () => {
	test("is read from the table whose first column is Row, wherever it sits", () => {
		const keys = [...CATALOGUE_ROWS];
		expect(catalogueRowsOf(`# R\n\n${table(keys)}\n\nText after.`)).toEqual(keys);
		expect(catalogueRowsOf(`# R\n\nA paragraph moved above.\n\n## S\n\n${table(keys)}\n`)).toEqual(
			keys,
		);
		expect(catalogueRowsOf("# R\n\nno table")).toBeNull();
	});

	test("a missing, an extra or an absent catalogue is a problem; the closed set is not", () => {
		expect(catalogueProblems("r", table(CATALOGUE_ROWS))).toEqual([]);
		expect(catalogueProblems("r", table(CATALOGUE_ROWS.slice(1)))).toHaveLength(1);
		expect(catalogueProblems("r", table([...CATALOGUE_ROWS, "node description"]))).toHaveLength(1);
		expect(catalogueProblems("r", "no table")).toHaveLength(1);
	});

	test("the rubric section the prompt points at must exist", () => {
		expect(rubricSectionProblems("r", loaded.rubric)).toEqual([]);
		expect(rubricSectionProblems("r", "# Grading rubric\n")).not.toEqual([]);
	});
});

describe("the suite", () => {
	test("a feature naming no passage is refused by the scenario's schema", () => {
		const [first] = loaded.suite.evals;
		if (first === undefined) throw new Error("the suite has no scenario");
		const uncited = first.expectedFeatures.map(({ skill: _skill, ...rest }) => rest);
		expect(ScenarioSchema.safeParse({ ...first, expectedFeatures: uncited }).success).toBe(false);
		expect(ScenarioSchema.safeParse(first).success).toBe(true);
	});

	test("a feature citing a passage the skill does not hold is refused", () => {
		const [first, ...rest] = loaded.suite.evals;
		if (first === undefined) throw new Error("the suite has no scenario");
		const [feature, ...others] = first.expectedFeatures;
		if (feature === undefined) throw new Error("the scenario has no feature");
		const loose = {
			...loaded,
			suite: {
				...loaded.suite,
				evals: [
					{
						...first,
						expectedFeatures: [{ ...feature, skill: ["SKILL.md#no-such-heading"] }, ...others],
					},
					...rest,
				],
			},
		};
		expect(suiteProblems(loose)).toHaveLength(1);
	});

	test("a rubric whose catalogue drifted from the skill's is refused", () => {
		const drifted = { ...loaded, rubric: loaded.rubric.replace("| `emphasis`", "| `hero`") };
		expect(suiteProblems(drifted).length).toBeGreaterThan(0);
	});
});

test("a batch keeps the skill it ran once, without the derived generated files", () => {
	const skill = skillWith("# Edit an existing board\n");
	const batch = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-kept-skill-"));
	try {
		fs.mkdirSync(path.join(skill, "references", "generated"));
		fs.writeFileSync(path.join(skill, "references", "generated", "schema.json"), "{}");
		keepBatchSkill(skill, batch);
		const kept = path.join(batch, "skill");
		expect(citationProblem(kept, "references/edit.md#edit-an-existing-board")).toBeNull();
		expect(fs.existsSync(path.join(kept, "references", "generated"))).toBe(false);
		// A resumed batch keeps its first copy, whatever the checkout holds by then.
		fs.writeFileSync(path.join(skill, "references", "edit.md"), "# Renamed\n");
		keepBatchSkill(skill, batch);
		expect(citationProblem(kept, "references/edit.md#edit-an-existing-board")).toBeNull();
	} finally {
		fs.rmSync(skill, { recursive: true, force: true });
		fs.rmSync(batch, { recursive: true, force: true });
	}
});
