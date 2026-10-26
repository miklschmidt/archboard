// The renderer core under Bun (ADR 0057). Bun runs TypeScript from source, but
// the core is a build, so the loader refuses a build of other sources than the
// checkout holds (ADR 0014): a stale copy would answer for code nobody sees.

import { readFileSync } from "node:fs";
import {
	CHECKOUT,
	CORE_BUILD_COMMAND,
	CORE_WASM,
	coreSourceHash,
} from "#runtime/store/core-sources.ts";

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

/** The build this thread compiled, which it hands each layout worker it starts. */
let compiled: WebAssembly.Module | undefined;

/**
 * The glue wasm-bindgen wrote. Bun loads a module synchronously on require,
 * so a picture is painted in the same turn it is laid out in.
 * @returns The glue.
 */
function glue(): Core {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the glue wasm-bindgen wrote, typed by its own declarations
	return require("#shared/protocol/generated/core/archboard_renderer_wasm.js") as Core;
}

/**
 * Load the core's build on this thread, at once, and check it against the
 * sources it must be made from. The glue keeps the instance it made first, so
 * a second load on the same thread checks the hash again and instantiates nothing.
 * @param expected The source hash the build must record; the checkout's own by default.
 * @returns The core.
 * @throws {CoreBuildError} When the build is missing, unreadable, or made from other sources.
 */
function loadCore(expected: string = coreSourceHash()): Core {
	return loadBuild(expected).core;
}

/**
 * The core this thread loaded and checked, compiled, for a layout worker to
 * instantiate without reading, hashing or compiling the build again.
 * @returns The compiled core.
 * @throws {CoreBuildError} When the build is missing, unreadable, or made from other sources.
 */
function compiledCore(): WebAssembly.Module {
	return loadBuild(coreSourceHash()).module;
}

/**
 * Instantiate on this thread the core another thread compiled and checked
 * ({@link compiledCore}).
 * @param module The compiled core.
 * @returns The core.
 */
function instantiateCore(module: WebAssembly.Module): Core {
	const core = glue();
	core.initSync({ module });
	return core;
}

/**
 * Load the build on this thread, compiling it the first time, and check it.
 * @param expected The source hash the build must record.
 * @returns The core and the module it was instantiated from.
 * @throws {CoreBuildError} When the build is missing, unreadable, or made from other sources.
 */
function loadBuild(expected: string): { core: Core; module: WebAssembly.Module } {
	let core: Core;
	let bytes: Buffer;
	try {
		// A missing build is refused with what to run, not thrown at import.
		core = glue();
		bytes = readFileSync(CORE_WASM);
	} catch {
		throw new CoreBuildError(
			"CORE_BUILD_MISSING",
			`The renderer core is not built. Run \`${CORE_BUILD_COMMAND}\` in ${CHECKOUT} inside \`nix develop\`.`,
		);
	}
	let module: WebAssembly.Module;
	try {
		module = compiled ?? new WebAssembly.Module(new Uint8Array(bytes));
		core.initSync({ module });
		compiled = module;
	} catch {
		throw new CoreBuildError(
			"CORE_BUILD_INVALID",
			`The renderer core build cannot be loaded. Run \`${CORE_BUILD_COMMAND}\` in ${CHECKOUT} inside \`nix develop\`.`,
		);
	}
	const built = core.sourceHash();
	if (built !== expected) {
		throw new CoreBuildError(
			"CORE_BUILD_STALE",
			`The renderer core was built from other sources (${built}) than ${CHECKOUT} holds (${expected}). ` +
				`Run \`${CORE_BUILD_COMMAND}\` there inside \`nix develop\`.`,
		);
	}
	return { core, module };
}

export { CoreBuildError, compiledCore, instantiateCore, loadCore, type Core };
