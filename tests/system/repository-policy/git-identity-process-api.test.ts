import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");

test("Git identity never blocks Bun's child-process supervisor", () => {
	const source = readFileSync(join(ROOT, "src/runtime/engine/git.ts"), "utf8");
	for (const forbidden of [
		"execFileSync",
		"execSync",
		"spawnSync",
		"sleepSync",
		"Atomics.wait",
		"while (child.exitCode",
	]) {
		expect(source, `${forbidden} blocks or polls child completion`).not.toContain(forbidden);
	}
	expect(source).toContain("child.exited");
	expect(source).toContain("Promise.all([child.exited, stdout, stderr])");
});
