// The sources the renderer core is built from, and where its WebAssembly build
// lands (ADR 0057). A build records the hash of these sources, so a host can
// tell a build of the sources in its checkout from a build of older ones.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The checkout: the Cargo workspace is at its root. */
const CHECKOUT = fileURLToPath(new URL("../../../../../", import.meta.url));

/** The files and folders, relative to the checkout, that a build of the core is made from. */
const CORE_SOURCES = ["Cargo.toml", "Cargo.lock", "packages/renderer/crates"];

/** Where `bun run build:core` writes the build: the glue module, its types and the WebAssembly. */
const CORE_BUILD_DIRECTORY = fileURLToPath(
	new URL("../../shared/protocol/generated/core/", import.meta.url),
);

/** The WebAssembly file of the build. */
const CORE_WASM = join(CORE_BUILD_DIRECTORY, "archboard_renderer_wasm_bg.wasm");

/** The command that builds the core, as a refusal names it. */
const CORE_BUILD_COMMAND = "bun run build:core";

/**
 * Every file under a path, sorted, so the hash does not depend on directory order.
 * @param path A file or folder.
 * @returns The files.
 */
function filesUnder(path: string): string[] {
	if (!statSync(path).isDirectory()) return [path];
	return readdirSync(path)
		.toSorted()
		.flatMap((name) => filesUnder(join(path, name)));
}

/**
 * The hash of the core sources in a checkout: each file's path and bytes.
 * @param checkout The checkout to read.
 * @returns The hash, as 16 hexadecimal characters.
 */
function coreSourceHash(checkout: string = CHECKOUT): string {
	const digest = createHash("sha256");
	for (const file of CORE_SOURCES.flatMap((source) => filesUnder(join(checkout, source)))) {
		digest.update(relative(checkout, file).split(sep).join("/")).update("\0");
		digest.update(readFileSync(file)).update("\0");
	}
	return digest.digest("hex").slice(0, 16);
}

export { CHECKOUT, CORE_BUILD_COMMAND, CORE_BUILD_DIRECTORY, CORE_WASM, coreSourceHash };
