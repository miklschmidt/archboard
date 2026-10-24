// Opening the code of a part on a board of a worktree's vault (ADR 0049,
// TASK-472.03): a binding into the vault's own repository opens the file in
// the worktree that holds the vault, though the registry chose another
// checkout of that repository.

import { expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { boundBoard } from "./support/bound-board.ts";
import {
	createOpenerFixture,
	jsonBody,
	type OpenerFixtureOptions,
} from "./support/opener-fixture.ts";

test("opens the file of the worktree whose vault holds the board, though the main checkout is the chosen one", async () => {
	await using resources = new AsyncDisposableStack();
	const options: OpenerFixtureOptions = { defaultDependencies: true };
	const fixture = await createOpenerFixture(options);
	resources.defer(() => fixture.dispose());
	const invocation = fixture.invocation("immediate");
	resources.defer(() => invocation.releaseAndWait());
	const worktree = join(fixture.root, "worktree");
	for (const args of [
		["add", "-A"],
		["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "first"],
		["worktree", "add", "-q", "-b", "feature", worktree],
	]) {
		const result = Bun.spawnSync(["git", ...args], {
			cwd: fixture.checkout,
			env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
		});
		expect(result.exitCode, result.stderr.toString()).toBe(0);
	}
	// The registered checkout is the chosen one, and lacks the file that the worktree adds.
	writeFileSync(join(worktree, "src", "worktree-only.ts"), "export {};\n");
	const vault = join(worktree, ".archboard", "vault");
	options.vault = vault;
	const board = await boundBoard(vault, fixture.repository, "src/worktree-only.ts");
	const saved = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(saved.status).toBe(200);

	const result = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ board: board.key, element: board.node }),
	});
	expect(result.status).toBe(200);
	expect(await invocation.waitForCapture()).toMatchObject({
		target: join(realpathSync.native(worktree), "src/worktree-only.ts"),
	});
});
