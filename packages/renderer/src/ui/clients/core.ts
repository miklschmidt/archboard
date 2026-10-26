import initCore, * as core from "#shared/protocol/generated/core/archboard_renderer_wasm.js";

/** The core's WebAssembly, as the build serves it beside its glue. */
const CORE_WASM = new URL(
	"../../shared/protocol/generated/core/archboard_renderer_wasm_bg.wasm",
	import.meta.url,
);

/** The page's core, and the module it was compiled to, which each layout worker instantiates. */
interface BrowserCore {
	readonly core: typeof core;
	readonly module: WebAssembly.Module;
}

/**
 * Load the page's core and refuse an artifact from another source build.
 * @returns The initialized core and its compiled module.
 * @throws {Error} When the core is missing or its source fingerprint differs.
 */
async function loadBrowserCore(): Promise<BrowserCore> {
	let module: WebAssembly.Module;
	try {
		module = await WebAssembly.compileStreaming(fetch(CORE_WASM));
	} catch (cause) {
		throw new Error(
			"CORE_BUILD_MISSING: The renderer core did not load. " +
				"Run `bun run build:frontend` inside `nix develop`, then reload the page.",
			{ cause },
		);
	}
	return { core: await instantiateBrowserCore(module), module };
}

/**
 * Instantiate the core on this thread from its compiled module, as the page
 * and each layout worker do, and refuse a module of another source build.
 * @param module The compiled core.
 * @returns The initialized core.
 * @throws {Error} When the module does not instantiate or its source fingerprint differs.
 */
async function instantiateBrowserCore(module: WebAssembly.Module): Promise<typeof core> {
	try {
		await initCore({ module_or_path: module });
	} catch (cause) {
		throw new Error(
			"CORE_BUILD_INVALID: The renderer core did not start. " +
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

export { instantiateBrowserCore, loadBrowserCore, type BrowserCore };
