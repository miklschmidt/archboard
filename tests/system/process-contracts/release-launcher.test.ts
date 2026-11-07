// The launcher of the `archboard` and `@archboard/cli` packages (ADR 0076) finds the platform
// package in the layouts that npm and `bun add -g` make, starts its executable with every argument
// and passes its exit status through, and refuses when no platform package is installed.
import { afterAll, expect, test } from "bun:test";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../../..");
const launcher = path.join(root, "scripts", "release", "launcher.sh");
const platform = `${process.platform}-${process.arch}`;
const RELEASED = new Set(["linux-x64", "linux-arm64", "darwin-arm64"]);
const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "archboard-launcher-")));

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Put an executable file in place.
 * @param file Where it goes.
 * @param text What it holds.
 */
function executable(file: string, text: string): void {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, text);
	chmodSync(file, 0o755);
}

/**
 * Install a launcher at a package directory, and link a PATH entry to it.
 * @param base The root of the layout.
 * @param packageDirectory The launcher package, relative to the base.
 * @returns The PATH entry.
 */
function installLauncher(base: string, packageDirectory: string): string {
	const bin = path.join(base, packageDirectory, "bin", "archboard");
	mkdirSync(path.dirname(bin), { recursive: true });
	copyFileSync(launcher, bin);
	chmodSync(bin, 0o755);
	const entry = path.join(base, "bin", "archboard");
	mkdirSync(path.dirname(entry), { recursive: true });
	symlinkSync(path.relative(path.dirname(entry), bin), entry);
	return entry;
}

/**
 * A platform package whose executable prints its arguments and exits with status 7.
 * @param modules The node_modules directory that holds it.
 */
function installPlatform(modules: string): void {
	executable(
		path.join(modules, "@archboard", `cli-${platform}`, "bin", "archboard"),
		'#!/bin/sh\nprintf "%s\\n" "$@"\nexit 7\n',
	);
}

/**
 * Run a PATH entry with two arguments, one with a space.
 * @param entry The PATH entry.
 * @returns Its exit status, standard output and standard error.
 */
function launch(entry: string): { exitCode: number; stdout: string; stderr: string } {
	const result = Bun.spawnSync([entry, "start", "two words"], { stdout: "pipe", stderr: "pipe" });
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

test.skipIf(!RELEASED.has(platform))(
	"the launcher starts the platform package that npm nests inside it",
	() => {
		const base = path.join(scratch, "npm");
		const entry = installLauncher(base, "lib/node_modules/archboard");
		installPlatform(path.join(base, "lib/node_modules/archboard/node_modules"));
		expect(launch(entry)).toMatchObject({ exitCode: 7, stdout: "start\ntwo words\n" });
	},
);

test.skipIf(!RELEASED.has(platform))(
	"the scoped launcher starts the platform package that bun add -g hoists beside it",
	() => {
		const base = path.join(scratch, "bun");
		const entry = installLauncher(base, "install/global/node_modules/@archboard/cli");
		installPlatform(path.join(base, "install/global/node_modules"));
		expect(launch(entry)).toMatchObject({ exitCode: 7, stdout: "start\ntwo words\n" });
	},
);

test("the launcher refuses when no platform package is installed", () => {
	const entry = installLauncher(path.join(scratch, "missing"), "lib/node_modules/archboard");
	const result = launch(entry);
	expect(result.exitCode).toBe(1);
	expect(result.stdout).toBe("");
	expect(result.stderr).not.toBe("");
});
