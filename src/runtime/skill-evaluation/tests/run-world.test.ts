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
			paths.canvasLog,
		]) {
			expect(inside(paths.world, kept), kept).toBe(false);
			expect(inside(paths.root, kept), kept).toBe(true);
		}
		// The world is laid before the author starts; the records are not in it.
		expect(fs.existsSync(paths.world)).toBe(true);
		expect(fs.existsSync(paths.vault)).toBe(true);
	});
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
		for (const name of ["ARCHBOARD_VAULT", "ARCHBOARD_REPOS", "LOG_FILE_PATH"] as const) {
			expect(inside(paths.world, environment[name] ?? ""), name).toBe(true);
		}
		expect(inside(paths.world, environment["CODEX_HOME"] ?? "")).toBe(false);
	});
});
