// A batch has one source of the candidate skill: the copy it kept when it
// started. Every candidate run installs that copy, not whatever the checkout
// holds at the run's own time, and a resume checks the copy against the digest
// recorded when it was kept, so an edit to the skill mid-batch changes nothing
// the authors read or the grader judges against. None of this runs a model.

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	installSkill,
	keepBatchSkill,
	keptCandidate,
	prepareRunDirectory,
	runEnvironment,
} from "@/runtime/skill-evaluation/index";

const checkout = path.resolve(import.meta.dir, "../../../..");

test("a candidate run installs the batch's kept copy, not the checkout as it stands", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-install-"));
	try {
		const kept = keepBatchSkill(path.join(checkout, "skills", "archboard"), root);
		// The kept copy now differs from the checkout, as an edit made mid-batch
		// would: its SKILL.md changed, and a reference the checkout still holds
		// is gone from it.
		fs.appendFileSync(path.join(kept, "SKILL.md"), "\nKEPT-COPY-MARKER\n");
		fs.rmSync(path.join(kept, "references", "read.md"));
		const paths = prepareRunDirectory(path.join(root, "run"));
		fs.mkdirSync(paths.flask, { recursive: true });
		Bun.spawnSync(["git", "init", "--quiet"], { cwd: paths.flask });
		const cli = {
			checkout,
			env: runEnvironment(paths, "http://127.0.0.1:9"),
			cwd: paths.flask,
		};
		const install = await installSkill("candidate", cli, paths, kept);
		const installed = fs.readFileSync(path.join(install.skillRoot, "SKILL.md"), "utf8");
		expect(installed).toBe(fs.readFileSync(path.join(kept, "SKILL.md"), "utf8"));
		expect(install.source).toBe(kept);
		// Nothing of the checkout survives into the install beside the kept copy.
		expect(fs.existsSync(path.join(install.skillRoot, "references", "read.md"))).toBe(false);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("a resumed batch keeps the digest it recorded, and refuses a copy edited since", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-kept-candidate-"));
	const skill = path.join(checkout, "skills", "archboard");
	try {
		const first = keptCandidate(skill, root);
		fs.writeFileSync(
			path.join(root, "batch.json"),
			JSON.stringify({ candidateSkillDigest: first.digest }),
		);
		expect(keptCandidate(skill, root)).toEqual(first);
		fs.appendFileSync(path.join(first.directory, "SKILL.md"), "\nedited between runs\n");
		expect(() => keptCandidate(skill, root)).toThrow();
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
