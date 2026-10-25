// Build @archboard/codex-realtime-voice into a directory that `npm publish` can publish: ESM
// JavaScript and bundled declarations for every public entry, with the MIT workspace packages it
// imports bundled in, and a manifest that declares only the third-party packages it imports.
import { copyFile, cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "vite-plus/pack";
import { z } from "zod";

const PUBLISHED_VERSION = "0.1.0";
/** What the bundle may import at run time: its dependencies, its peers and Bun's own modules. */
const DEPENDENCIES = ["zod", "ws"] as const;
// The browser hooks import React. The server entry's types name an Express router, and its code
// imports nothing from Express.
const OPTIONAL_PEERS = ["react", "express"] as const;

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(root, "packages/codex-realtime-voice");
const output = path.join(root, "dist/codex-realtime-voice");

const Paths = z.record(z.string(), z.string());
const workspace = z
	.object({
		name: z.string(),
		description: z.string(),
		license: z.string(),
		imports: z.object({ "#*": z.string() }),
		exports: Paths,
	})
	.parse(JSON.parse(await readFile(path.join(source, "package.json"), "utf8")));
const repository = z
	.object({ dependencies: Paths, engines: z.object({ bun: z.string() }) })
	.parse(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")));

/**
 * The version range that the repository pins a third-party package at.
 * @param name The package.
 * @returns A caret range from the pinned version.
 */
function pinnedRange(name: string): string {
	const version = repository.dependencies[name];
	if (version === undefined) throw new Error(`The repository does not pin ${name}.`);
	return `^${version}`;
}

/**
 * The exact version that the repository pins a package at, which the Codex protocol is built for.
 * @param name The package.
 * @returns The pinned version.
 */
function exactVersion(name: string): string {
	const version = repository.dependencies[name];
	if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version))
		throw new Error(`The repository does not pin ${name} at one exact version.`);
	return version;
}

/**
 * The name of a public entry: `./server` is built as `server`.
 * @param subpath The `exports` key.
 * @returns The entry name.
 */
function entryName(subpath: string): string {
	return subpath.slice("./".length);
}

const packages = [...DEPENDENCIES, ...OPTIONAL_PEERS, "@openai/codex"];
const external = packages.map((name) => new RegExp(`^${name.replace("/", "\\/")}(?:/|$)`));
await rm(output, { recursive: true, force: true });
await build({
	config: false,
	cwd: source,
	entry: Object.fromEntries(
		Object.entries(workspace.exports).map(([subpath, file]) => [
			entryName(subpath),
			path.join(source, file),
		]),
	),
	format: "esm",
	platform: "node",
	outDir: path.join(output, "dist"),
	tsconfig: path.join(root, "tsconfig.voice-package.json"),
	dts: {
		generator: "tsgo",
		tsgo: { path: path.join(root, "scripts/pack-codex-realtime-voice-tsgo.ts") },
	},
	deps: {
		neverBundle: [...external, /^bun:/],
		alwaysBundle: [/^@archboard\//],
		onlyImport: [...packages, /^bun:/],
	},
	report: false,
	logLevel: "warn",
});

const exports = Object.fromEntries(
	Object.keys(workspace.exports).map((subpath) => [
		subpath,
		{
			types: `./dist/${entryName(subpath)}.d.mts`,
			import: `./dist/${entryName(subpath)}.mjs`,
		},
	]),
);
// The runtime reads its reviewed manifests and instruction texts beside its sources with
// `import.meta.resolve("#...")`, so they keep their paths and the `#` import map of the package.
const assets = (await readdir(path.join(source, "src"), { recursive: true, withFileTypes: true }))
	.filter((entry) => entry.isFile() && !/\.tsx?$/.test(entry.name))
	.map((entry) => path.relative(source, path.join(entry.parentPath, entry.name)));
await Promise.all(assets.map((asset) => cp(path.join(source, asset), path.join(output, asset))));
const readme = path.join(source, "README.md");
const files = ["dist", "src", "LICENSE", ...(existsSync(readme) ? ["README.md"] : [])];
const manifest = {
	name: workspace.name,
	version: PUBLISHED_VERSION,
	description: workspace.description,
	license: workspace.license,
	author: "Mikkel Schmidt",
	repository: {
		type: "git",
		url: "https://github.com/miklschmidt/archboard.git",
		directory: "packages/codex-realtime-voice",
	},
	type: "module",
	imports: { "#*": workspace.imports["#*"] },
	exports,
	files,
	engines: { bun: repository.engines.bun },
	dependencies: Object.fromEntries(DEPENDENCIES.map((name) => [name, pinnedRange(name)])),
	peerDependencies: {
		"@openai/codex": exactVersion("@openai/codex"),
		...Object.fromEntries(OPTIONAL_PEERS.map((name) => [name, pinnedRange(name)])),
	},
	peerDependenciesMeta: Object.fromEntries(
		OPTIONAL_PEERS.map((name) => [name, { optional: true }]),
	),
};
await writeFile(path.join(output, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
await Promise.all(
	files
		.filter((name) => name !== "dist" && name !== "src")
		.map((file) => copyFile(path.join(source, file), path.join(output, file))),
);
console.log(`Packed ${workspace.name}@${PUBLISHED_VERSION} in ${output}.`);
