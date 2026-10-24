// The commit that removed a board from its vault (ADR 0057), for the histories
// the embeds system test does not make: a board whose file a commit gave to
// the board that took its name, a board renamed before it was deleted, and a
// board deleted by nobody's commit yet.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removingCommit } from "#cli/operations/vault/embeds/vault-history.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-vault-history-"));
const vault = path.join(root, ".archboard", "vault");
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** A Git command in the repository, committing as a test author. */
function git(...args: string[]): string {
	const run = spawnSync(
		"git",
		["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
		{ cwd: root, encoding: "utf8" },
	);
	expect(run.status, run.stderr).toBe(0);
	return run.stdout.trim();
}

/** Write a board file and commit everything. */
function commit(subject: string, boards: Record<string, string | null>): string {
	for (const [name, id] of Object.entries(boards)) {
		const file = path.join(vault, `${name}.semantic.json`);
		if (id === null) fs.rmSync(file);
		else
			fs.writeFileSync(
				file,
				`${JSON.stringify({ id, name, description: subject, nodes: [] }, null, "\t")}\n`,
			);
	}
	git("add", "-A");
	git("commit", "-qm", subject);
	return git("rev-parse", "HEAD");
}

test("names the commit that gave a board's file to another board or deleted it after a rename, and no commit for a deletion nobody committed", async () => {
	fs.mkdirSync(vault, { recursive: true });
	git("init", "-q");
	commit("add the boards", { queue: "q1", ledger: "l1", notes: "n1" });
	commit("edit the notes", { notes: "n1" });
	const replaced = commit("draw the queue again", { queue: "q2" });
	commit("rename the ledger", { ledger: null, books: "l1" });
	const deleted = commit("remove the books", { books: null });
	fs.rmSync(path.join(vault, "notes.semantic.json"));
	const signal = AbortSignal.timeout(10_000);
	expect(await removingCommit(vault, { id: "q1", name: "queue" }, signal)).toEqual({
		commit: replaced,
		subject: "draw the queue again",
	});
	expect((await removingCommit(vault, { id: "l1", name: "ledger" }, signal))?.commit).toBe(deleted);
	expect(await removingCommit(vault, { id: "n1", name: "notes" }, signal)).toBeUndefined();
});
