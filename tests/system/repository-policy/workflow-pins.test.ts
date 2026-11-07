// Every action that a GitHub workflow uses runs at one commit. A tag can move, so a workflow
// names each external action by its full commit SHA, with the version in a comment beside it.
// A reusable workflow of this repository (`./.github/...`) runs at the caller's commit already.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const workflows = path.join(repoRoot, ".github", "workflows");

/** `uses: owner/repo[/path]@<40 hex> # <version>` or a local `./` path. */
const PINNED = /^(\.\/\S+|[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\S+)$/;

test("every action in a workflow is pinned to a commit SHA", () => {
	const unpinned = fs
		.readdirSync(workflows)
		.filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
		.flatMap((name) =>
			fs
				.readFileSync(path.join(workflows, name), "utf8")
				.split("\n")
				.flatMap((line, index) => {
					const uses = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/.exec(line)?.[1];
					return uses === undefined || PINNED.test(uses) ? [] : [`${name}:${index + 1}: ${uses}`];
				}),
		);
	expect(
		unpinned,
		"Name each action by its full commit SHA with the version in a comment: uses: owner/repo@<sha> # v1.2.3",
	).toEqual([]);
});
