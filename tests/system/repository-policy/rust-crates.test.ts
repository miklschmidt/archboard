// The shape rules of the Rust crates that clippy cannot hold (TASK-520.09,
// docs/agents/strict-analysis-rust.md): every crate inherits the workspace lint policy, and
// every source file keeps the TypeScript's 600-line cap.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The cap of `max-lines` in .oxlintrc.jsonc, which counts blank lines and comments. */
const MAX_LINES = 600;

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

/**
 * How many lines `max-lines` counts in a file: every line, a final newline ending the last.
 * @param text The file's text.
 * @returns The line count.
 */
function lineCount(text: string): number {
	const lines = text.split("\n");
	return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

describe("the Rust crates", () => {
	test("every crate manifest inherits the workspace lint policy", () => {
		const manifests = gitFiles("crates/*/Cargo.toml");
		expect(manifests.length).toBeGreaterThan(0);
		const skipping = manifests.filter((manifest) => {
			const parsed = Bun.TOML.parse(fs.readFileSync(path.join(repoRoot, manifest), "utf8")) as {
				lints?: { workspace?: unknown };
			};
			return parsed.lints?.workspace !== true;
		});
		expect(skipping).toEqual([]);
	});

	test(`no Rust source file is longer than ${MAX_LINES} lines`, () => {
		const sources = gitFiles("crates/*.rs");
		expect(sources.length).toBeGreaterThan(0);
		const long = sources
			.map((source) => ({
				source,
				lines: lineCount(fs.readFileSync(path.join(repoRoot, source), "utf8")),
			}))
			.filter(({ lines }) => lines > MAX_LINES);
		expect(long).toEqual([]);
	});
});
