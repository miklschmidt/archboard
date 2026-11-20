// Building the renderer core to WebAssembly (ADR 0059): cargo for wasm32, then
// wasm-bindgen into the renderer package, recording the hash of the sources the
// build was made from, and beside it the TypeScript types of the core's
// contract, generated from its Rust types, the marks a pane draws beside a
// picture, generated from its painter, and the theme colours a Bun host draws a
// standalone picture in. A complete build that records the hash of the sources
// in this checkout is kept, so a run without a change needs no Rust tools. When
// cargo or wasm-bindgen does not run and `nix` is on PATH, the build runs itself
// again inside the `nix develop` shell of the checkout.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { CoreBuildError, loadCore } from "#runtime/bun-renderer/services/core.ts";
import { checkoutPath, coreBuildPath, coreSourceHash } from "#runtime/store/core-sources.ts";

/** The crate that wasm-bindgen exports, and the file cargo builds from it. */
const CRATE = "archboard-renderer-wasm";
const TARGET = "wasm32-unknown-unknown";
const BUILT = checkoutPath("target", TARGET, "release", "archboard_renderer_wasm.wasm");

/** The painter that the browser loads beside the core (ADR 0071), and the file cargo builds from it. */
const PAINTER_CRATE = "archboard-painter-wasm";
const PAINTER_BUILT = checkoutPath("target", TARGET, "release", "archboard_painter_wasm.wasm");

/** The file the contract's TypeScript types are written to, beside the build. */
const TYPES = coreBuildPath("types.ts");
/** The file the marks a pane draws beside a picture are written to, beside the build. */
const MARKS = coreBuildPath("marks.ts");
/** The file the theme colours a Bun host draws in are written to, beside the build. */
const THEME_COLORS = coreBuildPath("theme-colors.ts");

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
			cwd: checkoutPath(),
			env: { ...process.env, ...env },
			stdout: output,
			stderr: "inherit",
		});
	} catch {
		throw new Error(
			`\`${command[0]}\` is not on PATH. Install the tools that INSTALL.md names, then run \`bun run build:core\`.`,
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
			coreBuildPath("archboard_renderer_wasm.d.ts"),
			coreBuildPath("archboard_renderer_wasm_bg.wasm.d.ts"),
			coreBuildPath("archboard_painter_wasm.js"),
			coreBuildPath("archboard_painter_wasm_bg.wasm"),
		].every(existsSync);
	} catch (error) {
		if (!(error instanceof CoreBuildError)) throw error;
		return false;
	}
}

/**
 * Install one panic boundary in the glue that every host loads. Guarding only
 * the public render misses callbacks that poll its future after a solve.
 * @throws {Error} When a wasm-bindgen update changes a boundary we must protect.
 */
function guardCoreGlue(): void {
	const path = coreBuildPath("archboard_renderer_wasm.js");
	let glue = readFileSync(path, "utf8");
	const boundaries = [
		["wasm = instance.exports;", "wasm = coreGuard.exports(instance.exports);"],
		["return real;", "return coreGuard.callback(real);"],
		[
			"new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b))",
			"new FinalizationRegistry(coreGuard.callback(state => wasm.__wbindgen_destroy_closure(state.a, state.b)))",
		],
		[
			"export function render(request, host) {",
			"export function render(request, host) { return coreGuard.render(() => renderUnchecked(request, host)); }\n" +
				"function renderUnchecked(request, host) {",
		],
	] as const;
	for (const [before, after] of boundaries) {
		if (glue.split(before).length !== 2) {
			// A failed adaptation must never leave a loadable, unguarded build.
			rmSync(coreBuildPath("archboard_renderer_wasm_bg.wasm"));
			throw new Error(
				`The wasm-bindgen panic boundary changed: ${before}. Update guardCoreGlue before building the core.`,
			);
		}
		glue = glue.replace(before, after);
	}
	writeFileSync(
		path,
		'import { CoreGuard } from "#shared/render/rules/core-guard.ts";\nconst coreGuard = new CoreGuard();\n' +
			glue,
	);
}

/** Set on the build that runs inside `nix develop`, so that it never enters the shell again. */
const IN_SHELL = "ARCHBOARD_CORE_BUILD_IN_NIX";

/**
 * Whether a tool starts and answers `--version`. A rustup proxy without a
 * chosen toolchain is on PATH and still fails.
 * @param tool The tool to start.
 * @returns Whether it ran.
 */
function runs(tool: string): boolean {
	if (Bun.which(tool) === null) return false;
	return Bun.spawnSync([tool, "--version"], {
		cwd: checkoutPath(),
		stdout: "ignore",
		stderr: "ignore",
	}).success;
}

/**
 * Whether this build needs the `nix develop` shell of the checkout: the tools on PATH cannot
 * build, Nix can give them, and this build does not already run inside that shell.
 * @returns Whether it does.
 */
function needsNixShell(): boolean {
	if (process.env[IN_SHELL] !== undefined || Bun.which("nix") === null) return false;
	return !(runs("cargo") && runs("wasm-bindgen"));
}

/**
 * Run this build again inside the `nix develop` shell of the checkout.
 * @throws {Error} When that build fails.
 */
function buildInNixShell(): void {
	console.error(
		"cargo or wasm-bindgen does not run here, so the core builds inside `nix develop`.",
	);
	const ran = Bun.spawnSync(
		[
			"nix",
			"develop",
			checkoutPath(),
			"--command",
			"bun",
			"--eval",
			`await (await import(${JSON.stringify(import.meta.path)})).buildCore();`,
		],
		{
			cwd: checkoutPath(),
			env: { ...process.env, [IN_SHELL]: "1" },
			stdio: ["inherit", "inherit", "inherit"],
		},
	);
	if (ran.exitCode !== 0) {
		throw new Error(`The core build inside \`nix develop\` failed (exit ${String(ran.exitCode)}).`);
	}
}

/**
 * Build the core from the checkout's sources, unless a complete build of them is there.
 * @param hash The hash of the sources.
 */
function buildWasm(hash: string): void {
	run(
		[
			"cargo",
			"build",
			"--release",
			"--locked",
			"--target",
			TARGET,
			"--package",
			CRATE,
			"--package",
			PAINTER_CRATE,
		],
		{ ARCHBOARD_CORE_SOURCE_HASH: hash },
	);
	const types = run(
		[
			"cargo",
			"run",
			"--quiet",
			"--release",
			"--locked",
			"--package",
			"archboard-render",
			"--bin",
			"export-types",
		],
		{},
		"pipe",
	);
	const marks = run(
		[
			"cargo",
			"run",
			"--quiet",
			"--release",
			"--locked",
			"--package",
			"archboard-render",
			"--bin",
			"export-marks",
		],
		{},
		"pipe",
	);
	// The WebAssembly, whose recorded hash says the build is whole, lands last:
	// a build stopped before it is refused as missing and made again.
	rmSync(coreBuildPath(), { recursive: true, force: true });
	mkdirSync(coreBuildPath(), { recursive: true });
	writeFileSync(TYPES, types);
	writeFileSync(MARKS, marks);
	run(["wasm-bindgen", "--target", "web", "--out-dir", coreBuildPath(), PAINTER_BUILT]);
	run(["wasm-bindgen", "--target", "web", "--out-dir", coreBuildPath(), BUILT]);
	guardCoreGlue();
	console.log(`Built the renderer core from these sources (${hash}).`);
}

/**
 * Write the theme colours of `theme.css`, one of the core's sources, beside the build, so that no
 * host loads the native addon of Lightning CSS to read them (ADR 0076). They need no Rust tools,
 * so every build brings them up to date. Only the build loads the addon, and only here: whoever
 * reads the source hash alone never does.
 */
async function writeThemeColors(): Promise<void> {
	const { themeColors } = await import("#runtime/theme/store/source.ts");
	const themeColorsSource =
		"// Generated from packages/renderer/assets/theme.css.\n" +
		"// `bun run build:core` writes it; do not edit it.\n" +
		'import type { ThemeColors } from "#shared/protocol/generated/core/types.ts";\n\n' +
		"/** The colours of both themes, as the shared stylesheet defines them. */\n" +
		`export const THEME_COLORS: ThemeColors = ${JSON.stringify(themeColors(), null, "\t")};\n`;
	if (!existsSync(THEME_COLORS) || readFileSync(THEME_COLORS, "utf8") !== themeColorsSource) {
		writeFileSync(THEME_COLORS, themeColorsSource);
	}
}

/**
 * Build the renderer core to WebAssembly in this checkout (ADR 0059), with the TypeScript its
 * hosts read beside it: the contract's types, the marks a pane draws and the theme colours. A
 * complete build of the checkout's sources is kept, so a run without a change needs no Rust
 * tools; one that needs them and lacks them builds inside the checkout's `nix develop` shell.
 * @throws {Error} When a tool is missing or fails, or the panic boundary of the glue changed.
 */
async function buildCore(): Promise<void> {
	const hash = coreSourceHash();
	if (currentBuild(hash)) {
		console.log(`The renderer core is built from these sources (${hash}).`);
	} else if (needsNixShell()) {
		buildInNixShell();
		return;
	} else {
		buildWasm(hash);
	}
	await writeThemeColors();
}

export { buildCore };
