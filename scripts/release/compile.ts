// Compile Archboard into the directory of one platform package (ADR 0075):
//
//   bin/archboard           the executable: the CLI, and with its internal first argument the server
//   frontend/               the browser bundle that `bun run build` made
//   core/                   the renderer glue and WebAssembly that the server loads
//   skills/                 the archboard and archboard-pr skills
//   archboard-release.json  the version, the commit, the core source hash and the Codex version
//
// The grammars of the code check, the reviewed texts of the workbench and the theme colours are
// embedded in the executable, so the package holds no file the program finds beside its source.
// Run it in a checkout after `bun run build`:
//
//   bun scripts/release/compile.ts --target bun-linux-x64 --out <directory>
//
// The directory is replaced. The release build (scripts/release/build.ts) adds the package
// manifest, the licence and the notices.

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { CHECKOUT, CORE_BUILD_DIRECTORY, loadCore } from "@archboard/renderer/core";
import { prepareSkillArtifacts } from "@archboard/skills/distribution";

/** The platforms a release is built for. */
const TARGETS = ["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64"] as const;
type Target = (typeof TARGETS)[number];

/**
 * The modules that start on their own, by their path in a checkout. The first is the
 * executable's own entry. The others are imported or started by those paths below the
 * `programRoot` of the installation, which is why the repository is the build's root.
 */
const ENTRIES = [
	"apps/cli/src/bin.ts",
	"apps/server/src/server.ts",
	"packages/renderer/src/runtime/processes/layout-worker.ts",
];

/** The skills a release ships, under `skills/`. */
const SKILLS = ["archboard", "archboard-pr"];
/** The skill whose generated references a checkout derives, and a release derives again. */
const PREPARED_SKILL = "archboard";

/** The glue of the core and its WebAssembly. */
const CORE_GLUE = "archboard_renderer_wasm.js";
const CORE_WASM = "archboard_renderer_wasm_bg.wasm";

/** What one compile made. */
interface CompiledRelease {
	readonly directory: string;
	readonly executable: string;
	readonly marker: ReturnType<typeof releaseMarker>;
	/** The npm package directories the executable bundles code from, relative to the checkout. */
	readonly bundledPackages: readonly string[];
}

/**
 * Refuse with a message that says what to do.
 * @param message What is wrong, and the remedy.
 * @throws {Error} Always.
 */
function refuse(message: string): never {
	throw new Error(message);
}

/**
 * The version, the commit, the hash of the checkout's core build and the pinned Codex, which the
 * installation module reads from `archboard-release.json`.
 * @returns The marker of the release.
 * @throws {Error} When the core is missing or stale, or the checkout has no commit.
 */
function releaseMarker() {
	const manifest = z
		.object({ version: z.string(), dependencies: z.object({ "@openai/codex": z.string() }) })
		.parse(JSON.parse(readFileSync(path.join(CHECKOUT, "package.json"), "utf8")));
	const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: CHECKOUT });
	if (commit.exitCode !== 0) refuse(`${CHECKOUT} has no commit to record. Commit, then compile.`);
	return {
		version: manifest.version,
		commit: commit.stdout.toString().trim(),
		// The checkout refuses a core of other sources than its own, so the release records the
		// hash of the sources it was built from.
		coreSourceHash: loadCore().sourceHash(),
		codexVersion: manifest.dependencies["@openai/codex"],
	};
}

/**
 * Whether a directory holds a native addon at its top.
 * @param directory The directory.
 * @returns True when a `.node` file lies in it.
 */
function holdsAddon(directory: string): boolean {
	try {
		return readdirSync(directory).some((file) => file.endsWith(".node"));
	} catch {
		return false;
	}
}

/**
 * The bundled inputs that load a native addon: an addon itself, or a package that requires the
 * addon of its platform package at run time, as `lightningcss` requires
 * `lightningcss-linux-x64-gnu`.
 * @param inputs The bundle's inputs, relative to the checkout.
 * @returns The packages and addons.
 */
function nativeInputs(inputs: readonly string[]): string[] {
	const modules = path.join(CHECKOUT, "node_modules");
	const packages = new Set(
		inputs.flatMap((input) => /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1] ?? []),
	);
	const native = [...packages].filter((name) => {
		const scope = path.join(modules, path.dirname(name));
		return readdirSync(scope).some(
			(sibling) =>
				sibling.startsWith(`${path.basename(name)}-`) && holdsAddon(path.join(scope, sibling)),
		);
	});
	return [...native, ...inputs.filter((input) => input.endsWith(".node"))];
}

/**
 * The npm package directories that bundled inputs come from: the innermost `node_modules/<name>`
 * of each input, so a nested copy is its own package.
 * @param inputs The bundle's inputs, relative to the checkout.
 * @returns The package directories, relative to the checkout, sorted.
 */
function packagesOf(inputs: readonly string[]): string[] {
	const directories = inputs.flatMap(
		(input) => /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1] ?? [],
	);
	return [...new Set(directories)].toSorted();
}

/**
 * Compile the executable, and refuse a bundle that would load a native addon at run time.
 * @param target The Bun target.
 * @param outfile Where the executable goes.
 * @returns The npm package directories the executable bundles code from.
 * @throws {Error} When the build fails or bundles a native addon.
 */
async function compileExecutable(target: Target, outfile: string): Promise<string[]> {
	const built = await Bun.build({
		entrypoints: ENTRIES.map((entry) => path.join(CHECKOUT, entry)),
		root: CHECKOUT,
		target: "bun",
		metafile: true,
		compile: {
			target,
			outfile,
			// A user's bunfig.toml or tsconfig.json says nothing about how Archboard runs.
			autoloadBunfig: false,
			autoloadTsconfig: false,
		},
	});
	if (!built.success) {
		refuse(`The executable did not compile:\n${built.logs.map(String).join("\n")}`);
	}
	const inputs = Object.keys(built.metafile?.inputs ?? {});
	const addons = nativeInputs(inputs);
	if (addons.length > 0) {
		refuse(
			`The executable bundles code that loads a native addon, which a release never loads: ` +
				`${addons.join(", ")}. Compute what it gives at build time, as the theme colours are.`,
		);
	}
	return packagesOf(inputs);
}

/**
 * Copy the core's build. The glue imports the panic guard of the renderer through the package's
 * `#` imports, which `core/` lacks, so the glue is bundled with the guard into one module.
 * @param directory The `core/` directory of the package.
 * @throws {Error} When the glue does not bundle.
 */
async function layOutCore(directory: string): Promise<void> {
	mkdirSync(directory, { recursive: true });
	const glue = await Bun.build({
		entrypoints: [path.join(CORE_BUILD_DIRECTORY, CORE_GLUE)],
		target: "bun",
		format: "esm",
	});
	const [output] = glue.outputs;
	if (!glue.success || output === undefined) refuse(`${CORE_GLUE} did not bundle.`);
	writeFileSync(path.join(directory, CORE_GLUE), await output.text());
	cpSync(path.join(CORE_BUILD_DIRECTORY, CORE_WASM), path.join(directory, CORE_WASM));
}

/**
 * Lay out the platform package of one target.
 * @param target The Bun target.
 * @param directory The package directory, which is replaced.
 * @returns What was made.
 * @throws {Error} When the checkout lacks a build, or the executable does not compile.
 */
async function compileRelease(target: Target, directory: string): Promise<CompiledRelease> {
	const frontend = path.join(CHECKOUT, "dist", "frontend");
	if (!existsSync(path.join(frontend, "index.html"))) {
		refuse(`${frontend} holds no browser bundle. Run \`bun run build\`, then compile.`);
	}
	const marker = releaseMarker();
	rmSync(directory, { recursive: true, force: true });
	const executable = path.join(directory, "bin", "archboard");
	const bundledPackages = await compileExecutable(target, executable);
	cpSync(frontend, path.join(directory, "frontend"), { recursive: true });
	await layOutCore(path.join(directory, "core"));
	for (const skill of SKILLS) {
		cpSync(path.join(CHECKOUT, "skills", skill), path.join(directory, "skills", skill), {
			recursive: true,
			dereference: true,
		});
	}
	// The checkout's copy links its manual to the checkout. A release has none, so its copy links to
	// the repository at the tag of its version.
	prepareSkillArtifacts(path.join(directory, "skills", PREPARED_SKILL), {
		root: CHECKOUT,
		release: { version: marker.version, commit: marker.commit },
	});
	writeFileSync(
		path.join(directory, "archboard-release.json"),
		`${JSON.stringify(marker, null, "\t")}\n`,
	);
	return { directory, executable, marker, bundledPackages };
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { target: { type: "string" }, out: { type: "string" } },
	});
	const target = TARGETS.find((known) => known === values.target);
	if (target === undefined || values.out === undefined) {
		process.stderr.write(
			`Usage: bun scripts/release/compile.ts --target <${TARGETS.join("|")}> --out <directory>\n`,
		);
		process.exit(2);
	}
	const made = await compileRelease(target, path.resolve(values.out));
	process.stdout.write(`${JSON.stringify(made, null, "\t")}\n`);
}

export { compileRelease, TARGETS, type CompiledRelease, type Target };
