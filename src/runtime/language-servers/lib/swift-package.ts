// The Swift package that sourcekit-lsp answers about for a file, and whether
// it can answer there (ADR 0046, TASK-367.16).
//
// sourcekit-lsp owns its background index, including preparing the package
// on its first run. The client waits for workspace/synchronize with index=true
// before asking questions. Only a file no Package.swift holds is unready.

import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "@/runtime/language-servers/lib/languages";

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
 * The Swift package sourcekit-lsp starts in for a file, and why it cannot
 * answer there, if it cannot.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns The package; the checkout when no package holds the file.
 */
async function swiftPackageOf(root: string, file: string): Promise<Project> {
	const directory = await packageOf(root, file);
	if (directory === undefined) {
		return { root, unready: `no Package.swift holds ${path.dirname(file)}, so it has no index` };
	}
	return { root: directory };
}

export { swiftPackageOf };
