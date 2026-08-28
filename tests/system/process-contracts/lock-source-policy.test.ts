import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const source = (path: string) => readFileSync(path, "utf8");

test("one module owns lock paths and one application owns broadcasts", () => {
	const files: string[] = [];
	const walk = (directory: string) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name.endsWith(".ts")) files.push(path);
		}
	};
	walk(join(repoRoot, "src"));
	expect(files.filter((path) => /['"`]locks['"`]/.test(source(path)))).toEqual([
		join(repoRoot, "src/runtime/engine/board-lock.ts"),
	]);
	expect(files.filter((path) => /type:\s*['"`]board_lock['"`]/.test(source(path)))).toEqual([
		join(repoRoot, "src/server/canvas/lib/application.ts"),
	]);
	expect(
		files.filter(
			(path) =>
				!path.includes("/tests/") &&
				path !== join(repoRoot, "src/runtime/engine/board-lock.ts") &&
				/onBoardLockChanged\(/.test(source(path)),
		),
	).toEqual([join(repoRoot, "src/server/canvas/lib/application.ts")]);
	expect(
		files.filter(
			(path) =>
				path !== join(repoRoot, "src/runtime/engine/board-lock.ts") &&
				/VAULT_STATE_DIR[^\n]*lock/i.test(source(path)),
		),
	).toEqual([]);
});
