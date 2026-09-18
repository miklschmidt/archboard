// A batch has one source of the candidate skill: the copy it kept when it
// started. Every candidate run installs that copy, not whatever the checkout
// holds at the run's own time, so an edit to the skill mid-batch changes
// nothing the authors read or the grader judges against. None of this runs a
// model.

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	installSkill,
	keepBatchSkill,
	prepareRunDirectory,
	runEnvironment,
} from "@/runtime/skill-evaluation/index";

const checkout = path.resolve(import.meta.dir, "../../../..");

test("a candidate run installs the batch's kept copy, not the checkout as it stands", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-install-"));
	try {
		const kept = keepBatchSkill(path.join(checkout, "skills", "archboard"), root);
		// The kept copy now differs from the checkout, as an edit made mid-batch would.
		fs.appendFileSync(path.join(kept, "SKILL.md"), "\nKEPT-COPY-MARKER\n");
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
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
