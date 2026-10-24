// Build the renderer core to WebAssembly (ADR 0057): cargo for wasm32, then
// wasm-bindgen into the renderer package, recording the hash of the sources
// the build was made from. A build that already records the hash of the
// sources in this checkout is kept, so a run without a change needs no Rust
// tools.
//
// Run from the repository root, inside `nix develop`:
//   bun run build:core

import { rmSync } from "node:fs";
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

/**
 * Run one tool in the checkout, with its output shown.
 * @param command The tool and its arguments.
 * @param env What to add to the environment.
 * @throws {Error} When the tool is missing or fails.
 */
function run(command: string[], env: Record<string, string> = {}): void {
	let exit: number | null;
	try {
		exit = Bun.spawnSync(command, {
			cwd: CHECKOUT,
			env: { ...process.env, ...env },
			stdout: "inherit",
			stderr: "inherit",
		}).exitCode;
	} catch {
		throw new Error(
			`\`${command[0]}\` is not on PATH. Run \`bun run build:core\` inside \`nix develop\`.`,
		);
	}
	if (exit !== 0) throw new Error(`\`${command.join(" ")}\` failed (exit ${String(exit)}).`);
}

const hash = coreSourceHash();
try {
	await loadCore(hash);
	console.log(`The renderer core is built from these sources (${hash}).`);
} catch (error) {
	if (!(error instanceof CoreBuildError)) throw error;
	run(["cargo", "build", "--release", "--locked", "--target", TARGET, "--package", CRATE], {
		ARCHBOARD_CORE_SOURCE_HASH: hash,
	});
	rmSync(CORE_BUILD_DIRECTORY, { recursive: true, force: true });
	run(["wasm-bindgen", "--target", "web", "--out-dir", CORE_BUILD_DIRECTORY, BUILT]);
	console.log(`Built the renderer core from these sources (${hash}).`);
}
