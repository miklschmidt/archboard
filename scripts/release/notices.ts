// The third-party notices of a platform package (ADR 0076): every npm package that the executable
// or the browser bundle is built from, every Rust crate that the renderer core is built from, the
// fonts, the code adapted from PR Lens, and the Bun runtime that the executable is. Each entry
// carries the license files of its package, and entries with the same texts share them.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CHECKOUT } from "@archboard/renderer/core";

/** The packages that are no part of what a platform package holds. */
const SEPARATE = new Set([
	// npm installs the Codex binary as its own dependency, with its own license.
	"@openai/codex",
]);
/**
 * Build tools that write their own code into the browser bundle: Tailwind's base styles, and the
 * preload helpers of Vite. Neither is a production dependency.
 */
const BUILD_TOOLS = ["tailwindcss", "vite"];
/** The crates the renderer core is built from: the core of the server and the painter of the page. */
const CORE_CRATES = new Set(["archboard-renderer-wasm", "archboard-painter-wasm"]);
/** The fonts and their license texts. */
const FONTS = path.join(CHECKOUT, "packages", "renderer", "assets", "fonts");
/** The notice of the code adapted from PR Lens. */
const PR_LENS_NOTICE = path.join(CHECKOUT, "packages", "renderer", "NOTICE.md");
/** A file that holds a license, a copyright or a notice at the top of a package. */
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-._].*)?$/i;

/** One package and the license files it carries. */
interface Licensed {
	readonly name: string;
	readonly version: string;
	readonly license: string;
	readonly files: readonly string[];
}

const NpmManifest = z.object({
	name: z.string(),
	version: z.string(),
	license: z.union([z.string(), z.object({ type: z.string() })]).optional(),
	dependencies: z.record(z.string(), z.string()).optional(),
});

/**
 * The license files at the top of a package: `LICENSE`, `COPYING` and `NOTICE` files, and those of
 * a `LICENSES/` directory.
 * @param directory The package directory.
 * @returns Their paths, sorted.
 */
function licenseFiles(directory: string): string[] {
	const top = readdirSync(directory)
		.filter((file) => LICENSE_FILE.test(file))
		.map((file) => path.join(directory, file));
	const nested = path.join(directory, "LICENSES");
	const listed = existsSync(nested)
		? readdirSync(nested).map((file) => path.join(nested, file))
		: [];
	return [...top, ...listed].toSorted();
}

/**
 * Resolve a dependency as Node.js does: in the `node_modules` of the dependent, else in that of
 * each directory above it.
 * @param name The dependency.
 * @param from The dependent's directory.
 * @returns Its directory, or null when it is not installed.
 */
function resolvePackage(name: string, from: string): string | null {
	for (let directory = from; ; directory = path.dirname(directory)) {
		const candidate = path.join(directory, "node_modules", name);
		if (path.basename(directory) !== "node_modules" && existsSync(candidate)) return candidate;
		if (path.dirname(directory) === directory) return null;
	}
}

/**
 * Describe one npm package.
 * @param directory The package directory.
 * @returns The package and the names of its dependencies.
 */
function npmPackage(directory: string): { licensed: Licensed; dependencies: string[] } {
	const manifest = NpmManifest.parse(
		JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")),
	);
	const license = typeof manifest.license === "object" ? manifest.license.type : manifest.license;
	return {
		licensed: {
			name: manifest.name,
			version: manifest.version,
			license: license ?? "not stated",
			files: licenseFiles(directory),
		},
		dependencies: Object.keys(manifest.dependencies ?? {}),
	};
}

/**
 * Resolve dependencies, leaving out those that are not installed.
 * @param names The dependencies.
 * @param from The dependent's directory.
 * @returns Their directories.
 */
function resolveAll(names: readonly string[], from: string): string[] {
	return names.flatMap((name) => resolvePackage(name, from) ?? []);
}

/**
 * Whether a package is Archboard's own, or ships beside a platform package and not in it.
 * @param name The package.
 * @returns True when the notices leave it out.
 */
function unnoticed(name: string): boolean {
	return SEPARATE.has(name) || name.startsWith("@archboard/");
}

/**
 * The npm packages a platform package is built from: those the executable bundles, the build tools
 * that write into the browser bundle, and the production dependencies of the checkout with what
 * they depend on, which hold all that the browser bundle can import. Optional dependencies are
 * left out: they are the native packages of a build machine, which no bundle holds.
 * @param bundled The package directories that the executable bundles, relative to the checkout.
 * @returns The packages, by name and version.
 */
function npmPackages(bundled: readonly string[]): Licensed[] {
	const manifest = NpmManifest.parse(
		JSON.parse(readFileSync(path.join(CHECKOUT, "package.json"), "utf8")),
	);
	const leaves = [
		...bundled.map((directory) => path.join(CHECKOUT, directory)),
		...resolveAll(BUILD_TOOLS, CHECKOUT),
	];
	const roots = resolveAll(Object.keys(manifest.dependencies ?? {}), CHECKOUT);
	// The queue is a stack, so the production dependencies and all they depend on come first, and a
	// package that one of them depends on is followed although the executable bundles it too.
	const queue = [
		...leaves.map((directory) => ({ directory, follow: false })),
		...roots.map((directory) => ({ directory, follow: true })),
	];
	const seen = new Set<string>();
	const found: Licensed[] = [];
	for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
		const real = realpathSync(next.directory);
		if (seen.has(real)) continue;
		seen.add(real);
		const { licensed, dependencies } = npmPackage(real);
		if (unnoticed(licensed.name)) continue;
		found.push(licensed);
		const followed = next.follow ? resolveAll(dependencies, real) : [];
		queue.push(...followed.map((directory) => ({ directory, follow: true })));
	}
	return found;
}

const CargoMetadata = z.object({
	packages: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			version: z.string(),
			license: z.string().nullable(),
			manifest_path: z.string(),
		}),
	),
	resolve: z.object({
		nodes: z.array(
			z.object({
				id: z.string(),
				deps: z.array(
					z.object({
						pkg: z.string(),
						dep_kinds: z.array(z.object({ kind: z.string().nullable() })),
					}),
				),
			}),
		),
	}),
});

/**
 * The crates the renderer core is built from for WebAssembly: the normal dependencies of the two
 * core crates, transitively, less the crates of this repository.
 * @returns The crates, by name and version.
 * @throws {Error} When Cargo cannot describe the workspace.
 */
function coreCrates(): Licensed[] {
	const asked = Bun.spawnSync(
		[
			"cargo",
			"metadata",
			"--format-version",
			"1",
			"--locked",
			"--offline",
			"--filter-platform",
			"wasm32-unknown-unknown",
		],
		{ cwd: CHECKOUT, stdout: "pipe", stderr: "pipe" },
	);
	if (asked.exitCode !== 0) {
		throw new Error(
			`cargo metadata failed. Run the release build inside \`nix develop\`, after \`bun run build\`:\n${asked.stderr.toString()}`,
		);
	}
	const metadata = CargoMetadata.parse(JSON.parse(asked.stdout.toString()));
	const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
	const queue = metadata.packages
		.filter((crate) => CORE_CRATES.has(crate.name))
		.map(({ id }) => id);
	const seen = new Set<string>();
	for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
		if (seen.has(id)) continue;
		seen.add(id);
		const normal = (nodes.get(id)?.deps ?? []).filter((dependency) =>
			dependency.dep_kinds.some(({ kind }) => kind === null),
		);
		queue.push(...normal.map(({ pkg }) => pkg));
	}
	return metadata.packages
		.filter((crate) => seen.has(crate.id) && !crate.name.startsWith("archboard-"))
		.map((crate) => ({
			name: crate.name,
			version: crate.version,
			license: crate.license ?? "not stated",
			files: licenseFiles(path.dirname(crate.manifest_path)),
		}));
}

/**
 * A text as a fenced block that no line of it can close.
 * @param text The text.
 * @returns The block.
 */
function fenced(text: string): string {
	const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));
	const fence = "`".repeat(longest + 1);
	return `${fence}text\n${text}\n${fence}`;
}

/**
 * The text of a license file, with uniform line ends.
 * @param file The file.
 * @returns The text.
 */
function licenseText(file: string): string {
	return readFileSync(file, "utf8").replaceAll("\r\n", "\n").trimEnd();
}

/**
 * The packages as a list.
 * @param members The packages.
 * @returns One line for each.
 */
function packageList(members: readonly Licensed[]): string {
	return members
		.map(({ name, version, license }) => `- ${name} ${version} (${license})`)
		.join("\n");
}

/**
 * One section of notices: each distinct license text once, after the packages that carry it, and
 * the packages that carry no license file last. Texts that differ only in white space are one.
 * @param title The section heading.
 * @param introduction What the section covers.
 * @param packages Its packages.
 * @returns The section.
 */
function section(title: string, introduction: string, packages: readonly Licensed[]): string {
	const sorted = packages.toSorted(
		(left, right) =>
			left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
	);
	const texts = new Map<string, { text: string; members: Set<Licensed> }>();
	for (const licensed of sorted) {
		for (const text of licensed.files.map(licenseText)) {
			const key = text.replaceAll(/\s+/g, " ");
			const entry = texts.get(key) ?? { text, members: new Set<Licensed>() };
			entry.members.add(licensed);
			texts.set(key, entry);
		}
	}
	const carried = [...texts.values()].map(({ text, members }) => {
		const licenses = [...new Set([...members].map(({ license }) => license))].join(", ");
		return `### ${licenses}\n\n${packageList([...members])}\n\n${fenced(text)}`;
	});
	const unfiled = sorted.filter(({ files }) => files.length === 0);
	const without =
		unfiled.length === 0
			? []
			: [
					`### Without a license file\n\nThese packages carry no license file. Their manifest names the license.\n\n${packageList(unfiled)}`,
				];
	return [`## ${title}`, introduction, ...carried, ...without].join("\n\n");
}

/**
 * The fonts that the shell and the renderer core carry, with their license texts.
 * @returns The section.
 */
function fontSection(): string {
	const files = readdirSync(FONTS).toSorted();
	const faces = files.filter((file) => file.endsWith(".ttf"));
	const licenses = files.filter((file) => file.startsWith("OFL-"));
	return [
		"## Fonts",
		"The browser bundle and the renderer core carry these fonts. Each is licensed under the SIL Open Font License 1.1.",
		faces.map((face) => `- ${face}`).join("\n"),
		...licenses.map((file) => `### ${file}\n\n${fenced(licenseText(path.join(FONTS, file)))}`),
	].join("\n\n");
}

/**
 * The THIRD_PARTY_NOTICES.md of a platform package.
 * @param release What the package holds.
 * @param release.version The Archboard version.
 * @param release.bundledPackages The npm package directories the executable bundles, relative to
 * the checkout.
 * @returns The document.
 */
function thirdPartyNotices(release: {
	readonly version: string;
	readonly bundledPackages: readonly string[];
}): string {
	const prLens = readFileSync(PR_LENS_NOTICE, "utf8")
		.replace(/^# .*\n/, "")
		.replaceAll(/^#/gm, "##");
	return `${[
		"# Third-party notices",
		`Archboard ${release.version} is licensed under the Business Source License 1.1 in \`LICENSE\`. This package also holds material under other licenses. These are its notices.`,
		"## Bun",
		`\`bin/archboard\` is a Bun ${Bun.version} executable. Bun is licensed under the MIT License and includes other libraries, such as JavaScriptCore under the GNU Lesser General Public License 2.0. https://github.com/oven-sh/bun/blob/bun-v${Bun.version}/LICENSE.md names them all.`,
		"## Codex",
		"Codex is not part of this package. npm installs it as the dependency `@openai/codex-<platform>`, licensed under the Apache License 2.0, with its own license.",
		`## PR Lens\n${prLens.trimEnd()}`,
		fontSection(),
		section(
			"Rust crates",
			"The renderer core in `core/` and the painter in `frontend/` are built from these crates.",
			coreCrates(),
		),
		section(
			"npm packages",
			"The executable and the browser bundle in `frontend/` are built from these packages.",
			npmPackages(release.bundledPackages),
		),
	].join("\n\n")}\n`;
}

export { thirdPartyNotices };
