// A resumed comparison must use the same inputs and implementation as its
// completed runs. Keep content identities, not a mutable checkout path.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { digestOf } from "@/runtime/skill-evaluation/lib/install";
import { PinsSchema, type LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

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
 * The pins as they bind a batch: without the grader block that older pins
 * carried before graders.json, and without their prose. A grader is chosen
 * when grading runs, and a comment binds nothing.
 * @param pins The pins as recorded or as loaded.
 * @returns The binding part.
 */
function bindingPins(pins: LoadedSuite["pins"]): unknown {
	const { $comment: _comment, usageSemantics: _semantics, codex, ...rest } = pins;
	const { grader: _grader, ...codexRest } = codex;
	return { ...rest, codex: codexRest };
}

/**
 * Whether a batch recorded under older pins is bound by the same inputs as
 * the loaded ones: its own recorded pins reproduce its digest, and they
 * differ from today's only in what no longer binds a batch.
 * @param recorded The batch's recorded pins.
 * @param digest The batch's recorded input digest.
 * @param loaded The inputs requested now.
 * @returns True when the inputs still match.
 */
function boundByOlderPins(recorded: unknown, digest: string, loaded: LoadedSuite): boolean {
	const pins = PinsSchema.safeParse(recorded);
	if (!pins.success) return false;
	return (
		inputDigest({ ...loaded, pins: pins.data }) === digest &&
		JSON.stringify(bindingPins(pins.data)) === JSON.stringify(bindingPins(loaded.pins))
	);
}

/**
 * Keep grading and report checklists bound to the inputs used by the authors.
 * @param batchRoot The saved comparison.
 * @param loaded The inputs requested for grading or reporting.
 */
function assertBatchInputs(batchRoot: string, loaded: LoadedSuite): void {
	const manifest = z
		.object({ provenance: ProvenanceSchema, pins: z.unknown().optional() })
		.parse(JSON.parse(fs.readFileSync(path.join(batchRoot, "batch.json"), "utf8")));
	const digest = manifest.provenance.inputs;
	if (digest === inputDigest(loaded)) return;
	if (boundByOlderPins(manifest.pins, digest, loaded)) return;
	throw new Error(
		"The evaluation inputs differ from this batch. Restore its pinned inputs before grading or reporting.",
	);
}

export { assertBatchInputs, assertProvenance, batchProvenance, inputDigest, type Provenance };
