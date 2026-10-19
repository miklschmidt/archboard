// The end state of the workspace migration (TASK-500): all source lives in packages/* and
// apps/*, and the old roots and the @/ alias are gone. Each check catches a legacy path coming
// back that lint cannot see, because lint only reads the folders it is given.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Read a JSON file that may carry comments and trailing commas.
 * @param name The file, relative to the repository root.
 * @returns The parsed value.
 */
function readJsonc(name: string): Record<string, unknown> {
	return Bun.JSONC.parse(fs.readFileSync(path.join(repoRoot, name), "utf8")) as Record<
		string,
		unknown
	>;
}

/**
 * The files git knows under some paths, tracked or not yet added, ignored files left out.
 * @param paths The pathspecs.
 * @returns The repository paths.
 */
function gitFiles(...paths: string[]): string[] {
	const result = Bun.spawnSync({
		cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...paths],
		cwd: repoRoot,
	});
	expect(result.exitCode).toBe(0);
	return result.stdout.toString().split("\0").filter(Boolean);
}

describe("the workspace layout", () => {
	test("no file lives in the retired roots src/ and frontend/", () => {
		expect(gitFiles("src", "frontend")).toEqual([]);
	});

	test("the root package.json lists the workspaces and maps no # imports", () => {
		const manifest = readJsonc("package.json");
		expect(manifest["workspaces"]).toEqual(["packages/*", "apps/*"]);
		expect(manifest).not.toHaveProperty("imports");
	});

	test.each(["tsconfig.json", "tsconfig.frontend.json", "components.json"])(
		"%s keeps no @/ alias",
		(name) => {
			expect(JSON.stringify(readJsonc(name))).not.toContain('"@/');
		},
	);
});
