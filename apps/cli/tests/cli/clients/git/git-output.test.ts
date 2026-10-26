// A Git reading reads the repository of the directory it runs in. A check that
// a Git hook runs inherits GIT_DIR and GIT_WORK_TREE for the hook's
// repository, and a reading must not follow them there.

import { afterAll, afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitOutput } from "#cli/clients/git/git-output.ts";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-git-output-")));
afterEach(() => {
	delete process.env["GIT_DIR"];
	delete process.env["GIT_WORK_TREE"];
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/**
 * A new repository below the test's directory.
 * @param name Its directory name.
 * @returns Its root.
 */
function repository(name: string): string {
	const dir = path.join(root, name);
	fs.mkdirSync(dir);
	expect(spawnSync("git", ["init", "-q"], { cwd: dir }).status).toBe(0);
	return dir;
}

test("a reading ignores the repository that GIT_DIR and GIT_WORK_TREE name", async () => {
	const own = repository("own");
	const hooked = repository("hooked");
	process.env["GIT_DIR"] = path.join(hooked, ".git");
	process.env["GIT_WORK_TREE"] = hooked;
	const top = await gitOutput(own, ["rev-parse", "--show-toplevel"], AbortSignal.timeout(10_000));
	expect(top?.toString().trim()).toBe(own);
});
