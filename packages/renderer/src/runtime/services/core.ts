// The renderer core under Bun (ADR 0059). Bun runs TypeScript from source, but
// the core is a build, so the loader refuses a build of other sources than the
// installation expects (ADR 0014): a stale copy would answer for code nobody sees.
// A checkout expects the hash of its own Rust sources. A release ships no
// sources, so it expects the hash that its build recorded in its marker
// (ADR 0075), and its remedy is to install again.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installation } from "@archboard/workspace/installation";
import { CORE_BUILD_COMMAND, coreSourceHash } from "#runtime/store/core-sources.ts";

/** The core's exports, as wasm-bindgen wrote them. */
type Core = typeof import("#shared/protocol/generated/core/archboard_renderer_wasm.js");

/** Why the core was not loaded. */
type CoreBuildRefusal = "CORE_BUILD_MISSING" | "CORE_BUILD_INVALID" | "CORE_BUILD_STALE";

/** A core build that a host refused to load, and the command that makes a good one. */
class CoreBuildError extends Error {
	readonly code: CoreBuildRefusal;

	/**
	 * A refusal of one build.
	 * @param code Why the build was refused.
	 * @param message What happened and what to run.
	 */
	constructor(code: CoreBuildRefusal, message: string) {
		super(message);
		this.name = "CoreBuildError";
		this.code = code;
	}
}

/** The installation that holds the core: its mode, its core directory and the hash it expects. */
type CoreInstallation = Pick<
	ReturnType<typeof installation>,
	"mode" | "root" | "coreDirectory" | "coreHash"
>;

/** The glue and the WebAssembly of a build, by name in the core directory. */
const CORE_GLUE = "archboard_renderer_wasm.js";
const CORE_WASM = "archboard_renderer_wasm_bg.wasm";

/**
 * What makes a good build: a checkout builds the core, a release installs again.
 * @param from The installation that holds the core.
 * @returns The sentence that says what to do.
 */
function remedy(from: CoreInstallation): string {
	return from.mode === "release"
		? `Reinstall Archboard (${from.root}) to get a matching core, then run the command again.`
		: `Run \`${CORE_BUILD_COMMAND}\` in ${from.root}, with the tools that its INSTALL.md names.`;
}

/**
 * Who names the hash a core must record, as a refusal says it.
 * @param from The installation that holds the core.
 * @returns The phrase.
 */
function holder(from: CoreInstallation): string {
	return from.mode === "release" ? "this release recorded" : `${from.root} holds`;
}

/**
 * The source hash the core of an installation must record. Only a checkout reads Rust sources.
 * @param from The installation that holds the core.
 * @returns The hash.
 */
function expectedHash(from: CoreInstallation): string {
	return from.coreHash.kind === "marker" ? from.coreHash.hash : coreSourceHash(from.coreHash.root);
}

/** The build this thread compiled, and the directory it came from; a layout worker gets it. */
let compiled: { readonly directory: string; readonly module: WebAssembly.Module } | undefined;

/**
 * The glue wasm-bindgen wrote, in the core directory of an installation. Bun
 * loads a module synchronously on require, so a picture is painted in the same
 * turn it is laid out in.
 * @param directory The core directory.
 * @returns The glue.
 */
function glue(directory: string): Core {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the glue wasm-bindgen wrote, typed by its own declarations
	return require(join(directory, CORE_GLUE)) as Core;
}

/**
 * Load the core's build on this thread, at once, and check it against the
 * sources it must be made from. The glue keeps the instance it made first, so
 * a second load on the same thread checks the hash again and instantiates nothing.
 * @param expected The source hash the build must record; the installation's own by default.
 * @param from The installation that holds the core; the one this process runs by default.
 * @returns The core.
 * @throws {CoreBuildError} When the build is missing, unreadable, or made from other sources.
 */
function loadCore(expected?: string, from: CoreInstallation = installation()): Core {
	return loadBuild(expected ?? expectedHash(from), from).core;
}

/**
 * The core this thread loaded and checked, compiled, for a layout worker to
 * instantiate without reading, hashing or compiling the build again.
 * @returns The compiled core.
 * @throws {CoreBuildError} When the build is missing, unreadable, or made from other sources.
 */
function compiledCore(): WebAssembly.Module {
	const from = installation();
	return loadBuild(expectedHash(from), from).module;
}

/**
 * Instantiate on this thread the core another thread compiled and checked
 * ({@link compiledCore}).
 * @param module The compiled core.
 * @returns The core.
 */
function instantiateCore(module: WebAssembly.Module): Core {
	const core = glue(installation().coreDirectory);
	core.initSync({ module });
	return core;
}

/**
 * Load the build on this thread, compiling it the first time, and check it.
 * @param expected The source hash the build must record.
 * @param from The installation that holds the core.
 * @returns The core and the module it was instantiated from.
 * @throws {CoreBuildError} When the build is missing, unreadable, or made from other sources.
 */
function loadBuild(
	expected: string,
	from: CoreInstallation,
): { core: Core; module: WebAssembly.Module } {
	const directory = from.coreDirectory;
	let core: Core;
	let bytes: Buffer;
	try {
		// A missing build is refused with what to do, not thrown at import.
		core = glue(directory);
		bytes = readFileSync(join(directory, CORE_WASM));
	} catch {
		throw new CoreBuildError(
			"CORE_BUILD_MISSING",
			`The renderer core is missing from ${directory}. ${remedy(from)}`,
		);
	}
	let module: WebAssembly.Module;
	try {
		module =
			compiled?.directory === directory
				? compiled.module
				: new WebAssembly.Module(new Uint8Array(bytes));
		core.initSync({ module });
		compiled = { directory, module };
	} catch {
		throw new CoreBuildError(
			"CORE_BUILD_INVALID",
			`The renderer core in ${directory} cannot be loaded. ${remedy(from)}`,
		);
	}
	const built = core.sourceHash();
	if (built !== expected) {
		throw new CoreBuildError(
			"CORE_BUILD_STALE",
			`The renderer core in ${directory} was built from other sources (${built}) than ${holder(from)} (${expected}). ${remedy(from)}`,
		);
	}
	return { core, module };
}

export {
	CoreBuildError,
	compiledCore,
	instantiateCore,
	loadCore,
	type Core,
	type CoreInstallation,
};
