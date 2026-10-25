// Build the renderer core to WebAssembly (ADR 0057): cargo for wasm32, then
// wasm-bindgen into the renderer package, recording the hash of the sources
// the build was made from, and beside it the TypeScript types of the core's
// contract, generated from its Rust types, and the marks a pane draws beside a
// picture, generated from its painter. A complete build that records the hash of the
// sources in this checkout is kept, so a run without a change needs no Rust
// tools.
//
// Run from the repository root, inside `nix develop`:
//   bun run build:core

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CHECKOUT,
	CORE_BUILD_DIRECTORY,
	CoreBuildError,
	coreSourceHash,
	loadCore,
} from "@archboard/renderer/core";

/** The crate that wasm-bindgen exports, and the file cargo builds from it. */
const CRATE = "archboard-renderer-wasm";
const TARGET = "wasm32-unknown-unknown";
const BUILT = join(CHECKOUT, "target", TARGET, "release", "archboard_renderer_wasm.wasm");

/** The file the contract's TypeScript types are written to, beside the build. */
const TYPES = join(CORE_BUILD_DIRECTORY, "types.ts");
/** The file the marks a pane draws beside a picture are written to, beside the build. */
const MARKS = join(CORE_BUILD_DIRECTORY, "marks.ts");

/**
 * Run one tool in the checkout, with its errors shown.
 * @param command The tool and its arguments.
 * @param env What to add to the environment.
 * @param output Where its output goes: shown, or kept for the caller.
 * @returns What it printed, when kept.
 * @throws {Error} When the tool is missing or fails.
 */
function run(
	command: string[],
	env: Record<string, string> = {},
	output: "inherit" | "pipe" = "inherit",
): string {
	const ran = spawn(command, env, output);
	if (ran.exitCode !== 0) {
		throw new Error(`\`${command.join(" ")}\` failed (exit ${String(ran.exitCode)}).`);
	}
	return ran.stdout?.toString() ?? "";
}

/**
 * Start one tool in the checkout and wait for it.
 * @param command The tool and its arguments.
 * @param env What to add to the environment.
 * @param output Where its output goes.
 * @returns How it ended.
 * @throws {Error} When the tool is missing.
 */
function spawn(
	command: string[],
	env: Record<string, string>,
	output: "inherit" | "pipe",
): ReturnType<typeof Bun.spawnSync> {
	try {
		return Bun.spawnSync(command, {
			cwd: CHECKOUT,
			env: { ...process.env, ...env },
			stdout: output,
			stderr: "inherit",
		});
	} catch {
		throw new Error(
			`\`${command[0]}\` is not on PATH. Run \`bun run build:core\` inside \`nix develop\`.`,
		);
	}
}

/**
 * Whether the core and every generated TypeScript file are ready for this checkout.
 * @param hash The source hash the core must hold.
 * @returns Whether the build can be kept without running the generators.
 * @throws {Error} When loading the core fails for a reason other than a missing or stale build.
 */
function currentBuild(hash: string): boolean {
	try {
		loadCore(hash);
		return [
			TYPES,
			MARKS,
			join(CORE_BUILD_DIRECTORY, "archboard_renderer_wasm.d.ts"),
			join(CORE_BUILD_DIRECTORY, "archboard_renderer_wasm_bg.wasm.d.ts"),
		].every(existsSync);
	} catch (error) {
		if (!(error instanceof CoreBuildError)) throw error;
		return false;
	}
}

const hash = coreSourceHash();
if (currentBuild(hash)) {
	console.log(`The renderer core is built from these sources (${hash}).`);
} else {
	run(["cargo", "build", "--release", "--locked", "--target", TARGET, "--package", CRATE], {
		ARCHBOARD_CORE_SOURCE_HASH: hash,
	});
	const types = run(
		["cargo", "run", "--quiet", "--release", "--locked", "--package", "archboard-render"],
		{},
		"pipe",
	);
	const marks = run(
		["cargo", "run", "--quiet", "--release", "--locked", "--package", "archboard-svg"],
		{},
		"pipe",
	);
	// The WebAssembly, whose recorded hash says the build is whole, lands last:
	// a build stopped before it is refused as missing and made again.
	rmSync(CORE_BUILD_DIRECTORY, { recursive: true, force: true });
	mkdirSync(CORE_BUILD_DIRECTORY, { recursive: true });
	writeFileSync(TYPES, types);
	writeFileSync(MARKS, marks);
	run(["wasm-bindgen", "--target", "web", "--out-dir", CORE_BUILD_DIRECTORY, BUILT]);
	console.log(`Built the renderer core from these sources (${hash}).`);
}
