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
type CoreBuildRefusal = "CORE_BUILD_MISSING" | "CORE_BUILD_STALE";

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

/**
 * Load the core's build and check it against the sources it must be made from.
 * @param expected The source hash the build must record; the checkout's own by default.
 * @returns The core.
 * @throws {CoreBuildError} When there is no build, or it was made from other sources.
 */
async function loadCore(expected: string = coreSourceHash()): Promise<Core> {
	let core: Core;
	let bytes: Buffer;
	try {
		core = await import("#shared/protocol/generated/core/archboard_renderer_wasm.js");
		bytes = readFileSync(CORE_WASM);
	} catch {
		throw new CoreBuildError(
			"CORE_BUILD_MISSING",
			`The renderer core is not built. Run \`${CORE_BUILD_COMMAND}\` in ${CHECKOUT} inside \`nix develop\`.`,
		);
	}
	core.initSync({ module: bytes });
	const built = core.sourceHash();
	if (built !== expected) {
		throw new CoreBuildError(
			"CORE_BUILD_STALE",
			`The renderer core was built from other sources (${built}) than ${CHECKOUT} holds (${expected}). ` +
				`Run \`${CORE_BUILD_COMMAND}\` there inside \`nix develop\`.`,
		);
	}
	return core;
}

export { CoreBuildError, loadCore, type Core, type CoreBuildRefusal };
