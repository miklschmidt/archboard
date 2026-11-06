// The Go workspace that gopls answers about for a file, and whether it can
// answer there (ADR 0046, TASK-575).
//
// gopls loads the packages of the directory it starts in through the go
// command, which finds the nearest `go.work` in that directory or above it,
// else the nearest `go.mod`. One server answers for every module a `go.work`
// uses, so it starts in the directory of the nearest `go.work` above the file,
// else in the module's own, no higher than the checkout. Only a file that no
// `go.mod` holds is unready, because the go command loads no package for it.

import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "#runtime/language-servers/operations/languages.ts";

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
 * Whether each directory holds a file of a name.
 * @param directories The directories.
 * @param name The file's name.
 * @returns For each directory, whether it does.
 */
function presentIn(directories: readonly string[], name: string): Promise<boolean[]> {
	return Promise.all(directories.map((directory) => exists(path.join(directory, name))));
}

/**
 * The Go workspace gopls starts in for a file, and why it cannot answer
 * there, if it cannot.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns The workspace; the checkout when no module holds the file.
 */
async function goWorkspaceOf(root: string, file: string): Promise<Project> {
	const directories = [path.dirname(path.join(root, file))];
	for (let at = directories[0] ?? root; at !== root && at.startsWith(root);) {
		at = path.dirname(at);
		directories.push(at);
	}
	const [works, modules] = await Promise.all([
		presentIn(directories, "go.work"),
		presentIn(directories, "go.mod"),
	]);
	const module = directories[modules.indexOf(true)];
	if (module === undefined) {
		return { root, unready: `no go.mod holds ${path.dirname(file)}, so it has no package` };
	}
	return { root: directories[works.indexOf(true)] ?? module };
}

export { goWorkspaceOf };
