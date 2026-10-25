import { realpathSync } from "node:fs";
import path from "node:path";
import type { CodexWorkbenchStorage } from "#server/protocol/generation/host.ts";

export interface CodexWorkbenchStorageInput {
	readonly rootDirectory: string;
	readonly ownerDirectory?: string;
}

/**
 * A host-given directory with the symbolic links of its parent resolved, once. A link above
 * the directory is the machine's own layout, such as `/tmp` and `/var` on macOS. The directory
 * itself keeps its name, so the private-directory check still refuses it when it is a link, and
 * refuses a link that appears in the canonical path later.
 * @param directory The host-given directory.
 * @returns The directory below the real path of its parent, or the resolved path when the
 * parent cannot be resolved (the private-directory check then names why).
 */
function belowRealParent(directory: string): string {
	const resolved = path.resolve(directory);
	try {
		return path.join(realpathSync(path.dirname(resolved)), path.basename(resolved));
	} catch {
		return resolved;
	}
}

/**
 * Derive private Codex paths from the installation root and optional process owner directory.
 * @param input The installation root and optional owner directory.
 * @returns The private storage paths.
 */
export function workbenchStorage(input: CodexWorkbenchStorageInput): CodexWorkbenchStorage {
	const root = belowRealParent(input.rootDirectory);
	const ownerDirectory =
		input.ownerDirectory === undefined
			? path.join(root, "owner")
			: belowRealParent(input.ownerDirectory);
	const codexHome = path.join(root, "codex-home");
	return Object.freeze({
		root,
		ownerDirectory,
		codexHome,
		sqliteHome: path.join(root, "sqlite-home"),
		coordinatorDirectory: path.join(ownerDirectory, "coordinator"),
		epochRoot: path.join(ownerDirectory, "epoch"),
		configPath: path.join(codexHome, "config.toml"),
	});
}
