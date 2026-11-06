// The configs name repository files by path. A source move that leaves a path behind fails
// nowhere else: a stale `--path-ignore-patterns` puts a capacity, benchmark or solo test into a
// normal lane, a stale lane path runs nothing, and a stale exemption keeps a list that is no longer
// exact. So every path a config names must exist.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import viteConfig from "../../../vite.config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** A word of a command that names a repository path: a workspace, a test owner or a script. */
const REPOSITORY_PATH = /^(?:packages|apps|tests|scripts|tools)(?:\/|$)/u;

/** A pattern names a set of files, not one path. */
const GLOB = /[*?[{]/u;

/**
 * The paths that one task's command names.
 * @param command The task's command, one line or several.
 * @returns The words that name repository paths, globs left out.
 */
function commandPaths(command: unknown): string[] {
	const lines = Array.isArray(command) ? command : [command];
	return lines
		.filter((line): line is string => typeof line === "string")
		.flatMap((line) => line.split(/\s+/u))
		.filter((word) => REPOSITORY_PATH.test(word) && !GLOB.test(word));
}

/**
 * The single files that the overrides of an Oxlint config name.
 * @param name The config, relative to the repository root.
 * @returns The override entries that are no glob.
 */
function overrideFiles(name: string): string[] {
	const config = Bun.JSONC.parse(fs.readFileSync(path.join(repoRoot, name), "utf8")) as {
		overrides?: { files?: string[] }[];
	};
	return (config.overrides ?? [])
		.flatMap((override) => override.files ?? [])
		.filter((file) => !GLOB.test(file));
}

/**
 * The paths of a list that name nothing in the checkout.
 * @param paths Repository paths.
 * @returns The missing ones.
 */
function missing(paths: readonly string[]): string[] {
	return paths.filter((file) => !fs.existsSync(path.join(repoRoot, file)));
}

describe("the configs name only paths that exist", () => {
	test("every path a Vite+ task names, in its lanes and its ignore patterns", () => {
		const named = Object.values(viteConfig.run?.tasks ?? {}).flatMap((task) =>
			commandPaths(typeof task === "object" && "command" in task ? task.command : task),
		);
		expect(named.length).toBeGreaterThan(0);
		expect(missing(named)).toEqual([]);
	});

	test.each([".oxlintrc.jsonc", ".oxlintrc.tests.jsonc"])(
		"every single file an override of %s names",
		(name) => {
			expect(missing(overrideFiles(name))).toEqual([]);
		},
	);
});
