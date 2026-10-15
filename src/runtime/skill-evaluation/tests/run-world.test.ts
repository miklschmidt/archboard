// An author works in a world of its own, and the harness's records of the run
// are not in it. Reads cannot be forbidden — a workspace-write sandbox
// restricts writes, not reads — so the board snapshot the checks diff against,
// the author's own transcript, the verdicts, the bundle the grader reads and
// the private CODEX_HOME with the operator's credentials sit outside the one
// directory the author is given. The 2026-09-17 batch showed why: one run read
// the snapshot instead of asking the CLI, another searched its own transcript.

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	authorConfigToml,
	prepareRunDirectory,
	runEnvironment,
} from "@/runtime/skill-evaluation/index";

/**
 * Whether a path is the directory or something under it.
 * @param directory The containing directory.
 * @param target The path to place.
 * @returns True when target is inside directory.
 */
function inside(directory: string, target: string): boolean {
	const relative = path.relative(directory, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * One prepared run, removed with its directory afterwards.
 * @param use What to do with it.
 */
function withRun(use: (paths: ReturnType<typeof prepareRunDirectory>) => void): void {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-world-"));
	try {
		use(prepareRunDirectory(path.join(root, "1")));
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

test("what the author is given is in its world; what the harness keeps of the run is not", () => {
	withRun((paths) => {
		for (const authored of [
			paths.flask,
			paths.vault,
			paths.home,
			paths.bin,
			paths.repos,
			paths.temporary,
			paths.xdgState,
			paths.xdgConfig,
			// The CLI refuses to run when it cannot write the log it is given.
			paths.cliLog,
		]) {
			expect(inside(paths.world, authored), authored).toBe(true);
		}
		for (const kept of [
			paths.snapshot,
			paths.authorEvents,
			paths.authorStdout,
			paths.authorStderr,
			paths.lastMessage,
			paths.boards,
			paths.renders,
			paths.captures,
			paths.manifest,
			paths.codexHome,
			paths.serverLog,
		]) {
			expect(inside(paths.world, kept), kept).toBe(false);
			expect(inside(paths.root, kept), kept).toBe(true);
		}
		// The world is laid before the author starts; the records are not in it.
		expect(fs.existsSync(paths.world)).toBe(true);
	});
});

test("the run's vault is the .archboard/vault of its checkout, made after the clone", () => {
	withRun((paths) => {
		expect(paths.vault).toBe(path.join(paths.flask, ".archboard", "vault"));
		// The clone refuses a destination that holds anything, so nothing is laid there first.
		expect(fs.existsSync(paths.flask)).toBe(false);
	});
});

/**
 * The vault the CLI's finder addresses from each directory, run in a process
 * of its own with the run's environment, as an author's command would be.
 * @param environment The run's environment.
 * @param directories Where the command runs.
 * @returns The vault each one addresses, or the refusal's code.
 */
function vaultsFoundFrom(
	environment: Record<string, string>,
	directories: readonly string[],
): string[] {
	const finder = path.resolve(import.meta.dir, "../../engine/vault-finder.ts");
	const script = `const { findVault } = await import(${JSON.stringify(finder)});
for (const cwd of process.argv.slice(1)) {
	const found = await findVault({ directory: null, environment: undefined, cwd });
	console.log(found.ok ? found.found.path : found.code);
}`;
	const result = Bun.spawnSync([process.execPath, "-e", script, ...directories], {
		env: environment,
	});
	return result.stdout.toString().trim().split("\n");
}

test("a command anywhere in the world addresses the run's vault, never one the batch sits under", () => {
	// Batches sit in the archboard checkout, whose own vault is a git checkout's vault above the world.
	const above = fs.mkdtempSync(path.join(os.tmpdir(), "run-world-above-"));
	try {
		Bun.spawnSync(["git", "init", "-q", above]);
		fs.mkdirSync(path.join(above, ".archboard", "vault"), { recursive: true });
		const paths = prepareRunDirectory(path.join(above, ".skill-evals", "batch", "1"));
		Bun.spawnSync(["git", "init", "-q", paths.flask]);
		fs.mkdirSync(paths.vault, { recursive: true });
		const source = path.join(paths.flask, "src");
		fs.mkdirSync(source);
		const vault = fs.realpathSync(paths.vault);
		expect(
			vaultsFoundFrom(runEnvironment(paths, "http://127.0.0.1:1"), [
				source,
				paths.home,
				paths.temporary,
				paths.world,
			]),
		).toEqual([vault, vault, vault, vault]);
	} finally {
		fs.rmSync(above, { recursive: true, force: true });
	}
});

test("the author's sandbox may write its world and nothing above it", () => {
	withRun((paths) => {
		const config = authorConfigToml(
			{ model: "m", reasoningEffort: "high", sandbox: "workspace-write" },
			paths,
		);
		expect(config).toContain(`writable_roots = [${JSON.stringify(paths.world)}]`);
		expect(config).not.toContain(`writable_roots = [${JSON.stringify(paths.root)}]`);
	});
});

test("every place the author's own tools write is inside its world", () => {
	withRun((paths) => {
		const environment = runEnvironment(paths, "http://127.0.0.1:1");
		for (const name of ["HOME", "XDG_STATE_HOME", "XDG_CONFIG_HOME", "TMPDIR"] as const) {
			expect(inside(paths.world, environment[name] ?? ""), name).toBe(true);
		}
		for (const name of ["ARCHBOARD_REPOS", "LOG_FILE_PATH"] as const) {
			expect(inside(paths.world, environment[name] ?? ""), name).toBe(true);
		}
		// A command finds the vault from the checkout it runs in, never from the environment.
		expect(environment).not.toHaveProperty("ARCHBOARD_VAULT");
		expect(inside(paths.world, environment["CODEX_HOME"] ?? "")).toBe(false);
	});
});
