// The working tree of a checkout as a commit, so that a footprint reads uncommitted changes with
// the same walk as committed ones (TASK-646.02).
//
// The commit holds every file that `git add --all` would stage: tracked changes, staged or not,
// deletions, and untracked files that no ignore rule hides. Its parent is HEAD. It is written with
// a copy of the index into an object directory of its own, which borrows the checkout's objects,
// and that directory is removed after the read. So the checkout gains no object, its index stays
// as it was, and a commit in it at the same time is not blocked.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitAnswer, gitText, type GitRunOptions } from "#runtime/history-lens/clients/git.ts";

/** Who the commit of the working tree is by: no one's configuration is needed to write it. */
const AUTHOR = {
	GIT_AUTHOR_NAME: "Archboard",
	GIT_AUTHOR_EMAIL: "archboard@localhost",
	GIT_COMMITTER_NAME: "Archboard",
	GIT_COMMITTER_EMAIL: "archboard@localhost",
};

/** The subject the commit of the working tree carries in an answer. */
const SUBJECT = "Uncommitted changes";

/**
 * Commit the working tree into objects of its own.
 * @param root The checkout.
 * @param head The checkout's HEAD.
 * @param scratch A directory the commit's index and objects can live in.
 * @param options The caller's signal.
 * @returns The commit, with the options that read it; HEAD itself when nothing is uncommitted.
 */
async function commitWorkingTree(
	root: string,
	head: string,
	scratch: string,
	options: GitRunOptions,
): Promise<{ commit: string; options: GitRunOptions }> {
	const [objects = "", index = ""] = (
		await gitText(
			root,
			["rev-parse", "--path-format=absolute", "--git-path", "objects", "--git-path", "index"],
			options,
		)
	).split("\n");
	const own = join(scratch, "objects");
	mkdirSync(own);
	// The copy keeps the checkout's staged changes and what it knows of each file, so only the files
	// that changed are read again.
	if (existsSync(index)) copyFileSync(index, join(scratch, "index"));
	const env = {
		GIT_INDEX_FILE: join(scratch, "index"),
		GIT_OBJECT_DIRECTORY: own,
		GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
	};
	const inTree = { ...options, env };
	await gitText(
		root,
		["-c", "core.fsmonitor=false", "-c", "core.splitIndex=false", "add", "--all", "--", ":/"],
		inTree,
	);
	const tree = (await gitText(root, ["write-tree"], inTree)).trim();
	if (tree === (await gitAnswer(root, ["rev-parse", `${head}^{tree}`], options))) {
		return { commit: head, options };
	}
	const commit = await gitText(
		root,
		["commit-tree", "--no-gpg-sign", "-p", head, "-m", SUBJECT, tree],
		{ ...options, env: { ...env, ...AUTHOR } },
	);
	return { commit: commit.trim(), options: inTree };
}

/**
 * Read a checkout up to its working tree.
 * @param root The checkout.
 * @param options The caller's signal.
 * @param read The reading, given the commit of the working tree, undefined when the checkout has no
 * commit, and the options that every Git command of the reading must run with.
 * @returns What the reading answers.
 */
async function withWorkingTree<Answer>(
	root: string,
	options: GitRunOptions,
	read: (commit: string | undefined, options: GitRunOptions) => Promise<Answer>,
): Promise<Answer> {
	const head = await gitAnswer(
		root,
		["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
		options,
	);
	if (head === undefined) return read(undefined, options);
	const scratch = mkdtempSync(join(tmpdir(), "archboard-working-tree-"));
	try {
		const tree = await commitWorkingTree(root, head, scratch, options);
		return await read(tree.commit, tree.options);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export { withWorkingTree };
