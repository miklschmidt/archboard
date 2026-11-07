// Every action that a GitHub workflow uses runs at one commit. A tag can move, so a workflow
// names each external action by its full commit SHA, with the version in a comment beside it.
// A reusable workflow of this repository (`./.github/...`) runs at the caller's commit already.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const workflows = path.join(repoRoot, ".github", "workflows");

/** A local `./` path, or `owner/repo[/path]@<40 hex>`. */
const PINNED = /^(\.\/\S+|[\w.-]+\/[\w./-]+@[0-9a-f]{40})$/;

/** The parts of a workflow that name an action: a reusable workflow on a job, or a step. */
const workflowSchema = z.object({
	jobs: z.record(
		z.string(),
		z.object({
			uses: z.string().optional(),
			steps: z.array(z.object({ uses: z.string().optional() })).optional(),
		}),
	),
});

test("every action in a workflow is pinned to a commit SHA, with its version beside it", () => {
	const unpinned = fs
		.readdirSync(workflows)
		.filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
		.flatMap((name) => {
			const text = fs.readFileSync(path.join(workflows, name), "utf8");
			const { jobs } = workflowSchema.parse(Bun.YAML.parse(text));
			const actions = Object.values(jobs).flatMap((job) =>
				[job.uses].concat((job.steps ?? []).map((step) => step.uses)),
			);
			return actions.flatMap((uses) => {
				if (uses === undefined) return [];
				// The parsed value carries no comment, so the version is read from the text.
				const versioned = uses.startsWith("./") || text.includes(`${uses} # v`);
				return PINNED.test(uses) && versioned ? [] : [`${name}: ${uses}`];
			});
		});
	expect(
		unpinned,
		"Name each action by its full commit SHA with the version in a comment: uses: owner/repo@<sha> # v1.2.3",
	).toEqual([]);
});
