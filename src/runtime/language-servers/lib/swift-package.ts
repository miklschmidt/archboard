// The Swift package that sourcekit-lsp answers about for a file, and whether
// it can answer there (ADR 0046, TASK-367.16).
//
// sourcekit-lsp finds a definition in another file through the index that a
// build of the package writes, `.build/debug/index/store`. The check never
// asks it to build, so a package that was never built has no index, and every
// answer about it would be a false "none". Such a package is not asked, and
// the pass says so once.
//
// The client turns background indexing off, because it builds the package's
// targets to prepare them. A `.sourcekit-lsp/config.json` in the package
// overrides what the client sends, so a package whose file turns background
// indexing on is not asked either. A Swift file that no `Package.swift` holds
// has no index the check can find.
//
// The session asks once in a pass for the package of each directory, and this
// module looks at each package's configuration and index once, however many
// of its directories the pass asks about, so every directory of a package
// gets the same answer.

import fs from "node:fs/promises";
import path from "node:path";
import type { Once, Project } from "@/runtime/language-servers/lib/languages";

/**
 * Whether a file exists.
 * @param file The file.
 * @returns True when it does.
 */
async function exists(file: string): Promise<boolean> {
	return fs.stat(file).then(
		() => true,
		() => false,
	);
}

/**
 * The directory of the nearest `Package.swift` that holds a file, no higher
 * than the checkout.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns The package's directory, or undefined when no package holds the file.
 */
async function packageOf(root: string, file: string): Promise<string | undefined> {
	const directories = [path.dirname(path.join(root, file))];
	for (let at = directories[0] ?? root; at !== root && at.startsWith(root);) {
		at = path.dirname(at);
		directories.push(at);
	}
	const found = await Promise.all(
		directories.map((directory) => exists(path.join(directory, "Package.swift"))),
	);
	return directories[found.indexOf(true)];
}

/**
 * Whether the package's own sourcekit-lsp configuration turns background
 * indexing on. A file that is not valid JSON turns nothing on: the server
 * ignores it.
 * @param directory The package.
 * @returns True when it does.
 */
async function buildsInBackground(directory: string): Promise<boolean> {
	try {
		const text = await fs.readFile(path.join(directory, ".sourcekit-lsp", "config.json"), "utf8");
		const options: unknown = JSON.parse(text);
		return typeof options === "object" && options !== null && "backgroundIndexing" in options
			? options.backgroundIndexing === true
			: false;
	} catch {
		return false;
	}
}

/**
 * Whether a build wrote an index for the package: a unit in a version of the
 * index store under `.build/debug`, where `swift build` writes it and where
 * sourcekit-lsp reads it with background indexing off.
 * @param directory The package.
 * @returns True when it has one.
 */
async function indexed(directory: string): Promise<boolean> {
	const store = path.join(directory, ".build", "debug", "index", "store");
	const versions = await fs.readdir(store).catch(() => []);
	const units = await Promise.all(
		versions.map((version) => fs.readdir(path.join(store, version, "units")).catch(() => [])),
	);
	return units.some((each) => each.length > 0);
}

/**
 * The Swift package sourcekit-lsp starts in for a file, and why it cannot
 * answer there, if it cannot.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @param once A look the pass does once for each package.
 * @returns The package; the checkout when no package holds the file.
 */
async function swiftPackageOf(root: string, file: string, once: Once): Promise<Project> {
	const directory = await packageOf(root, file);
	if (directory === undefined) {
		return { root, unready: `no Package.swift holds ${path.dirname(file)}, so it has no index` };
	}
	return once(`swift-package\0${directory}`, () => packageAt(root, directory));
}

/**
 * A package sourcekit-lsp starts in, and why it cannot answer there, if it
 * cannot.
 * @param root The checkout, absolute.
 * @param directory The package.
 * @returns The package.
 */
async function packageAt(root: string, directory: string): Promise<Project> {
	const name = path.relative(root, directory) || ".";
	if (await buildsInBackground(directory)) {
		return {
			root: directory,
			unready: `the package ${name} turns background indexing on in .sourcekit-lsp/config.json, which builds`,
		};
	}
	if (!(await indexed(directory))) {
		return {
			root: directory,
			unready: `the package ${name} has no index: build it once with swift build`,
		};
	}
	return { root: directory };
}

export { swiftPackageOf };
