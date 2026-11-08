// Helpers for the tests of the GitHub actions: a scratch directory with a stand-in `archboard`
// program that prints canned answers, and a way to run an action's entry the way a runner does.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtures = join(import.meta.dir, "fixtures");

/**
 * A fixture's text, with `__NAME__` placeholders filled in.
 * @param name The fixture's file name.
 * @param values The placeholders and what they stand for.
 * @returns The text.
 */
function fixture(name: string, values: Readonly<Record<string, string>> = {}): string {
	return Object.entries(values).reduce(
		(text, [key, value]) => text.replaceAll(`__${key}__`, value),
		readFileSync(join(fixtures, name), "utf8"),
	);
}

/**
 * Make a scratch directory.
 * @returns Its path.
 */
function scratch(): string {
	return mkdtempSync(join(tmpdir(), "archboard-action-test-"));
}

/**
 * Write a stand-in for the `archboard` program. It answers from files in a directory it is told
 * about by FAKE_DIR, and exits as FAKE_EXIT says for `check`.
 * @param directory Where to write it.
 * @returns The program's path.
 */
function writeStandIn(directory: string): string {
	const program = join(directory, "archboard");
	writeFileSync(
		program,
		`#!/bin/sh
dir=""
if [ "$1" = "-C" ]; then dir="$2"; shift 2; fi
case "$1" in
	repo)
		if [ "$2" = list ]; then cat "$FAKE_DIR/repos.json"; fi ;;
	stop) ;;
	check)
		cat "$FAKE_DIR/check.json"
		echo "stand-in diagnostics" >&2
		exit "\${FAKE_EXIT:-0}" ;;
	model)
		case "$2" in
			proposals) sed "s#__HEADDIR__#$dir#" "$FAKE_DIR/proposals.json" ;;
			compare) cat "$FAKE_DIR/compare.json" ;;
			footprint) cat "$FAKE_DIR/footprint.json" ;;
			render)
				while [ $# -gt 0 ]; do
					if [ "$1" = "--out" ]; then echo "<svg/>" > "$2"; fi
					shift
				done ;;
		esac ;;
esac
`,
	);
	chmodSync(program, 0o755);
	return program;
}

/**
 * The program that runs an action's entry. A runner runs it with Node 22.18 or later, which strips
 * the types itself, so the test does too when this machine has such a Node. Bun runs it otherwise.
 * @returns The program's path.
 */
function runtime(): string {
	const node = Bun.which("node");
	if (node === null) return process.execPath;
	const [major = 0, minor = 0] = Bun.spawnSync([node, "--version"])
		.stdout.toString()
		.trim()
		.slice(1)
		.split(".")
		.map(Number);
	return major > 22 || (major === 22 && minor >= 18) ? node : process.execPath;
}

/**
 * Run an action's entry with a runner's environment.
 * @param entry The entry's path.
 * @param env The environment to add.
 * @returns The exit status and the standard output.
 */
function runEntry(
	entry: string,
	env: Readonly<Record<string, string>>,
): { exitCode: number; stdout: string } {
	const result = Bun.spawnSync([runtime(), entry], {
		env: { PATH: process.env["PATH"] ?? "", HOME: scratch(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

/**
 * Run an action's entry without blocking this process, so a stand-in server in it can answer.
 * @param entry The entry's path.
 * @param env The environment to add.
 * @returns The exit status and the standard output.
 */
async function runEntryAsync(
	entry: string,
	env: Readonly<Record<string, string>>,
): Promise<{ exitCode: number; stdout: string }> {
	const child = Bun.spawn([runtime(), entry], {
		env: { PATH: process.env["PATH"] ?? "", HOME: scratch(), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	return { exitCode, stdout };
}

export { fixture, mkdirSync, runEntry, runEntryAsync, scratch, writeStandIn };
