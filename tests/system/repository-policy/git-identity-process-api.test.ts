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
		"Bun.sleep",
		".unref(",
		"setInterval(",
		"void Bun.spawn",
		"void child.exited",
		"while (child.exitCode",
		"while (child.signalCode",
	]) {
		expect(source, `${forbidden} blocks, polls, or detaches child ownership`).not.toContain(
			forbidden,
		);
	}
});
