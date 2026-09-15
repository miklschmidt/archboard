// Where a batch keeps each grader's work. A batch can be graded by more than
// one grader: each has its own directory under `graders/<name>/`, and they
// share one staged workspace under `graders/workspace/`. A batch graded before
// there was a choice holds a single `grader/` directory, which reads as the
// Codex grader with its own workspace, untouched.

import fs from "node:fs";
import path from "node:path";
import { GRADER_NAMES, type GraderName } from "@/runtime/skill-evaluation/lib/suite";

/** Where one grader's pass keeps things. */
interface GraderLayout {
	readonly name: GraderName;
	readonly root: string;
	readonly workspace: string;
	readonly verdicts: string;
	readonly session: string;
	readonly schema: string;
	/** Whether this is the single-grader layout of an older batch. */
	readonly legacy: boolean;
}

/**
 * Whether a batch holds the older single-grader layout for the Codex grader.
 * @param batchRoot The batch.
 * @returns True when `grader/` exists and `graders/codex/` does not.
 */
function hasLegacyLayout(batchRoot: string): boolean {
	return (
		fs.existsSync(path.join(batchRoot, "grader")) &&
		!fs.existsSync(path.join(batchRoot, "graders", "codex"))
	);
}

/**
 * The layout of one grader's pass over a batch, without creating anything.
 * @param batchRoot The batch.
 * @param name The grader.
 * @returns The paths.
 */
function graderLayout(batchRoot: string, name: GraderName): GraderLayout {
	const legacy = name === "codex" && hasLegacyLayout(batchRoot);
	const root = legacy ? path.join(batchRoot, "grader") : path.join(batchRoot, "graders", name);
	return {
		name,
		root,
		workspace: legacy ? path.join(root, "workspace") : path.join(batchRoot, "graders", "workspace"),
		verdicts: path.join(root, "verdicts"),
		session: path.join(root, "session.json"),
		schema: path.join(root, "output-schema.json"),
		legacy,
	};
}

/**
 * The layout, its directories created.
 * @param batchRoot The batch.
 * @param name The grader.
 * @returns The paths.
 */
function prepareGraderLayout(batchRoot: string, name: GraderName): GraderLayout {
	const layout = graderLayout(batchRoot, name);
	for (const directory of [layout.workspace, layout.verdicts])
		fs.mkdirSync(directory, { recursive: true });
	return layout;
}

/**
 * The graders that have graded anything of a batch, in a fixed order.
 * @param batchRoot The batch.
 * @returns Their names.
 */
function availableGraders(batchRoot: string): GraderName[] {
	return GRADER_NAMES.filter((name) => fs.existsSync(graderLayout(batchRoot, name).session));
}

export { availableGraders, graderLayout, prepareGraderLayout, type GraderLayout };
