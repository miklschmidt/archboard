import path from "node:path";
import type { CodexWorkbenchStorage } from "#server/protocol/generation/host.ts";

export interface CodexWorkbenchStorageInput {
	readonly rootDirectory: string;
	readonly ownerDirectory?: string;
}
/**
 * Derive private Codex paths from the installation root and optional process owner directory.
 * @param input The installation root and optional owner directory.
 * @returns The private storage paths.
 */
export function workbenchStorage(input: CodexWorkbenchStorageInput): CodexWorkbenchStorage {
	const root = path.resolve(input.rootDirectory);
	const ownerDirectory = path.resolve(input.ownerDirectory ?? path.join(root, "owner"));
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
