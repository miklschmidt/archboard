import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git } from "../git.js";

test("Git commands settle asynchronously for success, failure, output limits, and timeout", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-async-"));
	try {
		expect(await git(root, ["init", "-q"])).toBeUndefined();
		expect(await git(root, ["rev-parse", "--show-toplevel"])).toBe(root);
		await expect(git(root, ["cat-file", "-e", "missing^{commit}"])).rejects.toMatchObject({
			failure: "exit",
		});
		await expect(
			git(root, ["-c", "alias.archboard-output=!yes x | head -c 70000", "archboard-output"]),
		).rejects.toMatchObject({ failure: "output" });
		const started = performance.now();
		await expect(
			git(root, ["-c", "alias.archboard-wait=!sleep 60", "archboard-wait"], { timeoutMs: 50 }),
		).rejects.toEqual(expect.objectContaining({ failure: "timeout" }));
		expect(performance.now() - started).toBeLessThan(2_000);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
