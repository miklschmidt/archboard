import initCore, * as core from "#shared/protocol/generated/core/archboard_renderer_wasm.js";

/**
 * Load the page's core and refuse an artifact from another source build.
 * @returns The initialized core.
 * @throws {Error} When the core is missing or its source fingerprint differs.
 */
async function loadBrowserCore(): Promise<typeof core> {
	try {
		await initCore();
	} catch (cause) {
		throw new Error(
			"CORE_BUILD_MISSING: The renderer core did not load. " +
				"Run `bun run build:frontend` inside `nix develop`, then reload the page.",
			{ cause },
		);
	}
	const built = core.sourceHash();
	if (built !== ARCHBOARD_CORE_SOURCE_HASH) {
		throw new Error(
			`CORE_BUILD_STALE: The renderer core records ${built}, but this page expects ${ARCHBOARD_CORE_SOURCE_HASH}. ` +
				"Run `bun run build:frontend` inside `nix develop`, then reload the page.",
		);
	}
	return core;
}

export { loadBrowserCore };
