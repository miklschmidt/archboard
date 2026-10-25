// The tools the README kit runs on. Each comes from the environment, with a stated default:
//
// - ARCHBOARD_README_SCRATCH: where takes, frames and copies of vaults go; by default
//   `archboard-readme-assets` in the operating system's temporary directory.
// - ARCHBOARD_FFMPEG: the ffmpeg that encodes, as `semantic record` finds it: else ffmpeg on PATH,
//   else nixpkgs' through Nix. The clips need its libwebp_anim and libwebp encoders.
// - ARCHBOARD_RENDERER_CHROMIUM: the Chromium the takes are filmed in, as the renderer finds it:
//   else chromium or google-chrome on PATH, or the macOS application.
// - ARCHBOARD_PYFTSUBSET: fontTools' pyftsubset, which cuts each SVG's embedded faces down to the
//   characters it draws: else pyftsubset on PATH, else nixpkgs' fonttools through Nix.
// - Codex is the version package.json pins, never one on PATH.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveCodexExecutable } from "@archboard/codex-app-server/process";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { discoveredChromiumPath } from "@archboard/renderer/headless-chromium";
import { findFfmpeg } from "@archboard/walkthrough/ffmpeg";

/** The repository root. */
const ROOT = resolve(import.meta.dir, "../..");

/** How Nix is told to run a package's program, as the recorder runs ffmpeg. */
const NIX_SHELL = ["nix", "--extra-experimental-features", "nix-command flakes", "shell"] as const;

/** What a finished command printed, and how it ended. */
interface Ran {
	readonly stdout: string;
	readonly stderr: string;
	readonly status: number;
}

/** Where a command runs, and what it reads. */
interface RunOptions {
	/** Its working directory; the repository root when absent. */
	readonly cwd?: string;
	/** Variables added to this process's environment. */
	readonly env?: Readonly<Record<string, string>>;
	/** What it reads on standard input. */
	readonly stdin?: string;
}

/**
 * Run a command to its end, whatever its exit status.
 * @param argv The command line.
 * @param options Where it runs, and what it reads.
 * @returns What it printed, and its exit status.
 */
async function attempt(argv: readonly string[], options: RunOptions = {}): Promise<Ran> {
	const child = Bun.spawn([...argv], {
		cwd: options.cwd ?? ROOT,
		env: { ...process.env, ...options.env },
		stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, status] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, status };
}

/**
 * Run a command to its end, and refuse one that fails.
 * @param argv The command line.
 * @param options Where it runs, and what it reads.
 * @returns What it printed.
 * @throws {Error} When it exits non-zero; the message carries what it said.
 */
async function run(argv: readonly string[], options: RunOptions = {}): Promise<Ran> {
	const ran = await attempt(argv, options);
	if (ran.status !== 0) {
		throw new Error(
			`${argv.join(" ")} exited ${ran.status}:\n${ran.stderr.trim() || ran.stdout.trim()}`,
		);
	}
	return ran;
}

/**
 * Run a step for each item, one after another, and collect what each step returned. Every
 * sequence in the kit goes through here: each step acts on what the one before left (a page, a
 * board's version, the machine kept quiet for a take), so the steps never overlap.
 * @param items The items, in order.
 * @param step What is done with one item and its place.
 * @returns What each step returned, in order.
 */
async function inOrder<Item, Result>(
	items: Iterable<Item>,
	step: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
	const results: Result[] = [];
	for (const [index, item] of [...items].entries()) {
		// oxlint-disable-next-line no-await-in-loop -- the kit's one sequence: each step starts once the one before has finished
		results.push(await step(item, index));
	}
	return results;
}

/**
 * The scratch directory, made when absent.
 * @param parts A directory inside it.
 * @returns Its path.
 */
function scratch(...parts: readonly string[]): string {
	const directory = join(scratchRoot(), ...parts);
	mkdirSync(directory, { recursive: true });
	return directory;
}

/**
 * Where the scratch directory is, made or not.
 * @returns Its path.
 */
function scratchRoot(): string {
	return process.env["ARCHBOARD_README_SCRATCH"] || join(tmpdir(), "archboard-readme-assets");
}

/**
 * The ffmpeg command line, found as `semantic record` finds it.
 * @returns The command line; append ffmpeg's own arguments.
 */
function ffmpegCommand(): readonly string[] {
	return findFfmpeg({ env: process.env, which: Bun.which }).argv;
}

/**
 * Prove the ffmpeg has the encoders the kit writes WebP and H.264 with.
 * @param needed The encoders.
 * @throws {Error} When one is missing.
 */
async function requireEncoders(needed: readonly string[]): Promise<void> {
	const { stdout } = await run([...ffmpegCommand(), "-hide_banner", "-encoders"]);
	const offered = new Set(
		stdout.split("\n").flatMap((line) => /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line)?.[1] ?? []),
	);
	const missing = needed.filter((name) => !offered.has(name));
	if (missing.length > 0) {
		throw new Error(
			`${ffmpegCommand().join(" ")} lacks the ${missing.join(" and ")} encoder. Name an ffmpeg built with libwebp and libx264 in ARCHBOARD_FFMPEG.`,
		);
	}
}

/**
 * Run ffmpeg quietly, overwriting its output.
 * @param args ffmpeg's arguments.
 */
async function ffmpeg(args: readonly string[]): Promise<void> {
	await run([...ffmpegCommand(), "-hide_banner", "-loglevel", "error", "-y", ...args]);
}

/**
 * The Chromium the takes are filmed in.
 * @returns Its executable.
 * @throws {Error} When there is none.
 */
function chromiumPath(): string {
	const found = discoveredChromiumPath();
	if (found === "") {
		throw new Error(
			"No Chromium or Google Chrome was found. Install one, or name it with ARCHBOARD_RENDERER_CHROMIUM.",
		);
	}
	return found;
}

/**
 * The pyftsubset command line.
 * @returns The command line; append pyftsubset's own arguments.
 * @throws {Error} When there is neither pyftsubset nor Nix.
 */
function pyftsubsetCommand(): readonly string[] {
	const named = process.env["ARCHBOARD_PYFTSUBSET"];
	if (named !== undefined && named !== "") return [named];
	const onPath = Bun.which("pyftsubset");
	if (onPath !== null) return [onPath];
	if (Bun.which("nix") !== null) {
		return [...NIX_SHELL, "nixpkgs#python3Packages.fonttools", "-c", "pyftsubset"];
	}
	throw new Error(
		"The SVGs need fontTools' pyftsubset. Install fonttools, or name pyftsubset with ARCHBOARD_PYFTSUBSET.",
	);
}

/**
 * One tool's line, or why it is missing.
 * @param name The tool.
 * @param find Finds it.
 * @returns The line.
 */
function toolLine(name: string, find: () => string): string {
	try {
		return `${name}: ${find()}`;
	} catch (error) {
		return `${name}: missing. ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Say where each tool comes from. Only Codex runs, to report its version.
 * @returns One line per tool.
 */
function toolLines(): readonly string[] {
	return [
		toolLine("scratch", scratchRoot),
		toolLine("chromium", chromiumPath),
		toolLine("ffmpeg", () => ffmpegCommand().join(" ")),
		toolLine("pyftsubset", () => pyftsubsetCommand().join(" ")),
		toolLine("codex", () => resolveCodexExecutable({ installedIn: SOURCE_CHECKOUT })),
	];
}

export {
	ROOT,
	attempt,
	chromiumPath,
	ffmpeg,
	inOrder,
	pyftsubsetCommand,
	requireEncoders,
	run,
	scratch,
	scratchRoot,
	toolLines,
	type Ran,
};
