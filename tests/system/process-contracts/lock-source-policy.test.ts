import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const { join } = path;
const repoRoot = path.resolve(import.meta.dir, "../../..");
const source = (sourcePath: string): string => readFileSync(sourcePath, "utf8");

test("one module owns lock paths and one application owns broadcasts", () => {
	const files: string[] = [];
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const sourcePath = join(directory, entry.name);
			if (entry.isDirectory()) {
				walk(sourcePath);
			} else if (entry.name.endsWith(".ts")) {
				files.push(sourcePath);
			}
		}
	};
	walk(join(repoRoot, "src"));
	expect(files.filter((sourcePath) => /['"`]locks['"`]/u.test(source(sourcePath)))).toEqual([
		join(repoRoot, "src/runtime/engine/lib/board-lock-state.ts"),
	]);
	expect(
		files.filter((sourcePath) => /type:\s*['"`]board_lock['"`]/u.test(source(sourcePath))),
	).toEqual([join(repoRoot, "src/server/canvas/lib/application.ts")]);
	expect(
		files.filter(
			(sourcePath) =>
				!sourcePath.includes("/tests/") &&
				sourcePath !== join(repoRoot, "src/runtime/engine/lib/board-lock-state.ts") &&
				source(sourcePath).includes("onBoardLockChanged("),
		),
	).toEqual([join(repoRoot, "src/server/canvas/lib/application.ts")]);
	expect(
		files.filter(
			(sourcePath) =>
				sourcePath !== join(repoRoot, "src/runtime/engine/lib/board-lock-state.ts") &&
				/VAULT_STATE_DIR[^\n]*lock/iu.test(source(sourcePath)),
		),
	).toEqual([]);
});
