// A variable that archboard no longer reads is refused where it is set, so that an old shell
// profile, .envrc or .env never quietly addresses another vault or another server (ADR 0049,
// TASK-310). Every command refuses, the way a command line that is not understood does: exit
// status 2, nothing on stdout, nothing started, nothing written. Help is the one exception, so
// a person can read what to do.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { packageBin } from "./support/package-cli.ts";

let root = "";
let home = "";
let vault = "";

/**
 * Run the shipped bin in a directory of its own, with a registry and a home of its own.
 * @param args The command line.
 * @param environment What this invocation sets.
 * @param cwd Where it runs.
 * @returns How it exited and what it printed.
 */
function archboard(
	args: readonly string[],
	environment: Readonly<Record<string, string>>,
	cwd: string = vault,
) {
	const result = spawnSync(packageBin, [...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			ARCHBOARD_VAULT: undefined,
			EXPRESS_SERVER_URL: undefined,
			HOME: home,
			XDG_STATE_HOME: join(root, "state"),
			ARCHBOARD_REPOS: join(root, "repos.json"),
			ARCHBOARD_NO_AUTOSTART: "1",
			...environment,
		},
	});
	const failure = `${args.join(" ")} in ${cwd}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr, failure };
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-removed-environment-"));
	home = join(root, "home");
	mkdirSync(home);
	vault = join(root, "holder");
	mkdirSync(join(vault, ".archboard", "vault"), { recursive: true });
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

test("a set ARCHBOARD_VAULT refuses the command, and the refusal names the working directory, -C and the layout", () => {
	const other = join(root, "elsewhere");
	for (const args of [
		["model", "read"],
		["repo", "list"],
		["model", "read", "-C", vault],
		["status"],
	]) {
		const refused = archboard(args, { ARCHBOARD_VAULT: other });
		expect(refused.status, refused.failure).toBe(2);
		expect(refused.stdout, refused.failure).toBe("");
		// The three things a person needs to do next, by their names and not by their wording.
		for (const token of ["ARCHBOARD_VAULT", "-C", ".archboard/vault"]) {
			expect(refused.stderr, refused.failure).toContain(token);
		}
	}
	// It refused before it found, registered or created anything.
	expect(existsSync(join(root, "repos.json"))).toBe(false);
	expect(existsSync(other)).toBe(false);
});

test("a set ARCHBOARD_VAULT is refused when it comes from a .env file, and an empty one too", () => {
	const dotenv = join(root, "dotenv");
	mkdirSync(join(dotenv, ".archboard", "vault"), { recursive: true });
	writeFileSync(join(dotenv, ".env"), `ARCHBOARD_VAULT=${join(root, "elsewhere")}\n`);
	const refused = archboard(["model", "read"], {}, dotenv);
	expect(refused.status, refused.failure).toBe(2);
	expect(refused.stdout, refused.failure).toBe("");

	const emptied = archboard(["model", "read"], { ARCHBOARD_VAULT: "" });
	expect(emptied.status, emptied.failure).toBe(2);
});

test("the removed server URL name is refused the same way, and help is never refused", () => {
	const renamed = archboard(["model", "read"], { EXPRESS_SERVER_URL: "http://127.0.0.1:9" });
	expect(renamed.status, renamed.failure).toBe(2);
	expect(renamed.stderr, renamed.failure).toContain("ARCHBOARD_URL");

	const help = archboard(["model", "--help"], { ARCHBOARD_VAULT: join(root, "elsewhere") });
	expect(help.status, help.failure).toBe(0);
});
