import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	assertBatchInputs,
	assertProvenance,
	batchProvenance,
	inputDigest,
	loadSuite,
	resumeSelection,
} from "@/runtime/skill-evaluation/index";

const loaded = loadSuite(path.join(import.meta.dir, "../../../..", "evals"));

describe("comparison provenance", () => {
	test("changed prompts, fixtures and pins cannot reuse an earlier comparison", () => {
		const digest = inputDigest(loaded);
		expect(inputDigest({ ...loaded, directory: "/another/install" })).toBe(digest);
		expect(inputDigest({ ...loaded, rubric: `${loaded.rubric}\nchanged` })).not.toBe(digest);
		expect(inputDigest({ ...loaded, pins: { ...loaded.pins, repetitions: 9 } })).not.toBe(digest);
		expect(inputDigest({ ...loaded, fixtures: new Map() })).not.toBe(digest);
		// A grader is chosen when grading runs, so its pins never bind a batch.
		expect(
			inputDigest({
				...loaded,
				graders: {
					...loaded.graders,
					claude: { ...loaded.graders.claude, version: "0.0.0", model: "other" },
				},
			}),
		).toBe(digest);
		const changed = {
			...loaded,
			suite: {
				...loaded.suite,
				evals: loaded.suite.evals.map((scenario) => ({ ...scenario, prompt: "changed" })),
			},
		};
		expect(inputDigest(changed)).not.toBe(digest);
	});

	test("resume checks implementation and both skill packages and keeps saved selection", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-provenance-"));
		try {
			for (const directory of ["src", "skills/archboard", loaded.pins.baselineSkill.location]) {
				fs.mkdirSync(path.join(root, directory), { recursive: true });
				fs.writeFileSync(path.join(root, directory, "input.txt"), "original");
			}
			for (const file of ["package.json", "bun.lock", "tsconfig.json", "INSTALL.md"])
				fs.writeFileSync(path.join(root, file), "original");
			const provenance = batchProvenance(root, loaded);
			const manifest = {
				salt: "salt",
				provenance,
				arms: ["candidate"],
				scenarios: ["S03"],
				repetitions: 1,
				codexExecutable: "/pinned/codex",
				pins: loaded.pins,
			};
			fs.writeFileSync(path.join(root, "batch.json"), JSON.stringify(manifest));
			expect(resumeSelection(root)).toEqual({
				arms: ["candidate"],
				scenarios: ["S03"],
				repetitions: 1,
				codexExecutable: "/pinned/codex",
			});
			expect(() => assertProvenance(provenance, batchProvenance(root, loaded))).not.toThrow();
			expect(() => assertBatchInputs(root, loaded)).not.toThrow();
			expect(() => assertBatchInputs(root, { ...loaded, rubric: "changed" })).toThrow();
			// A batch recorded under older pins, with a grader block and other
			// prose, is still bound by the same inputs: a grader is chosen at
			// grade time. A changed author pin is not forgiven.
			const older = {
				...loaded.pins,
				$comment: "older words",
				usageSemantics: "older words",
				codex: { ...loaded.pins.codex, grader: { model: "gpt-6-astra" } },
			};
			const olderBatch = {
				...manifest,
				pins: older,
				provenance: { ...provenance, inputs: inputDigest({ ...loaded, pins: older }) },
			};
			fs.writeFileSync(path.join(root, "batch.json"), JSON.stringify(olderBatch));
			expect(() => assertBatchInputs(root, loaded)).not.toThrow();
			expect(() =>
				assertBatchInputs(root, { ...loaded, pins: { ...loaded.pins, repetitions: 9 } }),
			).toThrow();
			const otherAuthor = {
				...loaded.pins,
				codex: { ...loaded.pins.codex, author: { ...loaded.pins.codex.author, model: "other" } },
			};
			expect(() => assertBatchInputs(root, { ...loaded, pins: otherAuthor })).toThrow();
			// A batch that recorded no pins cannot show what bound it.
			const { pins: _pins, ...unpinned } = olderBatch;
			fs.writeFileSync(path.join(root, "batch.json"), JSON.stringify(unpinned));
			expect(() => assertBatchInputs(root, loaded)).toThrow();
			fs.writeFileSync(path.join(root, "batch.json"), JSON.stringify(manifest));
			for (const file of [
				"src/input.txt",
				"skills/archboard/input.txt",
				`${loaded.pins.baselineSkill.location}/input.txt`,
				"bun.lock",
			]) {
				fs.writeFileSync(path.join(root, file), "changed");
				expect(() => assertProvenance(provenance, batchProvenance(root, loaded))).toThrow();
				fs.writeFileSync(path.join(root, file), "original");
			}
			expect(JSON.parse(fs.readFileSync(path.join(root, "batch.json"), "utf8"))).toEqual(manifest);
			expect(() => assertProvenance(undefined, provenance)).toThrow();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
