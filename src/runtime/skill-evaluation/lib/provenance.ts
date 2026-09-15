// A resumed comparison must use the same inputs and implementation as its
// completed runs. Keep content identities, not a mutable checkout path.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { digestOf } from "@/runtime/skill-evaluation/lib/install";
import type { LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

const ProvenanceSchema = z
	.object({
		inputs: z.string(),
		implementation: z.string(),
		baseline: z.string(),
		candidate: z.string(),
		bun: z.string(),
	})
	.strict();
type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Hash the complete scenario inputs, including fixture bodies and the rubric.
 * The grader runners are left out: a grader is chosen when grading runs and
 * recorded by its session, so changing one never makes a batch un-gradable.
 * @param loaded The canonical suite.
 * @returns The content identity.
 */
function inputDigest(loaded: LoadedSuite): string {
	const { directory: _directory, graders: _graders, fixtures, ...inputs } = loaded;
	return createHash("sha256")
		.update(JSON.stringify({ ...inputs, fixtures: [...fixtures] }))
		.digest("hex");
}

/**
 * Capture the runnable implementation, dependencies and both skill packages.
 * @param checkout The Archboard checkout.
 * @param loaded The suite.
 * @returns The identities a resumed batch must match.
 */
function batchProvenance(checkout: string, loaded: LoadedSuite): Provenance {
	const hash = createHash("sha256").update(digestOf(path.join(checkout, "src")));
	for (const name of ["package.json", "bun.lock", "tsconfig.json", "INSTALL.md"]) {
		hash.update(name).update(fs.readFileSync(path.join(checkout, name)));
	}
	return {
		inputs: inputDigest(loaded),
		implementation: hash.digest("hex"),
		baseline: digestOf(path.join(checkout, loaded.pins.baselineSkill.location)),
		candidate: digestOf(path.join(checkout, "skills", "archboard")),
		bun: Bun.version,
	};
}

/**
 * Refuse incompatible or legacy manifests without changing any saved result.
 * @param previous The provenance saved when the batch started.
 * @param current The current content identities.
 */
function assertProvenance(previous: unknown, current: Provenance): void {
	const saved = ProvenanceSchema.safeParse(previous);
	if (!saved.success || JSON.stringify(saved.data) !== JSON.stringify(current)) {
		throw new Error(
			"This batch's inputs, tools or skill packages changed (or its provenance is missing). Start a new batch; the saved results were kept.",
		);
	}
}

/**
 * Keep grading and report checklists bound to the inputs used by the authors.
 * @param batchRoot The saved comparison.
 * @param loaded The inputs requested for grading or reporting.
 */
function assertBatchInputs(batchRoot: string, loaded: LoadedSuite): void {
	const manifest = z
		.object({ provenance: ProvenanceSchema })
		.parse(JSON.parse(fs.readFileSync(path.join(batchRoot, "batch.json"), "utf8")));
	if (manifest.provenance.inputs !== inputDigest(loaded))
		throw new Error(
			"The evaluation inputs differ from this batch. Restore its pinned inputs before grading or reporting.",
		);
}

export { assertBatchInputs, assertProvenance, batchProvenance, inputDigest, type Provenance };
