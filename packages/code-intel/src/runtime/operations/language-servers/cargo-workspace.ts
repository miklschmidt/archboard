// The Cargo workspace that rust-analyzer answers about for a file, and
// whether it can answer there (ADR 0046, TASK-540).
//
// rust-analyzer loads the workspace of the directory it starts in: it runs
// `cargo metadata`, builds the crate graph, runs the build scripts and builds
// the procedural macros, as an editor's does. One server answers for every
// member of a workspace, so it starts in the directory of the nearest
// `Cargo.toml` above the file that declares a `[workspace]`, else in the
// package's own, no higher than the checkout. Only a file no `Cargo.toml`
// holds is unready.

import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "#runtime/operations/language-servers/languages.ts";

/**
 * The text of a manifest in a directory, if it has one.
 * @param directory The directory.
 * @returns The text, or undefined.
 */
async function manifestIn(directory: string): Promise<string | undefined> {
	return fs.readFile(path.join(directory, "Cargo.toml"), "utf8").catch(() => undefined);
}

/**
 * Whether a manifest declares a workspace.
 * @param text The manifest.
 * @returns True when it does.
 */
function declaresWorkspace(text: string): boolean {
	try {
		return Object.hasOwn(Bun.TOML.parse(text), "workspace");
	} catch {
		return false;
	}
}

/**
 * The Cargo workspace rust-analyzer starts in for a file, and why it cannot
 * answer there, if it cannot.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns The workspace; the checkout when no manifest holds the file.
 */
async function cargoWorkspaceOf(root: string, file: string): Promise<Project> {
	const directories = [path.dirname(path.join(root, file))];
	for (let at = directories[0] ?? root; at !== root && at.startsWith(root);) {
		at = path.dirname(at);
		directories.push(at);
	}
	const manifests = await Promise.all(directories.map(manifestIn));
	const held = directories.find((_, index) => manifests[index] !== undefined);
	const workspace = directories.find(
		(_, index) => manifests[index] !== undefined && declaresWorkspace(manifests[index] ?? ""),
	);
	const directory = workspace ?? held;
	if (directory === undefined) {
		return { root, unready: `no Cargo.toml holds ${path.dirname(file)}, so it has no crate` };
	}
	return { root: directory };
}

export { cargoWorkspaceOf };
